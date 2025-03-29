#!/bin/sh

# Get index.html that serves the flag
wget --no-check-certificate https://$DOMAIN

# Extract flag from index.html
FLAG=$(cat index.html | grep -o flag{.*})

# Print the flag to the solution output
echo "$FLAG" >> /run/solution/flag.txt