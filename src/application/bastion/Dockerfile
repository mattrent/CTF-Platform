FROM alpine:latest

# Install necessary packages (linux-pam and dumb-init)
RUN apk add --update dumb-init openssh linux-pam shadow

# Copy generated keys from the base stage
# RUN ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""
# RUN ssh-keygen -t rsa -b 2048 -f /etc/ssh/ssh_host_rsa_key -N ""
RUN ssh-keygen -t ecdsa -f /etc/ssh/ssh_host_ecdsa_key -N ""

# PAM configuration for creating home directories on login
RUN echo 'session required pam_mkhomedir.so skel=/etc/skel/ umask=0077' >> /etc/pam.d/sshd

# Create user and ensure account is not locked without setting a password
RUN useradd -m -s /bin/sh kilar20 && \
    usermod -p '*' kilar20

# Ensure SSH configuration directory exists
RUN mkdir -p /etc/ssh/sshd_config.d/

# Copy the init.sh script
COPY init.sh /bastion/init.sh

# Copy SSH bastion config
COPY sshd_bastion.conf /etc/ssh/sshd_config.d/

# https://github.com/Yelp/dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Command to run
CMD ["/bastion/init.sh"]