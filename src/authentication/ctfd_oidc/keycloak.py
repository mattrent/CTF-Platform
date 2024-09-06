from flask import Blueprint, render_template, session, redirect
from flask_dance.contrib import azure, github
import flask_dance.contrib

from CTFd.auth import confirm, register, reset_password, login
from CTFd.models import db, Users
from CTFd.utils import set_config
from CTFd.utils.logging import log
from CTFd.utils.security.auth import login_user, logout_user

from CTFd import utils

def load(app):
    ########################
    # Plugin Configuration #
    ########################
    authentication_url_prefix = "/auth"
    oauth_client_id = utils.get_app_config('OAUTHLOGIN_CLIENT_ID')
    oauth_client_secret = utils.get_app_config('OAUTHLOGIN_CLIENT_SECRET')
    oauth_provider = utils.get_app_config('OAUTHLOGIN_PROVIDER')
    create_missing_user = utils.get_app_config('OAUTHLOGIN_CREATE_MISSING_USER')

    ##################
    # User Functions #
    ##################
    def retrieve_user_from_database(username):
        user = Users.query.filter_by(email=username).first()
        if user is not None:
            log('logins', "[{date}] {ip} - " + user.name + " - OAuth2 bridged user found")
            return user
        
    def create_user(username, displayName):
        with app.app_context():
            log('logins', "[{date}] {ip} - " + user.name + " - No OAuth2 bridged user found, creating user")
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
            log('logins', "[{date}] {ip} - " + user.name + " - No OAuth2 bridged user found and not configured to create missing users")
            return None

    ##########################
    # Provider Configuration #
    ##########################
    oidc_blueprint = Blueprint('oidc_blueprint', __name__)
    app.register_blueprint(oidc_blueprint, url_prefix=authentication_url_prefix)

    #######################
    # Blueprint Functions #
    #######################
    @oidc_blueprint.route('/', methods=['GET'])
    def confirm_auth_provider(auth_provider):
        provider_user = "" # create user with keycloak
        session.regenerate()

        if provider_user is not None:
            login_user(provider_user)
        return redirect('/')

    ###############################
    # Application Reconfiguration #
    ###############################
    # ('', 204) is "No Content" code
    set_config('registration_visibility', False)
    app.view_functions['auth.login'] = lambda: redirect(authentication_url_prefix)
    app.view_functions['auth.register'] = lambda: ('', 204)
    app.view_functions['auth.reset_password'] = lambda: ('', 204)
    app.view_functions['auth.confirm'] = lambda: ('', 204)     