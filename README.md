<a name="readme-top"></a>
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
      <a href="#introduction">👋 About The Project</a>
    </li>
    <li>
      <a href="#requirements">🧐 Requirements</a>
    </li>
    <li>
      <a href="#project-structure">📚 Project Structure</a>
    </li>
    <li>
      <a href="#getting-started">👷‍♂️ Getting Started</a>
    </li>
    <li>
        <a href="#todo">✅ TODO</a>
    </li>
    <li>
        <a href="#license">📜 License</a>
    </li>
  </ol>
</details>

<a name="introduction"></a>
## 👋 About The Project
The driving force behind this Master's Thesis is the urgent need for a robust and secure Capture The Flag (CTF) platform. CTF competitions are designed to test participants' knowledge and skills across various aspects of information security. These events serve not only as educational tools but also as team-building exercises and recruitment opportunities for cybersecurity talent. As these challenges grow increasingly complex, both educational institutions and organizations are in search of effective methods to train students and professionals in offensive and defensive cybersecurity techniques. This thesis seeks to address this need by developing an innovative CTF platform.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="requirements"></a>
## 🧐 Requirements
To run the platform locally, ensure you have the following tools installed:
* [Minikube](https://minikube.sigs.k8s.io/docs/start/?arch=%2Flinux%2Fx86-64%2Fstable%2Fdebian+package)
* [npm](https://www.npmjs.com/)
* [Pulumi](https://www.pulumi.com/docs/install/)
* [Kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/)
* [Docker](https://www.docker.com/)

Once the requirements are fulfilled, you are ready to deploy the platform.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="project-structure"></a>
## 📚 Project Structure

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="getting-started"></a>
## 👷‍♂️ Getting started
This project comprises five Pulumi projects:

1. infrastructure
2. certificates
3. authentication
4. application
5. monitoring

Before deploying any project, ensure that the infrastructure project is up and running. There is a circular dependency between the certificates and authentication projects (which needs to be solved). Other services may also depend on the certificate provisioning provided by the certificates project.

We use stacks like environments, so use the stack `dev` for local development in Minikube and the `prod` stack for production.

### Initialize Stack

If this is your first time deploying, you need to create and select:

Select or Create Your Stack: Navigate to your project directory and select your stack:

```bash
pulumi stack init <stack-name>
```

### Deployment Instructions
Deploy the Infrastructure:

```bash
cd src/infrastructure
pulumi up --stack <stack-name> -y
```

Deploy the Certificates:

```bash
cd src/certificates
pulumi up --stack <stack-name> -y
```

Deploy the Remaining Projects (authentication, application, monitoring):

```bash
cd src/<project-directory>
pulumi up --stack <stack-name> -y
```

### Visual Studio Code Tasks
To simplify the deployment process, Visual Studio Code tasks are available:

* `Deploy everything`: Executes deployment for all projects, simulating a staged pipeline.

* `Destroy everything`: Similarly, destroys all projects.

You can either deploy individual projects or deploy everything at once using the `Deploy everything` task. Similar tasks exist for destroying the projects.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="todo"></a>
## ✅ TODO
- [ ] Configure Keycloak to use external AD
- [ ] Allow [User registration](https://localhost/keycloak/realms/ctf/account/#/register)?


<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="license"></a>
## 📜 License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

Please read the [report](report/main.tex) for a more in-depth review.