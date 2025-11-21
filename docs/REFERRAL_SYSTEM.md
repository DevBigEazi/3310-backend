# Referral System Documentation

## Overview

The referral system allows players to refer others to the game. When a referred player reaches 50 points, the referrer receives a reward of 50 points, which boosts their chance to compete for weekly rewards.

## How It Works

1. **Referral Codes**:
   - Each player is assigned a unique referral code when they register
   - Players can share their referral code with friends

2. **Registration with Referral**:
   - New players can enter a referral code during registration
   - The system validates the referral code and links the new player to the referrer

3. **Reward Mechanism**:
   - When a referred player earns their first 50 points:
     - Their referrer automatically receives 50 bonus points added directly to their weekly accumulated score
     - The referred player also receives 25 bonus points added directly to their weekly accumulated score
   - These bonus points immediately boost their chance to compete for weekly rewards
   - The rewards are only given once per referred player
   - The system also tracks total referral points earned in the player profile

## API Endpoints

### Get Player Referral Data
```
GET /api/player/:address/referrals
```
Returns:
- The player's referral code
- Current referral points earned
- List of players referred

### Register with Referral Code
```
POST /api/player
```
Body:
```json
{
  "address": "0x...",
  "username": "player1",
  "email": "player1@example.com",
  "referralCode": "ABC123"
}
```

## Implementation Details

1. The `Player` model includes:
   - `referralCode`: Unique code for each player
   - `referredBy`: Address of the player who referred this player
   - `referralPoints`: Points earned from referrals

2. When a player submits a score, the system:
   - Checks if they were referred by another player
   - Checks if they just crossed the 50-point threshold
   - If both conditions are met, awards 50 points to the referrer

## Migration

A migration script is provided to generate referral codes for existing players:
```
node dist/scripts/migrateReferralCodes.js
```

## Testing

A test script is provided to verify the referral reward system:
```
node dist/scripts/testReferralRewards.js
```
