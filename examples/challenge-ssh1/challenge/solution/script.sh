#!/bin/sh

# Start SSH tunnel as background service
sshpass -p 'test' ssh -o StrictHostKeyChecking=accept-new -p 8022 test@$SSH_SERVICE_INTERNAL_URL -L 8080:web1.ctf:80 -N &

# Wait for SSH tunnel to be established
sleep 5

# Get index.html that serves the flag
wget localhost:8080

# Extract flag from index.html
FLAG=$(cat index.html | grep -o flag{.*})

# Print the flag to the solution output
echo "$FLAG" >> /run/solution/flag.txt