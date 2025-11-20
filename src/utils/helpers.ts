import { ethers } from 'ethers';

// Config constants
export const MAX_SCORE = 100000; // Sanity check: max possible score
export const MIN_SCORE = 0;
export const MAX_GAMES_PER_HOUR = 5; // Maximum games allowed per hour
export const HOUR_IN_MS = 60 * 60 * 1000; // 1 hour in milliseconds

// Get current week number (starting from Monday) to align with smart contract
export function getWeekNumber(date = new Date()): number {
  // Convert to UTC to ensure consistency
  const timestamp = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 1000;
  // Calculate week number using the same formula as the smart contract
  // ((timestamp / SECONDS_PER_WEEK) + 3) / 1
  const SECONDS_PER_WEEK = 604800;
  return Math.floor(((timestamp / SECONDS_PER_WEEK) + 3) / 1);
}

// Check if the current time is within the submission period (Saturday 00:00 UTC → Sunday 23:59 UTC)
export function isInSubmissionPeriod(date = new Date()): boolean {
  // Convert to the same day numbering as the smart contract (0=Monday, 6=Sunday)
  const dayOfWeek = ((Math.floor(date.getTime() / 1000) / 86400) + 3) % 7;
  
  // Saturday is day 5, Sunday is day 6 in the smart contract's numbering
  return dayOfWeek === 5 || dayOfWeek === 6;
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
