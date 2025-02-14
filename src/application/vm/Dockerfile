FROM python:3.14.0a5-slim-bullseye AS downlaod
WORKDIR /main
COPY requirements.txt .
COPY get_vm.py .
RUN python3 -m pip install -r requirements.txt
RUN python3 get_vm.py

FROM scratch
COPY --from=downlaod --chown=107:107 /main/alpine_VM.qcow2 /disk/