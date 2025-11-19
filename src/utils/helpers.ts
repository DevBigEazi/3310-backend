import { ethers } from 'ethers';

// Config constants
export const MAX_SCORE = 100000; // Sanity check: max possible score
export const MIN_SCORE = 0;

// Get current ISO week number
export function getWeekNumber(date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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
