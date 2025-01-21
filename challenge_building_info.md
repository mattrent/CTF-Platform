# CTF Challenge Template

This document provides a detailed explanation of the structure and purpose of the components in a CTF challenge template.

Examples of challenges are available at [https://gitlab.sdu.dk/ctf/ctf_examples](https://gitlab.sdu.dk/ctf/ctf_examples)

## Template Structure

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
Here you should summarize that is the challenge about.

The file `challenge.yml` specifies instead the metadata and configuration for the challenge.
The important and necessary fields are the following ones.

```
name: <test>                    # Name of the challenge
category: <category>           # Category to which the challenge belongs (e.g., web, crypto, pwn)
description: <text>             # Description of the challenge shown to participants
author: <test>                # Author of the challenge
type: container                 # Type of challenge (e.g., standard, container, quiz, etc.)

solution:                       # How to solve the challenge (textual description for internal reference)

flags:                          # The flag(s) that validate the challenge
  - flag{web-example}

```

The format used is similar of the format used by CTFd (see, e.g., [Deploying Challenge Services in CTFd](https://docs.ctfd.io/tutorials/challenges/creating-challenges/?utm_source=chatgpt.com) )


### Source Directory

Contains the source code and configurations for the challenge.
It should contain a docker compose and the required files to spawn all the needed containers to run the challenge.
The docker-compose will be executed in an alpine VM having port 8080, 80433 and 8022.

There are the following eternally set environment variables that docker-compose can use:
* `HTTP_PORT` for the incoming port of HTTP connections
* `HTTPS_PORT` for the incoming port of HTTPS connections
* `DOMAIN` for the domain name of the challenge

When submitted to the CTF platform, the docker-compose will deploy a challenge and generate a URL
per challenge. A challenge receiving traffic on `HTTPS_PORT` will be accessible at https://$DOMAIN.ctf.jacopomauro.com
**TODO Is domain the entire URL or only the string to add to ctf.jacopomauro.com?**

The platform expects the challenges to provide a health endpoint at `HTTP_PORT`, so it can check that the challenge is running. **TODO Conventions on health check. Code 200?**
In case a
health check fails, the challenge instance will be automatically restarted by Kubernetes.

### Solution Directory

Contains resources for testing and verifying the challenge. In particular, it should define a `Dockerfile` that builds an app to verify that the challenge is running as expected. The verifies should return in standard output the flag. **TODO Check with Henrik the convention. I guess it should have a run command and return a string?**

### Handout Directory

Optional directory containing files for players.

---

## Testing challenges locally with QEMU

The platform runs the challenges inside virtual machines, using QEMU as the hypervisor. Therefore, the easiest way to test if your challenge works is to run it locally through QEMU.

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
    - HTTP_PORT="8080" HTTPS_PORT="8443" SSH_PORT="8022" DOMAIN="%s" docker compose -f "/run/challenge/challenge/compose.yaml" up -d
    ```

  - `vendor-data`: empty.

- Expose the cloud-init configuration with a simple python HTTP server:

```console
cd /tmp/cloudinit
python3 -m http.server --directory .
```

This will have your `cloudinit` directory served on port 8000.

### Running the VM

Now you simply have to run the VM using QEMU (with root permissions).
From the folder in which you have saved the alpine_VM.qcow2 image, run the startup command:

```console
qemu-system-x86_64  \
  -cpu host -machine type=q35,accel=kvm -m 1024 \
  -nographic \
  -snapshot \
  -net nic \
  -netdev id=net00,type=user,hostfwd=tcp::2222-:2222,hostfwd=tcp::8080-:8080,hostfwd=tcp::8443-:8443 \
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

---

## Remarks on Subdomain Challenges and Redirects

If your challenge relies on subdomains, you need to handle redirection and domain configuration appropriately. The following points clarify how to set up challenges that depend on multiple subdomains or require specific domain behavior:

* **Primary Access Point**:  
   The primary access point for the challenge is `$DOMAIN.ctf.jacopomauro.com`. All HTTP and HTTPS traffic to the challenge must be routed through this domain.

* **Handling Subdomains**:  
   If your challenge requires multiple subdomains (e.g., `sub1.$DOMAIN.ctf.jacopomauro.com`, `sub2.$DOMAIN.ctf.jacopomauro.com`), you need to implement appropriate redirections within the challenge environment. The most common approach is to include an **nginx container** or similar reverse proxy in your `docker-compose` configuration. This container can route traffic to the correct subdomains internally.

* **Challenges Needing Additional Domains**:  
   If your challenge requires the use of multiple unique domains (beyond `$DOMAIN.ctf.jacopomauro.com`), consider allowing the player to use **SSH port forwarding**:
   - Provide an SSH service within a container, allowing the player to establish port-forwarding connections.
   - From the container, the player can navigate as if originating traffic from the internal environment, enabling access to any necessary domains or subdomains.


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
    -netdev id=net00,type=user,hostfwd=tcp::2222-:2222,hostfwd=tcp::80-:8080,hostfwd=tcp::8443-:8443 \
    -device virtio-net-pci,netdev=net00 \
    -drive if=virtio,format=qcow2,file=alpine_VM.qcow2 \
    -smbios type=1,serial=ds='nocloud;s=http://10.0.2.2:8000/'
  ```

Notice the difference in the second `hostfwd` option in the `-netdev` line.

This will expose the 8080 port of the challenge on `http://localhost`, and in the `web-links` challenge this will enable the `http://web1.localhost` and `http://web2.localhost` endpoints to be reached correctly.  

---
## Challenge Hardening

To adhere to the principle of **defense in depth**, challenges should be hardened to minimize potential vulnerabilities. While the platform already isolates challenges from the host system, additional hardening should be applied to the container configuration itself.


### Key Hardening Strategies

1. **Run as a Non-Root User**: Ensure the container runs as a non-root user to limit privileges.
2. **Prevent Privilege Escalation**: Configure the container to block any new privileges.
3. **Capability Restriction**: Drop all default capabilities and only add specific capabilities if absolutely necessary.
4. **Read-Only Filesystem**: Set the container's filesystem to read-only to prevent unauthorized modifications.
5. **Resource Limits**: Restrict the CPU and memory resources available to the container.


### Example Configuration

Below is an example of a hardened container configuration in Docker Compose:

```yaml
user: 1001               # Run as a non-root user
cap_drop:
  - ALL                 # Drop all capabilities
read_only: true          # Set filesystem to read-only
security_opt:
  - no-new-privileges    # Prevent privilege escalation
deploy:
  resources:             # Resource limits
    limits:
      cpus: '0.50'       # Limit CPU usage to 50%
      memory: 50M        # Limit memory usage to 50 MB
```


### Linting and Validation

- Use tools to validate files:
  - Docker Compose: `docker compose configure`
  - Dockerfiles: `hadolint`
  - Static analysis: `Trivy`
