# Guide to Create and Locally test the challenge

This document aims at providing a detailed explanation of the structure and purpose of the components in a CTF challenge.

Examples of challenges are available at [https://gitlab.sdu.dk/ctf/ctf_examples](https://gitlab.sdu.dk/ctf/ctf_examples).
In particular:

* Challenge-Web provides a simple example of a web-based challenge where participants explore a website to find a hidden flag. This is usually a good example to start looking for the web-penetration challenge.
* Challenge-Web-Links provides a more complex example providing two websites hosted on different subdomains.
* Challenge-SSH provides an example of challenge in which participants gain entry to the challenge environment via an SSH server. Once connected, they can access two different websites hosted within the challenge environment that can be navigated by using for example port forwarding.
* Challenge-Static provides an example of static challenge in which a file is provided to the players.
* Challenge-Kali provides an example of a challenge in which players can access a Kali Linux distribution by using a virtual desktop environment.


## CTF Template Structure

The challenge is a collection of files with the following structure.

```
challenge-name
|-- README.md
|-- challenge.yml
|-- solution
|   |-- Dockerfile
|   |-- ...
|-- src
    |-- compose.yaml
    `-- ...
|-- handout
|   `-- ...
```

### Root-Level Files

The `README.md` contains a textual introduction to the challenge.
Here you should summarize what the challenge is about.

The file `challenge.yml` specifies instead the metadata and configuration for the challenge. If the challenge uses containers, its type should be set to `container`, otherwise it should set to `dynamic`.
The important and necessary fields are the following ones.

```yaml
name: <test>                  # Name of the challenge
category: <category>          # Category to which the challenge belongs (e.g., web, crypto, pwn, misc)
description: <text>           # Description of the challenge shown to participants
author: <test>                # Author of the challenge
type: container               # Type of challenge (dynamic or container)

solution:                     # How to solve the challenge (textual description for internal reference)

flags:                        # The flag that validate the challenge
  - flag{web-example}

extra:                        # The number of points awarded when the challenge is solved. In the example, a function is used that decreases the number of awarded points as the number of solves increases (https://docs.ctfd.io/docs/custom-challenges/dynamic-value/).
    function: linear
    initial: 500
    decay: 10
    minimum: 50

```

The format used is similar of the format used by CTFd (see, e.g., [Deploying Challenge Services in CTFd](https://docs.ctfd.io/tutorials/challenges/creating-challenges/)).


### Source Directory

Contains the source code and configurations for the challenge.
It should contain a docker compose and the required files to spawn all the needed containers to run the challenge.
The docker-compose is meant to be executed in an Alpine VM having port 8080 and 8022 open for HTTP and SSH traffic.

There are the following eternally set environment variables that docker-compose can use:
* `HTTP_PORT` for the incoming port of HTTP connections
* `SSH_PORT` for the incoming port of SSH connections
* `DOMAIN` for the domain name of the challenge. When deployed on the CTF platform, a random string like `6cf6f182-78e0-4c40` will be assigned to the deployed challenge that will be reachable using `6cf6f182-78e0-4c40.ctf.jacopomauro.com`.

When submitted to the CTF platform, the docker-compose will deploy a challenge and generate a URL per challenge. A challenge receiving traffic on `HTTP_PORT` will be accessible at https://$DOMAIN.ctf.jacopomauro.com
The CTF platform will redirect the request and handle TLS termination.

The platform expects the challenges to provide a health endpoint at `HTTP_PORT`, so it can check that the challenge is running. The endpoint should reply with a status code equal to or greater than 200 and less than 400.
In case a health check fails, the challenge instance will be automatically restarted by the CTF platform.

To ensure each container is restarted in case of an error, each services in the Docker Compose file should be configured with `restart: unless-stopped` or `restart: always`.

### Solution Directory

Contains resources for testing and verifying the challenge. In particular, it should define a `Dockerfile` that contains an executable to verify that the challenge is working as expected and is solvable. The verifier should start automatically with the container (e.g., using the `CMD` or `ENTRYPOINT` instruction in the Dockerfile). If the verifier successfully solves the challenge, it should return status code 0 and write the found flag to standard output. If the verifier fails to solve the challenge it should return a status code different from 0.

### Handout Directory

Optional directory containing files for players.

---

## Testing challenges locally with QEMU

The CTF platform runs the challenges inside virtual machines, using QEMU as the hypervisor. Therefore, the easiest way to test locally if your challenge would work is to run it locally through QEMU.

### Requirements

- QEMU: <https://www.qemu.org/download/#linux>
- Docker + Docker Compose: <https://docs.docker.com/engine/install/>
- A working Python installation
- Root permissions on your local machine

### Obtaining the VM disk file

Download the alpine_VM image from this onedrive [link](https://syddanskuni-my.sharepoint.com/:u:/g/personal/mauro_imada_sdu_dk/EVDYyjZlakhLuUw-ZLJLCQwBwv4TWQOhVPkVnr1zyB2gIg?e=HEFhcW) (note that to access the link you need to have an SDU account).

### Setting up the cloud-init configuration

The virtual machine requires a cloud-init configuration to work.
[cloud-init](https://cloud-init.io/) is an open-source tool used to customize and configure cloud instances during their initialization phase. It is widely used across various cloud platforms (e.g., AWS, Azure, Google Cloud, OpenStack) and virtualized environments. CloudInit provides a way to automate tasks such as setting up user accounts, configuring network interfaces, installing packages, and executing custom scripts when a virtual machine (VM) is first booted.

In our case, we simply want the VM to contain the challenge files and, for convenience, to be accessible through a terminal without the need for SSH. This configuration will be served on port 8000 of your local machine, and will be reachable by the VM through the `10.0.2.2` address (referencing the host machine).

- Create a `cloudinit` directory somewhere in your file system. Name and location are not important.

```console
mkdir -p /tmp/cloudinit
```

- Make a zip file out of the `src` directory of your challenge and copy it to the `cloudinit` directory.

```console
cd example-challenge
cd src
zip -r challenge.zip ./
mv challenge.zip /tmp/cloudinit/challenge.zip
```

When creating the challenge.zip file, ensure that the files inside the src directory are directly included in the ZIP archive without the src folder as part of the path. This means the contents of src should be at the root level of the ZIP file. To achieve this, make sure to execute the zip command from within the src directory, as shown in the example above.

- In the `cloudinit` directory, create the files `meta-data`, `user-data` and `vendor-data`.

```console
cd /tmp/cloudinit
touch meta-data
touch user-data
touch vendor-data
```

- The contents of the files are as follows:

  - `meta-data`:

      ```yaml
      instance-id: someid/somehostname
      ```

  - `user-data`:

    ```yaml
    #cloud-config
    password: password
    chpasswd:
      expire: False
    runcmd:
    - mkdir /run/challenge
    - wget --no-check-certificate -O "/run/challenge/challenge.zip" "http://10.0.2.2:8000/challenge.zip"
    - unzip -d "/run/challenge/challenge/" "/run/challenge/challenge.zip"
    - HTTP_PORT="8080" HTTPS_PORT="8443" SSH_PORT="8022" DOMAIN="localhost" docker compose -f "/run/challenge/challenge/compose.yaml" up -d
    ```

  - `vendor-data`: empty.

- Expose the cloud-init configuration with a simple python HTTP server:

```console
cd /tmp/cloudinit
python3 -m http.server --directory .
```

This will have your `cloudinit` directory served on port 8000.

### Running the VM

Now you simply have to run the VM using QEMU.
From the folder in which you have saved the alpine_VM.qcow2 image, run the startup command:

```console
qemu-system-x86_64  \
  -cpu host -machine type=q35,accel=kvm -m 1024 \
  -nographic \
  -snapshot \
  -net nic \
  -netdev id=net00,type=user,hostfwd=tcp::8022-:8022,hostfwd=tcp::8080-:8080,hostfwd=tcp::8443-:8443 \
  -device virtio-net-pci,netdev=net00 \
  -drive if=virtio,format=qcow2,file=alpine_VM.qcow2 \
  -smbios type=1,serial=ds='nocloud;s=http://10.0.2.2:8000/'
```

This will open a session on the VM in your current terminal, and will also start the challenge using its `compose.yaml` file (if everything was configured correctly).

In the terminal, you'll see something like this:

```console
Welcome to Alpine Linux 3.21.0_alpha20240923 (edge)
Kernel 6.6.56-0-virt on an x86_64 (/dev/ttyS0)

localhost login: 
```

The username is `alpine` and the password is `password` (we set that up in the `user-data` file).

You can now interact with your VM through the 8022, 8080 and 8443 ports on `localhost`; if you need to explore container logs and errors, you can simply log into the VM through the terminal. You can exit the VM by pressing `Ctrl+A` and then `X`.

### Manually Triggering Docker Compose in Case of Issues

If you encounter problems with the automated startup of the challenge using `docker-compose`, you can manually trigger it to diagnose and resolve potential issues as follows.

* **Navigate to the Challenge Directory**
   - Access the VM by logging in. Locate the directory where the challenge files were unzipped:
     ```bash
     cd /run/challenge/challenge
     ```

* **Validate the `compose.yaml` File**
   - Before running the compose file, check its syntax to ensure there are no errors:
     ```bash
     docker compose config
     ```
   - If there are issues, the output will indicate what needs to be fixed.

* **Manually Start the Challenge**
   - Run the following command to start the challenge:
     ```bash
     docker compose up -d
     ```
   - This command starts the services defined in the `compose.yaml` file in detached mode.

* **Check the Status of the Services**
   - Use the following command to see the status of the running containers:
     ```bash
     docker ps
     ```
   - Look for containers marked as `Up`. If any containers have exited, check their logs for errors.

* **View Logs for Debugging**
   - To view logs for a specific service, use:
     ```bash
     docker logs <container_name>
     ```
   - Replace `<container_name>` with the name or ID of the container (visible in the `docker ps` output).

* **Restart Specific Containers**
   - If a specific service is not working correctly, restart it:
     ```bash
     docker restart <container_name>
     ```

* **Stop All Services**
   - If you need to stop the challenge for troubleshooting, run:
     ```bash
     docker compose down
     ```


### Connecting to the challenge locally via SSH

If the challenge is created to allow SSH connections via port 8022, it is possible to connect to it locally by running

```bash
ssh -D localhost:4000 -C -p 8022 <user>@localhost
```

where user is the username expected to be used and configured in the container running the SSH server.

Note that it is also possible to use dynamic port forwarding to redirect traffic from a local port to a port in the container accessed using ssh.
By configuring your browser or system to send traffic through the SOCKS proxy on port 8888, it is possible for example to navigate as accessing the web from the container hosting the SSH running the following command.

```bash
ssh -D localhost:8888 -C -p 8022 <username>@localhost
```

Then, 
---

## Remarks on Subdomain Challenges and Redirects

If your challenge relies on subdomains, you need to handle redirection and domain configuration appropriately. The following points clarify how to set up challenges that depend on multiple subdomains or require specific domain behavior:

* **Primary Access Point**:
   The primary access point for the challenge is `$DOMAIN.ctf.jacopomauro.com`. All HTTPS traffic to the challenge must be routed through this domain. The platform will perform TLS termination and redirect the traffic over HTTPS to the challenge VM.

* **Handling Subdomains**:
   If your challenge requires multiple subdomains (e.g., `sub1.$DOMAIN.ctf.jacopomauro.com`, `sub2.$DOMAIN.ctf.jacopomauro.com`), you need to implement appropriate redirections within the challenge environment. The most common approach is to include an **nginx container** or similar reverse proxy in your `docker-compose` configuration. This container can route traffic to the correct subdomains internally. Note that you are limited to have only one subdomain level (e.g., `sub1.$DOMAIN.ctf.jacopomauro.com` is OK but not `sub0.sub1.$DOMAIN.ctf.jacopomauro.com`).

* **Challenges Needing Additional Domains**:
   If your challenge requires the use of multiple unique domains (beyond `$DOMAIN.ctf.jacopomauro.com`), consider allowing the player to use **SSH port forwarding**:
   - Provide an SSH service within a container, allowing the player to establish port-forwarding connections.
   - From the container, the player can navigate as if originating traffic from the internal environment, enabling access to any necessary domains or subdomains.

  This is the most flexible solution since with port forwarding you allow the player to navigate as the player is navigating directly to the container accessed by SSH.


### Testing locally on challenges that rely on subdomains

If your example relies on subdomains, you might have to take some extra steps to ensure the challenge works without changes.

- First, edit your `/etc/hosts` file. As an example consider the challenge `challenge-web-links`. Here we have a webpage pointing to `http://web1.localhost` and `http://web2.localhost`. Therefore, we need to add the following line to `/etc/hosts`:

  ```bash
  127.0.0.1 web1.localhost web2.localhost
  ```

- Then, if your challenge expects you to contact standard ports between the containers (e.g. in the previous example, you want to reach `web1.localhost` on port 80), you might need to change which ports you are exposing with QEMU. If, e.g., you want to expose port 80 for HTTP instead of 8080, you will have to change the command to:

  ```console
  qemu-system-x86_64  \
    -cpu host -machine type=q35,accel=kvm -m 1024 \
    -nographic \
    -snapshot \
    -net nic \
    -netdev id=net00,type=user,hostfwd=tcp::8022-:8022,hostfwd=tcp::80-:8080,\
      hostfwd=tcp::8443-:8443 \
    -device virtio-net-pci,netdev=net00 \
    -drive if=virtio,format=qcow2,file=alpine_VM.qcow2 \
    -smbios type=1,serial=ds='nocloud;s=http://10.0.2.2:8000/'
  ```

Notice the difference in the second `hostfwd` option in the `-netdev` line.

This will expose the 8080 port of the challenge on `http://localhost`, and in the `web-links` challenge this will enable the `http://web1.localhost` and `http://web2.localhost` endpoints to be reached correctly.

---
## Challenge Hardening

To adhere to the principle of **defense in depth**, challenges should be hardened to minimize potential vulnerabilities. While the platform already isolates challenges from the host system, additional hardening should be applied to the container configuration itself.

The hardening should be configured based on the features and requirements of the challenge.


### Key Hardening Strategies

1. **Run as a Non-Root User**: Ensure the container runs as a non-root user to limit privileges.
2. **Prevent Privilege Escalation**: Configure the container to block any new privileges.
3. **Capability Restriction**: Drop all default capabilities and only add specific capabilities if absolutely necessary.
4. **Read-Only Filesystem**: Set the container's filesystem to read-only to prevent unauthorized modifications.
5. **Resource Limits**: Restrict the CPU and memory resources available to the container.


### Example Configuration

Below is an example of a hardened container configuration in Docker Compose:

```yaml
user: "1001"             # Run as a non-root user
cap_drop:
  - ALL                  # Drop all capabilities
cap_add:                 # Add back needed capabilities
  - CAP_CHOWN
read_only: true          # Set filesystem to read-only
security_opt:
  - no-new-privileges    # Prevent privilege escalation
deploy:
  resources:             # Resource limits
    limits:
      cpus: "0.50"       # Limit CPU usage to 50%
      memory: 50M        # Limit memory usage to 50 MB
```


### Linting and Validation

- Use tools to validate files:
  - Docker Compose: `docker compose config`
  - Dockerfiles: `hadolint`
  - Static analysis: `Trivy`