FROM nginx:stable-alpine3.20-perl

ARG NGINX_CONF
ARG CERTBOT_OPTIONS
ARG ENABLE_CERTBOT=false
ENV SERVER_NAME=_

# Copy nginx configuration
COPY ${NGINX_CONF} /etc/nginx/nginx.conf
COPY entrypoint.sh /docker-entrypoint.d/entrypoint.sh
RUN chmod +x /docker-entrypoint.d/entrypoint.sh

RUN if [ "$ENABLE_CERTBOT" = "true" ]; then \
    apk add --no-cache certbot certbot-nginx && \
    echo "#!/bin/sh" > /etc/periodic/daily/renewcert.sh && \
    echo "echo \$(ps -a | grep 'nginx: master process' | grep -v 'grep' | awk '{print \$1}') > /var/run/nginx.pid" >> /etc/periodic/daily/renewcert.sh && \
    echo "certbot renew ${CERTBOT_OPTIONS}" >> /etc/periodic/daily/renewcert.sh && \
    chmod +x /etc/periodic/daily/renewcert.sh; \
    else \
    echo -e "0\t4,16\t*\t*\t*\trun-parts /etc/periodic/custom" >> /etc/crontabs/root && \
    mkdir /etc/periodic/custom && \
    echo "#!/bin/sh" > /etc/periodic/custom/renewcert.sh && \
    echo "nginx -s reload" >> /etc/periodic/custom/renewcert.sh && \
    chmod +x /etc/periodic/custom/renewcert.sh; \
    fi

EXPOSE 3080 80 443
