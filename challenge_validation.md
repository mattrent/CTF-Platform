# Guidelines for Challenge Validation

This guide introduces the testing endpoint available on the Deployer Service. The endpoint offers a straightforward way to verify that your challenge behaves as expected. It should be viewed more as a verification tool rather than a test that must be passed. Your challenge can be deployed regardless, but you'll receive a verification badge upon successful completion.

## Purpose

To ensure that each Capture the Flag (CTF) challenge is correctly designed and solvable, students must provide a **solution folder** containing the necessary code to automatically solve the challenge. This folder must include a **Dockerfile** and the corresponding source code for a solver program that, when executed inside a container, attempts to retrieve the flag. If the flag can not be retrieved, the solution checker must exit with a non-zero error code.

---

## Folder Structure

Each challenge must include a `solution/` directory structured as follows:

```
challenge-name
|-- README.md
|-- challenge.yml
|-- solution
|   |-- Dockerfile
|   |-- solver.py (or other executable solver program)
|-- src
|   |-- compose.yaml
|   `-- ...
|-- handout
|   `-- ...
```

---

## Solution Directory Requirements

- The `solution/` directory **must** contain a **Dockerfile**.
- The Docker container should automatically execute the solver program upon startup.
- The solver should attempt to retrieve the flag.
- If successful, it should **write the flag to `/run/solution/flag.txt`** and exit with code `0`.
- If unsuccessful, the program that check retrieves the flag should exit with a **non-zero error code**.

The domain of the challenges is passed automatically to the container using the environmental variable
`$DOMAIN`.

---

## Testing the Solution Locally

Before submitting, validate that the solver works as expected by building and running the Docker container:

```bash
cd solution
# Build the solver container
docker build -t challenge-solver .

# Run the solver and check if it retrieves the flag
docker run --rm challenge-solver
```

If the solver fails, it should return a non-zero exit code:

```bash
echo $?
```

A return value of `0` indicates success, while any non-zero value indicates failure.


---

## Submission and Validation on the CTF Platform

When submitting the challenge to the CTF platform:

1. Ensure that the `solution/` folder is included in the challenge submission.
2. The platform will automatically execute the solver inside a container.
3. If the solver **retrieves the flag**, the challenge is validated.
4. If the solver **fails to retrieve the flag**, the challenge must be revised.

You can check whether your Challenge has been verified by either starting the challenge, checking its status, or navigating to CTFd if the Challenge has already been published.

**Important:** If your solver requires additional dependencies, specify them in the Dockerfile to ensure correct execution.

---


