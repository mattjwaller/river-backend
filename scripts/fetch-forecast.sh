#!/bin/bash

# Get the API URL from environment or use default
API_URL=${API_URL:-"http://localhost:3000"}

echo "Fetching forecast from ${API_URL}/api/forecast/fetch"

# Make the request
curl -X POST "${API_URL}/api/forecast/fetch" \
  -H "Content-Type: application/json" \
  | jq '.'

# Print a newline for readability
echo 