from flask import session, redirect, url_for

from CTFd.models import db, Users
from CTFd.utils import set_config
from CTFd.utils.security.auth import login_user

from CTFd import utils

def load(app):
# --------------------------- plugin configuration --------------------------- #
    authentication_url_prefix = "/auth"
    oauth_client_id = utils.get_app_config('OAUTHLOGIN_CLIENT_ID')
    oauth_client_secret = utils.get_app_config('OAUTHLOGIN_CLIENT_SECRET')
    oauth_provider = utils.get_app_config('OAUTHLOGIN_PROVIDER')
    create_missing_user = utils.get_app_config('OAUTHLOGIN_CREATE_MISSING_USER')

# ---------------------------- login functionality --------------------------- #
    def retrieve_user_from_database(username):
        user = Users.query.filter_by(email=username).first()
        if user is not None:
            return user
        
    def create_user(username, displayName):
        with app.app_context():
            user = Users(email=username, name=displayName.strip())
            db.session.add(user)
            db.session.commit()
            db.session.flush()
            return user
        
    def create_or_get_user(username, displayName):
        user = retrieve_user_from_database(username)
        if user is not None:
            return user
        if create_missing_user:
            return create_user(username, displayName)
        else:
            return None

# -------------------------- Endpoint configuration -------------------------- #
    @app.route('/auth', methods=['GET'])
    def keycloak():
        provider_user = None # create user with keycloak
        session.regenerate()

        if provider_user is not None:
            login_user(provider_user)
        return redirect('/')

# ------------------------ Application Reconfiguration ----------------------- #
    set_config('registration_visibility', False)
    app.view_functions['auth.login'] = lambda: redirect(url_for('keycloak'))
    app.view_functions['auth.register'] = lambda: ('', 204)
    app.view_functions['auth.reset_password'] = lambda: ('', 204)
    app.view_functions['auth.confirm'] = lambda: ('', 204)