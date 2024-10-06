fingerprint=$(
    curl -k https://localhost/step-ca/roots.pem | 
    openssl x509 -noout -sha256 -fingerprint | 
    sed 's/://g' | 
    tr 'A-F' 'a-f' | 
    awk -F= '{print $2}'
)

# TODO https://minikube.sigs.k8s.io/docs/tutorials/custom_cert_ingress/
# openssl genpkey -algorithm RSA -out tls.key -pkeyopt rsa_keygen_bits:2048
# openssl req -new -key tls.key -out tls.csr -subj "/CN=yourdomain.com"
# openssl x509 -req -in tls.csr -signkey tls.key -out tls.crt -days 365
# minikube addons configure ingress

step ca bootstrap --ca-url https://localhost/step-ca \
    --fingerprint $fingerprint \
    --install