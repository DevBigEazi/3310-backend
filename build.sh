#!/bin/bash

# Build TypeScript code
echo "Building TypeScript code..."
yarn build

# Check if build was successful
if [ $? -eq 0 ]; then
  echo "Build successful! The compiled JavaScript files are in the dist/ directory."
  echo "You can run the production server with: yarn start"
else
  echo "Build failed. Please check the errors above."
  exit 1
fi
