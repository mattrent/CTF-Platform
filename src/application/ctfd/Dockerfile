FROM ctfd/ctfd:3.7.3

COPY ctf/frontend/container_challenges /opt/CTFd/CTFd/plugins/container_challenges
COPY ctfd/oidc /opt/CTFd/CTFd/plugins/ctfd_oidc

# RUN pip install --no-cache-dir -r /opt/CTFd/CTFd/plugins/container_challenges/requirements.txt
RUN pip install --no-cache-dir -r /opt/CTFd/CTFd/plugins/ctfd_oidc/requirements.txt