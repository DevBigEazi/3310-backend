# 3310 Backend

Backend server for the 3310 game, handling score validation, leaderboards, and player management.

## Features

- Score validation and signing
- Weekly and all-time leaderboards
- Player statistics
- Referral system with rewards
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
  - Request body: `{ "address": "0x...", "username": "player_name", "email": "player@example.com", "referralCode": "ABC123" }`
  - Returns: Player object
- `GET /api/player/:address/referrals` - Get player's referral information

### Admin
- `GET /api/admin/signer` - Get the backend signer address for contract verification

## Referral System

The game includes a referral system where players can refer others and earn rewards:

- Each player gets a unique referral code upon registration
- When a referred player earns their first 50 points:
  - The referrer receives 50 bonus points added directly to their weekly accumulated score
  - The referred player receives 25 bonus points added directly to their weekly accumulated score
- These bonus points immediately boost their chance to compete for weekly rewards

See [REFERRAL_SYSTEM.md](./docs/REFERRAL_SYSTEM.md) for detailed documentation.

## License

MIT
