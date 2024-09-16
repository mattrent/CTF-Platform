import os

from CTFd.models import Users, db
from CTFd.utils import set_config
from CTFd.utils.security.auth import login_user
from flask import current_app, json, redirect, request, session, url_for
from keycloak import KeycloakOpenID


def load(app):
    # --------------------------- plugin configuration --------------------------- #

    PLUGIN_PATH = os.path.dirname(__file__)
    with open(f"{PLUGIN_PATH}/config.json", encoding="utf-8") as config_file:
        config = json.load(config_file)

    oidc_client_id = config['OIDC_CLIENT_ID']
    oidc_client_secret = config['OIDC_CLIENT_SECRET']
    oidc_server = config['OIDC_SERVER']
    oidc_realm = config['OIDC_REALM']

    # ---------------------------- login functionality --------------------------- #

    def retrieve_user_from_database(email):
        user = Users.query.filter_by(email=email).first()
        if user is not None:
            return user

    def create_user(email, name):
        with app.app_context():
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

    # -------------------------- Endpoint configuration -------------------------- #

    keycloak_openid = KeycloakOpenID(
        server_url=oidc_server,
        client_id=oidc_client_id,
        realm_name=oidc_realm,
        client_secret_key=oidc_client_secret,
        verify=False
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
            userinfo = keycloak_openid.userinfo(token['access_token'])
        except ValueError as e:
            # Handle token exchange or userinfo retrieval errors
            return str(e), 400
        
        session['token'] = token

        email = userinfo['email']
        name = userinfo['name']
        provider_user = create_or_get_user(email, name)

        print("-----token-----", token)

        with app.app_context():
            # ? Find better solution? Reattach the user instance
            provider_user = db.session.merge(provider_user)
            login_user(provider_user)
            
        return redirect(current_app.config.get("APPLICATION_ROOT"))

    # ------------------------ Application Reconfiguration ----------------------- #

    set_config('registration_visibility', False)
    app.view_functions['auth.login'] = lambda: redirect(url_for('keycloak'))
    app.view_functions['auth.register'] = lambda: ('', 204)
    app.view_functions['auth.reset_password'] = lambda: ('', 204)
    app.view_functions['auth.confirm'] = lambda: ('', 204)
