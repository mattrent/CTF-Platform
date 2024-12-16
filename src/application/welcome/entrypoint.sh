#!/bin/sh
envsubst '$STEP_CA_HOST $CA_FINGERPRINT $BASTION_HOST $SSH_PUB_CERT'  < /app/index.html > /app/index.html.tmp
mv /app/index.html.tmp /app/index.html