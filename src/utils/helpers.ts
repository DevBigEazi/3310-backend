import { ethers } from 'ethers';
import crypto from 'crypto';
import { Player } from '../models/Player.js';
import { GameSession } from '../models/GameSession.js';

// Config constants
export const MAX_SCORE = 100000; // Sanity check: max possible score
export const MIN_SCORE = 0;
export const MAX_GAMES_PER_HOUR = 5; // Maximum games allowed per hour
export const HOUR_IN_MS = 60 * 60 * 1000; // 1 hour in milliseconds

// Get current week number (starting from Monday) to align with smart contract
export function getWeekNumber(date = new Date()): number {
  const GENESIS_TIMESTAMP = 1763596800;
  const SECONDS_PER_WEEK = 7 * 24 * 60 * 60; // 604800
  
  const currentTimestamp = Math.floor(date.getTime() / 1000);
  
  if (currentTimestamp < GENESIS_TIMESTAMP) return 0;
  
  return Math.floor((currentTimestamp - GENESIS_TIMESTAMP) / SECONDS_PER_WEEK) + 1;
}

// Calculate time remaining until next play session
export function getTimeRemainingUntilNextSession(firstGameTime: Date): {
  canPlay: boolean;
  timeRemainingMs: number;
} {
  const now = new Date();
  const hourResetTime = new Date(firstGameTime.getTime() + HOUR_IN_MS);
  
  if (now >= hourResetTime) {
    return { canPlay: true, timeRemainingMs: 0 };
  }
  
  return {
    canPlay: false,
    timeRemainingMs: hourResetTime.getTime() - now.getTime()
  };
}

// Format milliseconds to human-readable time (MM:SS)
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Validate score is reasonable
export function isScoreValid(score: number): boolean {
  return Number.isInteger(score) && score >= MIN_SCORE && score <= MAX_SCORE;
}

// Create signature for score
export function signScore(
  signer: ethers.Wallet,
  playerAddress: string,
  score: number,
  gameSessionId: string,
  timestamp: number
): string {
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'string', 'uint256'],
    [playerAddress, score, gameSessionId, timestamp]
  );
  const signature = signer.signMessageSync(ethers.toBeHex(messageHash));
  return signature;
}

// Verify signature (for testing)
export function verifySignature(
  signer: ethers.Wallet,
  playerAddress: string,
  score: number,
  gameSessionId: string,
  timestamp: number,
  signature: string
): boolean {
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'string', 'uint256'],
    [playerAddress, score, gameSessionId, timestamp]
  );
  const recovered = ethers.recoverAddress(ethers.toBeHex(messageHash), signature);
  return recovered.toLowerCase() === signer.address.toLowerCase();
}

// Generate a unique referral code
export async function generateReferralCode(): Promise<string> {
  // Keep generating until we find a unique one
  while (true) {
    // Generate a random 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Check if it already exists
    const existingPlayer = await Player.findOne({ referralCode: code });
    if (!existingPlayer) {
      return code;
    }
  }
}

// Check if a player has reached 50 points for the first time and reward their referrer if applicable
export async function checkAndRewardReferrer(playerAddress: string, score: number): Promise<void> {
  try {
    const player = await Player.findOne({ address: playerAddress });
    if (!player || !player.referredBy) {
      return; // Player not found or not referred by anyone
    }
    
    // Check if this is the first time the player has reached 50 points
    const currentWeek = getWeekNumber();
    const gameSession = await GameSession.findOne({ playerAddress, weekNumber: currentWeek });
    if (!gameSession) {
      return;
    }
    
    // Check if the player has already received the bonus
    if (gameSession.hasReceived25PointBonus) {
      return; // Already processed this player's 25-point milestone
    }
    
    // If the player just crossed 50 points with this score
    if (gameSession.weeklyAccumulatedScore >= 50) {
      // Mark that we've processed the 25-point bonus for this player
      gameSession.hasReceived25PointBonus = true;
      
      // Update referrer's referral points counter (50 points for the referrer)
      await Player.findOneAndUpdate(
        { address: player.referredBy },
        { $inc: { 
          referralPoints: 50,
          referralCount: 1 
        }}
      );
      
      // Add 50 points to referrer's weekly accumulated score
      const referrerGameSession = await GameSession.findOne({ 
        playerAddress: player.referredBy, 
        weekNumber: currentWeek 
      });
      
      if (referrerGameSession) {
        referrerGameSession.weeklyAccumulatedScore += 50;
        await referrerGameSession.save();
        console.log(`Added 50 points to referrer ${player.referredBy}'s weekly score for referral ${playerAddress}`);
      } else {
        // Create a new game session for the referrer if they don't have one for this week
        const newReferrerSession = new GameSession({
          playerAddress: player.referredBy,
          firstGameInHour: new Date(),
          gamesPlayedInCurrentHour: 0,
          weekNumber: currentWeek,
          weeklyAccumulatedScore: 50,
          lastUpdated: new Date()
        });
        await newReferrerSession.save();
        console.log(`Created new game session for referrer ${player.referredBy} with 50 points`);
      }
      
      // Give the referred player a 25-point bonus
      await Player.findOneAndUpdate(
        { address: playerAddress },
        { $inc: { referralPoints: 25 } }
      );
      
      // Add 25 points to the referred player's weekly accumulated score
      gameSession.weeklyAccumulatedScore += 25;
      await gameSession.save();
      
      console.log(`Processed referral rewards - 50 points to referrer ${player.referredBy}, 25 points to player ${playerAddress}`);
    }
  } catch (error) {
    console.error('Error in checkAndRewardReferrer:', error);
  }
}
