FROM alpine:3.21

RUN apk add --no-cache openssh sshpass

WORKDIR /main

COPY script.sh .
RUN chmod +x script.sh

ENTRYPOINT ["./script.sh"]