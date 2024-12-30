#!/bin/sh

envsubst '$PROXY_PASS_URL $SERVER_NAME' < /etc/nginx/nginx.conf > /etc/nginx/nginx.tmp
mv /etc/nginx/nginx.tmp /etc/nginx/nginx.conf

echo THIS IS THE PID
cat /var/run/nginx.pid

if [ -n "$ACME_SERVER" ]; then
    certbot --nginx -n --agree-tos --email snubikian@gmail.com --server "$ACME_SERVER" -d "$(echo "$SERVER_NAME" | tr ' ' ',')" --no-verify-ssl
    echo "downloaded certificate"
    nginx -s quit # otherwise cause conflict with Docker CMD
    echo "stopped nginx"
else
    echo "ACME_SERVER is not set. Skipping certbot command."
fi