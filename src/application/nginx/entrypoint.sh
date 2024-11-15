#!/bin/sh

envsubst '$PROXY_PASS_URL' < /etc/nginx/nginx.conf > /etc/nginx/nginx.tmp
mv /etc/nginx/nginx.tmp /etc/nginx/nginx.conf