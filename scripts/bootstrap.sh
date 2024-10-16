#!/bin/bash

fingerprint=$(
    curl -k https://myhost/roots.pem | 
    openssl x509 -noout -sha256 -fingerprint | 
    sed 's/://g' | 
    tr 'A-F' 'a-f' | 
    awk -F= '{print $2}'
)

echo Root certificate fingerprint: $fingerprint

step ca bootstrap --ca-url https://myhost \
    --fingerprint $fingerprint \
    --force \
    --install

eval $(ssh-agent)