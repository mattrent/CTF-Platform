import datetime
import os

import jwcrypto
from CTFd.cache import clear_challenges, clear_standings, clear_user_session
from CTFd.models import Users, db
from CTFd.schemas.users import UserSchema
from CTFd.utils import set_config
from CTFd.utils.decorators import authed_only
from CTFd.utils.security.auth import login_user, logout_user
from flask import current_app, json, redirect, request, session, url_for
from keycloak import KeycloakOpenID, KeycloakPostError

from .utils import Role


def load(app):
    # --------------------------- plugin configuration --------------------------- #

    PLUGIN_PATH = os.path.dirname(__file__)
    with open(f"{PLUGIN_PATH}/config.json", encoding="utf-8") as config_file:
        config = json.load(config_file)

    oidc_client_id = config['OIDC_CLIENT_ID']
    oidc_client_secret = config['OIDC_CLIENT_SECRET']
    oidc_server = config['OIDC_SERVER']
    oidc_realm = config['OIDC_REALM']
    cert_bundle = config['CERT_BUNDLE']

    # ---------------------------- login functionality --------------------------- #

    def retrieve_user_from_database(email):
        user = Users.query.filter_by(email=email).first()
        if user is not None:
            return user

    def create_user(email, name):
        user = Users(email=email, name=name)
        db.session.add(user)
        db.session.commit()
        db.session.flush()
        return user

    def create_or_get_user(email, name):
        user = retrieve_user_from_database(email)
        if user is not None:
            return user
        return create_user(email, name)

    def patch_user(user_id, data):
        user = Users.query.filter_by(id=user_id).first_or_404()
        data["id"] = user_id

        schema = UserSchema(view="admin", instance=user, partial=True)
        response = schema.load(data)
        if response.errors:
            return {"success": False, "errors": response.errors}, 400

        # This generates the response first before actually changing the type
        # This avoids an error during User type changes where we change
        # the polymorphic identity resulting in an ObjectDeletedError
        # https://github.com/CTFd/CTFd/issues/1794
        response = schema.dump(response.data)
        db.session.commit()
        db.session.close()

        clear_user_session(user_id=user_id)
        clear_standings()
        clear_challenges()

    # -------------------------- Endpoint configuration -------------------------- #

    # https://python-keycloak.readthedocs.io/en/latest/reference/keycloak/index.html
    keycloak_openid = KeycloakOpenID(
        server_url=oidc_server,
        client_id=oidc_client_id,
        realm_name=oidc_realm,
        client_secret_key=oidc_client_secret,
        verify=cert_bundle if cert_bundle else True
    )

    @app.route('/keycloak', methods=['GET'])
    def keycloak():
        # Redirect to Keycloak for authentication
        auth_url = keycloak_openid.auth_url(
            redirect_uri=url_for('keycloak_callback', _external=True),
            scope='openid'
        )
        return redirect(auth_url)

    @app.route('/keycloak/callback', methods=['GET'])
    def keycloak_callback():
        # Handle the callback from Keycloak
        code = request.args.get('code')
        try:
            token = keycloak_openid.token(
                grant_type='authorization_code',
                code=code,
                redirect_uri=url_for('keycloak_callback', _external=True)
            )
        except ValueError as e:
            # Handle token exchange or userinfo retrieval errors
            return str(e), 400

        session['token'] = token
        access_token = token['access_token']

        access_token_decoded = keycloak_openid.decode_token(access_token)

        try:
            resource_access = access_token_decoded['resource_access']
            ctfd = resource_access['ctfd']
            roles = ctfd['roles']
        except KeyError:
            keycloak_openid.logout(token['refresh_token'])
            return "missing required role", 400

        email = access_token_decoded['email']
        name = access_token_decoded['name']
        verified = access_token_decoded['email_verified']

        with app.app_context():
            provider_user = create_or_get_user(email, name)
            login_user(provider_user)

            if verified != provider_user.verified:
                provider_user.verified = verified
                db.session.commit()
                db.session.flush()

            if Role.ADMIN in roles and Role.ADMIN != provider_user.type:
                patch_user(provider_user.id, {'type': Role.ADMIN.value})
            elif Role.USER in roles and Role.ADMIN not in roles and Role.USER != provider_user.type:
                patch_user(provider_user.id, {'type': Role.USER.value})

        return redirect(current_app.config.get('APPLICATION_ROOT'))

    @authed_only
    @app.route('/keycloak-logout', methods=['GET'])
    def keycloak_logout():
        try:
            # SSO logout
            keycloak_openid.logout(session['token']['refresh_token'])
        except (KeyError, KeycloakPostError):
            # User not logged in via Keycloak
            #   do not care
            pass

        # Logout from CTFd
        logout_user()

        return redirect(current_app.config.get('APPLICATION_ROOT'))

    @authed_only
    @app.before_request
    def get_new_access_if_expired():
        if 'token' not in session:
            return

        expired = False
        now = datetime.datetime.now().timestamp()
        token = session["token"]

        try:
            access_token = keycloak_openid.decode_token(token['access_token'])
            exp = access_token["exp"]
            if exp - 10 < now:
                expired = True
        except jwcrypto.jwt.JWTExpired:
            expired = True

        if expired:
            # Refresh token
            try:
                token = keycloak_openid.refresh_token(token['refresh_token'])
                session['token'] = token
            # Or logout the user if the token is invalid
            except KeycloakPostError:
                logout_user()
                return app.view_functions['auth.login']()

    # ------------------------ Application Reconfiguration ----------------------- #

    set_config("registration_visibility", "private")  # ? overwritten by setup
    app.view_functions['auth.login'] = lambda: redirect(url_for('keycloak'))
    app.view_functions['auth.logout'] = lambda: redirect(
        url_for('keycloak_logout'))
    app.view_functions['auth.register'] = lambda: ('', 204)
    app.view_functions['auth.reset_password'] = lambda: ('', 204)
    app.view_functions['auth.confirm'] = lambda: ('', 204)
