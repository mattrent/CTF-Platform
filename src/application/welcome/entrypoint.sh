#!/bin/sh
envsubst '$STEP_CA_HOST $CA_FINGERPRINT'  < /app/index.html > /app/index.html.tmp
mv /app/index.html.tmp /app/index.html