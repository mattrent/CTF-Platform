#!/bin/sh
step ssh renew /etc/ssh/ssh_host_ecdsa_key-cert.pub /etc/ssh/ssh_host_ecdsa_key --force
kill -HUP $(ps | grep '[s]shd' | awk '{print $1}')