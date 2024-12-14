#!/bin/sh

# Generate SSH host key
cd /etc/ssh

step ca bootstrap \
    --ca-url step-step-certificates.dev.svc.cluster.local \
    --fingerprint ${CA_FINGERPRINT}

step ssh certificate ${KEY_ID} ssh_host_ecdsa_key \
    --host  \
    --issuer admin \
    --provisioner-password-file provisioner_password \
    --no-password --insecure
    
crond

# don't detach, send output to stderr
/usr/sbin/sshd -D -e