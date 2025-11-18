#!/bin/bash

# Install dependencies
yarn install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env file from .env.example. Please update it with your configuration."
fi

# Build the TypeScript code
yarn build

echo "Installation complete. Run 'yarn dev' to start the development server."
