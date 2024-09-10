import os

from CTFd import utils
from CTFd.models import Users, db
from CTFd.utils import set_config
from CTFd.utils.security.auth import login_user
from flask import json, redirect, session, url_for


def load(app):
    # --------------------------- plugin configuration --------------------------- #

    PLUGIN_PATH = os.path.dirname(__file__)
    with open(f"{PLUGIN_PATH}/config.json") as config_file:
        CONFIG = json.load(config_file)

    oidc_client_id = CONFIG['OOIDC_CLIENT_ID']
    oidc_client_secret = CONFIG['OIDC_CLIENT_SECRET']
    oidc_provider = CONFIG['OAUTHLOGIN_PROVIDER']

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
        return create_user(username, displayName)
    
# -------------------------- Endpoint configuration -------------------------- #

    @app.route('/keycloak', methods=['GET'])
    def keycloak():
        provider_user = None  # create user with keycloak
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
