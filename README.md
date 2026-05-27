# 3310 Game Backend

This is the Node.js, Express, and TypeScript backend for the **3310 Game** (retro Snake). It is responsible for handling player onboarding (tied to EIP-7702 delegated wallet addresses), managing lives and game session refills, tracking weekly/all-time leaderboards, and executing an anti-cheat validation pipeline.

For detailed technical specifications, database schema, time boundaries, and API routes, please refer to the [Technical Documentation](doc/technical_documentation.md).

---

## 🚀 Key Features

- **Social & Web3 Auth Integration**: Social onboarding mapped to lowercased EIP-7702 delegated wallet addresses on Optimism.
- **Frictionless Lives System**: Enforces a 5-lives capacity with flat 1-hour refill count-downs. Correctly carries stats across daily session boundaries.
- **Upfront Attempt Checks**: Pre-validates game limits and lives upfront to prevent bad UX and farming.
- **Anti-Cheat Engine**: Prevents session replay attacks and checks score submission speed (cannot exceed 50 points per second).
- **Leaderboards with Tiebreakers**: Grouped and sorted by Weekly Accumulated Score (Desc) -> Total Games Played (Asc) -> Referral Points (Desc).
- **Referral Allocation**: Auto-generates alphanumeric referral codes, rewarding referrers (50 points) and referred users (25 points).

---

## 🛠️ Getting Started

### 1. Installation

Clone the repository and install the dependencies:

```bash
npm install
```

### 2. Configuration

Copy the environment variables template and configure your local settings:

```bash
cp .env.example .env
```

Ensure you define a `JWT_SECRET` and specify your target MongoDB connection string under `MONGODB_URI`.

### 3. Run Development Server

Start the development server with hot-reloading:

```bash
npm run dev
```

### 4. Running the Tests

We include a self-contained integration test suite running on an in-memory database (`mongodb-memory-server`):

```bash
npx tsx src/tests/test.ts
```

---

## 📁 Repository Structure

```bash
backend/
├── doc/
│   └── technical_documentation.md   # Detailed architecture and API reference
├── src/
│   ├── index.ts                     # Main entry point & DB connection
│   ├── middleware/
│   │   └── auth.ts                  # JWT verification middleware
│   ├── models/
│   │   ├── Player.ts                # Player profiles & referrals
│   │   ├── Score.ts                 # Individual game score logs
│   │   ├── GameSession.ts           # Daily session states & lives
│   │   └── GameAttempt.ts           # Anti-cheat session replay models
│   ├── controllers/
│   │   ├── playerController.ts
│   │   └── scoreController.ts
│   ├── routes/
│   │   ├── playerRoutes.ts
│   │   └── scoreRoutes.ts
│   ├── services/
│   │   └── livesManager.ts          # Lives replenishment and consumption logic
│   ├── utils/
│   │   └── timeUtils.ts             # Day and week duration index calculations
│   └── tests/
│       └── test.ts           # Automated test pipeline
└── tsconfig.json
```
