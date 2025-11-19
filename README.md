# 3310 Backend

Backend server for the 3310 game, handling score validation, leaderboards, and player management.

## Features

- Score validation and signing
- Weekly and all-time leaderboards
- Player statistics
- Rate limiting to prevent abuse
- TypeScript for type safety

## Prerequisites

- Node.js (v16+)
- MongoDB
- Ethereum wallet private key for signing scores

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/DevBigEazi/3310-backend.git
   cd 3310-backend
   ```

2. Install dependencies:
   ```
   yarn install
   ```

3. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```

4. Edit the `.env` file with your configuration:
   ```
   BACKEND_PRIVATE_KEY=your_ethereum_private_key
   MONGODB_URI=your_mongodb_connection_string
   PORT=3000
   ```

## Running the Server

### Development Mode

```
yarn dev
```

The development server will run on port 3001 by default.

### Production Mode

```
./build.sh
yarn start
```

Or simply:

```
yarn build
yarn start
```

## API Endpoints

### Health Check
- `GET /health` - Check if the server is running

### Scores
- `POST /api/scores/validate-score` - Validate and sign a game score
- `GET /api/scores/leaderboard/weekly` - Get the current week's leaderboard
- `GET /api/scores/leaderboard/all-time` - Get the all-time leaderboard

### Players
- `GET /api/player/:address` - Get player statistics
- `POST /api/player` - Create a new player or update existing player
  - Request body: `{ "address": "0x...", "username": "player_name", "email": "player@example.com" }`
  - Returns: Player object

### Admin
- `GET /api/admin/signer` - Get the backend signer address for contract verification

## License

MIT
