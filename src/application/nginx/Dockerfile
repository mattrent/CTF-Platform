FROM nginx:stable-alpine3.20-perl

ARG NGINX_CONF

COPY ${NGINX_CONF} /etc/nginx/nginx.conf
COPY entrypoint.sh /docker-entrypoint.d/entrypoint.sh
RUN chmod +x /docker-entrypoint.d/entrypoint.sh
EXPOSE 3080
