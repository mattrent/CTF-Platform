<p align="center">
<a href="https://odin.sdu.dk/sitecore/index.php?a=fagbesk&id=83401&lang=en&listid=">
<img src="https://www.sdu.dk/-/media/files/nyheder/logoer/sdu_black_rgb_png.png" width="400" style="padding-bottom: 1em;">
</a>
<br />
Exploring microservices using Kubernetes and Pulumi!
<br />
<a href="https://github.com/KianBankeLarsen/CTF-Platform"><strong>Explore the code»</strong></a>
</p>

## Introduction
The motivation behind this Master's Thesis lies in the need for a robust and secure Capture The Flag (CTF) platform. 
CTF is a type of cybersecurity competition designed to challenge participants' knowledge and skills in various aspects of information security. These competitions are often used as educational tools, team-building exercises, or even as recruiting grounds for cybersecurity talent. 

As cybersecurity challenges become increasingly complex, educational institutions and organizations seek effective ways to train students and professionals in offensive and defensive techniques. We aim to facilitate this by exploring the development of a CTF platform tacking into account the following aspects.

* To ease the deployment we would like to deploy the CTF platform on a cloud infrastructure. We will explore the usage of The University of Southern Denmark's UCloud as a starting point, possibly using networking tools like Tailscale to facilitate communication between nodes. If we encounter significant challenges, we remain open to exploring other cloud providers to ensure seamless deployment and accessibility.
* We would like to leveraging modern DevOps tools like Pulumi, Keycloak, Kubernetes, Jenkins, Prometheus, Grafana, CTFd, Docker, KubeVirt, local image registries, and BLOBs, for deployment and orchestration. Establishing a well-organized, secure deployment pipeline is essential. Our goal is to automate the deployment process while maintaining security best practices. This pipeline will facilitate efficient deployments of the platform and reliable deployments of the CTF challenges in question.
* A CTF platform places a strong emphasis on isolation to prevent interference between challenges. To achieve this, we will explore containerization strategies, ensuring that no privileged containers compromise the integrity of other challenges. Virtual machines (VMs) will play a crucial role in maintaining this isolation. Furthermore, we will carefully assess network security risks to safeguard our platform and consider how players will interact with our exposed services/endpoints.
* Beyond user experience, a CTF platform should try to minimize the resource footprint on the server. Our goal is to optimize resource utilization, ensuring efficient use of computational resources while maintaining robust functionality.

## Requirements
To run the platform locally, you will need to have the following tools installed:
* [Minikube](https://minikube.sigs.k8s.io/docs/start/?arch=%2Flinux%2Fx86-64%2Fstable%2Fdebian+package)
* [Pulumi](https://www.pulumi.com/docs/install/)
* [Kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/)


## Getting started
Currently the only stack available is the dev. A stack within a project can be deployed using the command 


```
pulumi up --stack dev
```

In order to get a fully running system, then you need to enable the ingress add-on and deploy the following projects:

* infrastructure
* authentication
* monitoring

You can also just execute the VSCode task `deploy everyting`.

## TODO
- [ ] Optimize deployment using [Nx](https://nx.dev/getting-started/intro)
- [ ] Configure Keycloak to use external AD