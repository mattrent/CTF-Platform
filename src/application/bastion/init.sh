#!/bin/sh

# Generate SSH host key
# TODO Get pubkey signed by Step
ssh-keygen -t ecdsa -f /etc/ssh/ssh_host_ecdsa_key -N ""

# don't detach, send output to stderr
/usr/sbin/sshd -D -e