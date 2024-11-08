<a name="readme-top"></a>
<p align="center">
<a href="https://sonarcloud.io/summary/overall?id=KianBankeLarsen_CTF-Platform" style="text-decoration:none;">
  <img src="https://img.shields.io/sonar/quality_gate/KianBankeLarsen_CTF-Platform?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge" style="padding-bottom: 5px;"/>
</a>
<a href="https://sonarcloud.io/summary/overall?id=KianBankeLarsen_CTF-Platform" style="text-decoration:none;">
  <img src="https://img.shields.io/sonar/tech_debt/KianBankeLarsen_CTF-Platform?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge" style="padding-bottom: 5px;" />
</a>
<a href="https://sonarcloud.io/summary/overall?id=KianBankeLarsen_CTF-Platform" style="text-decoration:none;">
  <img src="https://img.shields.io/sonar/major_violations/KianBankeLarsen_CTF-Platform?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge" style="padding-bottom: 5px;"/>
</a>
<a href="https://github.com/KianBankeLarsen/CTF-Platform/blob/main/LICENSE" style="text-decoration:none;">
  <img src="https://img.shields.io/github/license/KianBankeLarsen/CTF-Platform?style=for-the-badge" style="padding-bottom: 5px;/">
</a>
<a href="https://kianbankelarsen.github.io/CTF-Platform/" style="text-decoration:none;">
  <img src="https://img.shields.io/website?url=https%3A%2F%2Fkianbankelarsen.github.io%2FCTF-Platform%2F&style=for-the-badge" style="padding-bottom: 5px;"/>
</a>
</p>
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
      <a href="#project-structure">📂 Project Structure</a>
    </li>
    <li>
      <a href="#getting-started">👷‍♂️ Getting Started</a>
    </li>
    <li>
      <a href="#usage">🪁 How to Use the Platform</a>
    </li>
    <li>
        <a href="#license">📜 License</a>
    </li>
  </ol>
</details>

<a name="introduction"></a>
## 👋 About The Project
The driving force behind this Master's Thesis is the urgent need for a robust and secure Capture The Flag (CTF) platform. CTF competitions are designed to test participants' knowledge and skills across various aspects of information security. These events serve not only as educational tools but also as team-building exercises and recruitment opportunities for cybersecurity talent. As these challenges grow increasingly complex, both educational institutions and organizations are in search of effective methods to train students and professionals in offensive and defensive cybersecurity techniques. This thesis seeks to address this need by developing an innovative CTF platform.

To give you a comprehensive view of our system’s architecture, here is a high-level diagram illustrating the various components and their interactions:

> insert figure here

This figure showcases the interconnectedness and complexity of our platform, highlighting how each part plays a vital role. From infrastructure setup and application management to monitoring and authentication, the diagram encapsulates the multifaceted nature of the system. Each component is designed to ensure modularity, scalability, and efficiency, forming a cohesive and robust deployment ecosystem.

Please read the [report](report/main.tex) for a more in-depth review.

This platform has been developed in collaboration with:

1. Jacopo Mauro: Master's Thesis supervisor and professor, guiding the project's vision and academic rigor.
2. Matteo Trentin: Computer Science PhD Student, contributing research and technical expertise.
3. Henrik Jakobsen, Computer Science Master's student.
4. Kian Larsen (me), Computer Science Master's student.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="requirements"></a>
## 🧐 Requirements
Ready to dive into deploying your platform? Fantastic! Whether you're gearing up for a local run or a full-scale production, here’s your must-have toolkit:

* [Minikube](https://minikube.sigs.k8s.io/docs/start/?arch=%2Flinux%2Fx86-64%2Fstable%2Fdebian+package): The local Kubernetes cluster you've been dreaming of.
* [Node](https://github.com/nvm-sh/nvm): Your JavaScript runtime for building scalable network applications.
* [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm): The essential package manager for Node.js.
* [Pulumi](https://www.pulumi.com/docs/install/): Infrastructure as code, simplified. It provides a pipeline-like experience, making your deployments feel smooth and automated.
* [Kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/): The command-line tool for interacting with your Kubernetes cluster.
* [Docker](https://www.docker.com/): Containerize and run your applications seamlessly.
* [Helm](https://helm.sh/docs/intro/install/): The package manager for Kubernetes.

Once you've got these tools locked and loaded, you're all set to deploy the platform! 🛠️🚀

Note: It might look like a hefty list of dependencies at first glance, but don’t sweat it. Most of these tools are standard for any Kubernetes setup. Minikube is only needed for local development, and trust me, Typescript Pulumi makes deployment and development a walk in the park. 🌳

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="project-structure"></a>
## 📂 Project Structure

Welcome to the heart of our platform! 💓 Understanding the project structure is crucial for smooth deployment and maintenance. Here's a peek into the layout (only *important* files are shown):

```bash
CTF-Platform/
├── scripts/
│   └── boostrap.sh
└── src/
    ├── application/
    │   ├── bastion/
    │   │   ├── Dockerfile
    │   │   ├── init.sh
    │   │   └── sshd_bastion.conf
    │   ├── ctfd/
    │   │   ├── oidc
    │   │   └── Dockerfile
    │   └── index.ts
    ├── authentication/
    │   ├── index.ts
    │   └── realm.json
    ├── certificates/
    │   └── index.ts
    ├── infrastructure/
    │   └── index.ts
    ├── monitoring/
    │   └── index.ts
    └── utilities/
        └── src/
            ├── deployment.ts
            ├── index.ts
            ├── ingress.ts
            ├── misc.ts
            └── service.ts
```

Our project consists of five Pulumi projects, each with a specific role to play:

* **application:** 🖥️ Home to CTF platform/cloud-specific functionality.
* **authentication:** 🔑 Manages SSO capabilities provided by Keycloak.
* **certificates:** 📜 Handles certificate CA and issuers.
* **infrastructure:** 🏗️ Takes care of basic cluster configuration.
* **monitoring:** 📊 Ensures cluster observability and log collection.

Each project is a bundle of deployments, services, and even Helm charts. They are designed to group similar services that share characteristics, ensuring modularity and maintainability.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="getting-started"></a>
## 👷‍♂️ Getting started
If this is your first time deploying the platform, you'll need to initialize the stacks. Pulumi projects can store their state in either an external BLOB or a local state file. Regardless, you'll need to initialize the stacks to ensure they are part of your state. Do this by running:

```bash
pulumi stack init <stack>
```

🤔 You might wonder, what is a stack? A stack is simply some state of resources. Stacks can also contain values similar to Helm chart values. There are two predefined stacks available: `dev` and `prod`. We use these stacks like environments, where `dev` is for development (specifically targeting Minikube), and `prod` is meant for any Kubernetes cluster, e.g., K3 or K8. If needed, you can create your own stack from scratch.

Before you start deploying, you'll need to install the Node modules. These modules can be specific for Pulumi, or any Node module you may want to use (e.g., axios). Install these modules by navigating to the `src` directory and running:

```bash
npm install
```

Now for the fun part—deployment! 🚀 To deploy a project, change the directory to that project and then run:

```bash
cd src/<project>
pulumi up --stack <stack> -y
```

🌟 If you prefer not to specify the stack every time, you can set the stack context with the following command:

```bash
pulumi select stack <stack>
```

This stack will then be the default context moving forward.

**Important Tips:**

1. **Infrastructure First:** 🏗️ Start with the infrastructure project as it sets up the basic cluster configuration and Kubernetes resources like namespaces.
2. **Certificates Next:** 📜 Deploy the certificates project next. This is vital as it installs custom resource definitions (CRDs) needed by other projects.
3. **Order Flexibility:** 🔄 After setting up infrastructure and certificates, feel free to deploy the remaining projects in any order. Once deployed, they can be updated independently.

🛠️ By following this structured approach, you'll ensure a smooth and efficient deployment process. Pulumi not only creates Kubernetes resources but also executes bash commands to handle procedures that would otherwise require manual intervention. This approach solves issues like the circular dependency between certificates and authentication. For example, the CA performs some initialization (only once) of its specified providers, necessitating a restart of the CA pod after Keycloak is deployed. Pulumi also builds and pushes Docker images to the self-hosted Docker registry as part of the deployment. These examples highlight why using Pulumi makes our lives simpler.

For even more advanced setups, if using a provider, the complete infrastructure can be specified in code and executed with a click of a button! While only some cloud providers support this natively, you can always create your own provider.

💡 If you're working on local development and Pulumi alone isn't quite enough, you can leverage the prepared Visual Studio Code Tasks tailored for deploying or destroying the Pulumi projects. These tasks allow you to deploy or destroy everything or focus on single projects. They are particularly handy when you need to boot everything up at the start of a new coding session. ⚡

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="usage"></a>
## 🪁 How to Use the Platform

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<a name="license"></a>
## 📜 License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>