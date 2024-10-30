FROM ctfd/ctfd:3.7.3

COPY ctf/frontend/container_challenges /opt/CTFd/CTFd/plugins/container_challenges

# TODO Should not be necessary
RUN pip install --no-cache-dir -r /opt/CTFd/CTFd/plugins/container_challenges/requirements.txt