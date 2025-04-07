#!/bin/sh
envsubst '$STEP_CA_HOST $CA_FINGERPRINT $BASTION_HOST $SSH_PUB_CERT $DEPLOYER_HOST $GRAFANA_URL $KEYCLOAK_URL $CTFD_URL $UNLEASH_URL $REGISTER_LINK'  < /app/index.html > /app/index.html.tmp
mv /app/index.html.tmp /app/index.html