<p align="center">
<a href="https://odin.sdu.dk/sitecore/index.php?a=fagbesk&id=83401&lang=en&listid=">
<img src="https://www.sdu.dk/-/media/files/nyheder/logoer/sdu_black_rgb_png.png" width="400" style="padding-bottom: 1em;">
</a>
<br />
Revolutionize Your CTF Challenges with Our Easy Deployment Platform
<br />
<a href="https://github.com/KianBankeLarsen/CTF-Platform"><strong>Explore the code»</strong></a>
</p>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#👋-about-the-project">👋 About The Project</a>
    </li>
    <li>
      <a href="#👷‍♂️-getting-started">👷‍♂️ Getting Started</a>
    </li>
    <li>
        <a href="#✅-todo">✅ TODO</a>
    </li>
    <li>
        <a href="#📜-license">📜 License</a>
    </li>
  </ol>
</details>

## 👋 About The Project
The driving force behind this Master's Thesis is the urgent need for a robust and secure Capture The Flag (CTF) platform. CTF competitions are designed to test participants' knowledge and skills across various aspects of information security. These events serve not only as educational tools but also as team-building exercises and recruitment opportunities for cybersecurity talent. As these challenges grow increasingly complex, both educational institutions and organizations are in search of effective methods to train students and professionals in offensive and defensive cybersecurity techniques. This thesis seeks to address this need by developing an innovative CTF platform.

## 🧐 Requirements
To run the platform locally, you will need to have the following tools installed:
* [Minikube](https://minikube.sigs.k8s.io/docs/start/?arch=%2Flinux%2Fx86-64%2Fstable%2Fdebian+package)
* [npm](https://www.npmjs.com/)
* [Pulumi](https://www.pulumi.com/docs/install/)
* [Kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/)
* [Docker](https://www.docker.com/)

## 👷‍♂️ Getting started
Currently the only stack available is the dev. A stack within a project can be deployed using the command 


```
pulumi up --stack dev
```

In order to get a fully running system, then you need to enable the ingress add-on and deploy the following projects:

* infrastructure
* authentication
* monitoring

You can also just execute the VSCode task `deploy everyting`.

## Architecture

## ✅ TODO
- [ ] Configure Keycloak to use external AD
- [ ] Allow [User registration](https://localhost/keycloak/realms/ctf/account/#/register)?

## 📜 License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.