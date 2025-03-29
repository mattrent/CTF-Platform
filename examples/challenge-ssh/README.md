# SSH and Web challenge 1

Local port forwarding example:
1. Setup connection: `ssh -L 4000:web1.ctf:80 -L 4001:web2.ctf:80 -C -N test@remotehost -p 2222 -o PreferredAuthentications=password -o PubkeyAuthentication=no`
2. Test connection: Navigate to `http://localhost:4000` and `http://localhost:4001`

Dynamic port forwarding example:
1. Setup connection: `ssh -D localhost:4000 -C -N test@remotehost -p 2222 -o PreferredAuthentications=password -o PubkeyAuthentication=no`
2. Configure your browser or system to send traffic through the SOCKS proxy.
3. Test connection: Navigate to `http://web1.ctf` and `http://web2.ctf`.
