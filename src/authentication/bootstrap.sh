#!/bin/bash

export STEPDEBUG=1

fingerprint=$(
    curl -k https://myhost/roots.pem | 
    openssl x509 -noout -sha256 -fingerprint | 
    sed 's/://g' | 
    tr 'A-F' 'a-f' | 
    awk -F= '{print $2}'
)

echo $fingerprint

# https://github.com/smallstep/cli/blob/3d38cfeadb8f90e8b916a7b7e9c1d4fe9e80a43f/command/oauth/cmd.go#L331
# ! only works with port-forwarding at the momemnt :))
step ca bootstrap --ca-url https://myhost --fingerprint $fingerprint -f

eval $(ssh-agent)

# step will expect to be able to perform a TLS handshake with the proxy, and use the CA's root certificate to complete the trust chain. So, for inbound TLS connections, the proxy should use a server certificate issued by step-ca. See below for an example.

# Layer 4 (Transport Layer): This deals with transportation of data between systems. It doesn’t concern itself with what the data is, but with the movement of the data packets. In a layer 4 proxy, this means forwarding traffic based purely on TCP/UDP protocols without looking at the actual content. This is often referred to as "TLS passthrough" because the proxy doesn’t terminate the SSL/TLS connection—it just passes it through to the backend server.

# Layer 7 (Application Layer): This goes a step further, inspecting and potentially modifying the data itself because it operates at the application level. A layer 7 proxy can make decisions based on HTTP headers, cookies, and other data in the web traffic, allowing for more sophisticated routing and filtering. The proxy terminates the SSL/TLS connection, decrypts the data, and then possibly re-encrypts it before sending it to the backend server.

# Layer 1 - Physical: Deals with the physical connection between devices, including cables and switches.

# Layer 2 - Data Link: Manages data transfer between adjacent network nodes, using MAC addresses.

# Layer 3 - Network: Handles routing of data packets using IP addresses.

# Layer 4 - Transport: Ensures reliable data transfer with error correction and flow control (e.g., TCP/UDP).

# Layer 5 - Session: Manages sessions or connections between applications.

# Layer 6 - Presentation: Translates data between the application layer and the network, dealing with data encryption and compression.

# Layer 7 - Application: Provides network services directly to end-user applications, such as web browsers and email clients.

# The Root function in the step-ca client code requires no TLS termination because it relies on a direct, secure connection to the CA to ensure the integrity and authenticity of the root certificate. Here’s a detailed explanation:

# Key Points of the Root Function
# Direct HTTPS Request:
# Go

# resp, err := c.httpClient.Get(c.baseURL + "/root/" + fingerprint)
# Kode genereret af kunstig intelligens. Gennemse og brug forsigtigt. Flere oplysninger om ofte stillede spørgsmål.
# This line makes an HTTPS request to the CA to retrieve the root certificate. The httpClient is configured to establish a secure TLS connection directly to the CA.
# Certificate Validation:
# Go

# defer resp.Body.Close()
# // Parse and validate the certificate
# Kode genereret af kunstig intelligens. Gennemse og brug forsigtigt. Flere oplysninger om ofte stillede spørgsmål.
# After receiving the response, the function parses and validates the certificate. This validation process ensures that the certificate matches the expected fingerprint and is trusted.
# Why No TLS Termination is Required
# End-to-End Encryption:
# The Root function expects the entire communication path to be encrypted from the client to the CA. TLS termination at the ingress would break this end-to-end encryption, as the ingress would decrypt and then re-encrypt the traffic. This intermediate step can introduce security risks and prevent the client from validating the CA’s certificate directly.
# Certificate Integrity:
# The client needs to ensure that the root certificate it receives is authentic and has not been tampered with. By maintaining a direct TLS connection, the client can securely retrieve and validate the certificate against the provided fingerprint. Any interruption in this secure channel could compromise the integrity of the certificate.
# Security Policies:
# The step CLI and step-ca are designed with strict security policies that require direct, secure communication with the CA. Allowing TLS termination would violate these policies and potentially expose the communication to man-in-the-middle attacks.
# Summary
# In summary, the Root function requires a direct, uninterrupted TLS connection to ensure the security and integrity of the root certificate retrieval process. SSL passthrough is necessary to maintain this secure connection from the client to the CA, preventing any intermediate decryption and re-encryption that could compromise the security.

# // BootstrapClient is a helper function that using the given bootstrap token
# // return an http.Client configured with a Transport prepared to do TLS
# // connections using the client certificate returned by the certificate
# // authority. By default the server will kick off a routine that will renew the
# // certificate after 2/3rd of the certificate's lifetime has expired.
# //
# // Usage:
# //
# //	// Default example with certificate rotation.
# //	client, err := ca.BootstrapClient(ctx.Background(), token)
# //
# //	// Example canceling automatic certificate rotation.
# //	ctx, cancel := context.WithCancel(context.Background())
# //	defer cancel()
# //	client, err := ca.BootstrapClient(ctx, token)
# //	if err != nil {
# //	  return err
# //	}
# //	resp, err := client.Get("https://internal.smallstep.com")
# func BootstrapClient(ctx context.Context, token string, options ...TLSOption) (*http.Client, error) {
# 	b, err := createBootstrap(token) //nolint:contextcheck // deeply nested context; temporary
# 	if err != nil {
# 		return nil, err
# 	}

# 	// Make sure the tlsConfig has all supported roots on RootCAs.
# 	//
# 	// The roots request is only supported if identity certificates are not
# 	// required. In all cases the current root is also added after applying all
# 	// options too.
# 	if !b.RequireClientAuth {
# 		options = append(options, AddRootsToRootCAs())
# 	}

# 	transport, err := b.Client.Transport(ctx, b.SignResponse, b.PrivateKey, options...)
# 	if err != nil {
# 		return nil, err
# 	}

# 	return &http.Client{
# 		Transport: transport,
# 	}, nil
# }


# The real trust chain verification happens because of the setup performed by the transport layer. Here’s how it works:

# Add Root Certificate:

# go

# Kopiér
# options = append(options, AddRootsToRootCAs())
# This function ensures the root certificate is included in the client's trust store, making it available for the TLS handshake.

# Transport Configuration:

# go

# Kopiér
# transport, err := b.Client.Transport(ctx, b.SignResponse, b.PrivateKey, options...)
# This sets up the transport layer with the necessary certificates and keys. The Transport method configures the client to use these certificates for TLS connections.

# TLSConfig Setup: The Transport function uses the root certificate to create a tls.Config object. This object is part of the Go standard library and handles the TLS handshake.

# Here's a snippet of what happens under the hood in the Transport method:

# go

# Kopiér
# tlsConfig := &tls.Config{
#     Certificates: []tls.Certificate{clientCert},
#     RootCAs:      rootCertPool,
# }
# TLS Handshake: When the client makes a request, the tls.Config object handles the TLS handshake, verifying the server’s certificate against the root certificates in the rootCertPool.

# So, the key part of the process is the creation and configuration of the tls.Config object, which includes the root certificate and client certificate. This configuration allows the TLS handshake to verify the server certificate and complete the trust chain


# Ah, let me clarify that. The BootstrapServer function in step-ca sets up the server's TLS configuration, ensuring it can handle secure inbound TLS connections. This is more about the server's preparation to securely interact with clients.

# When you use the step ca bootstrap command with the step-cli, it interacts with the step-ca server to download the root certificate and configure the client environment. The client-side setup is done by the BootstrapClient function, ensuring the client can make secure connections to the server.

# So, while BootstrapServer prepares the server, the client’s bootstrap process is handled by BootstrapClient. Both sides work together to ensure secure communication, but they handle different parts of the setup.


# Yes, you’ve got it! When the BootstrapClient function returns an http.Client object, it’s the step-cli that receives it. Specifically, the step-cli uses this returned http.Client to make secure HTTP requests to the step-ca server.

# So, the client configured by BootstrapClient allows the step-cli to securely communicate with the CA server, leveraging the configured TLS settings to ensure the trust chain is validated.