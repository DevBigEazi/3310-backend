import dotenv from 'dotenv';
dotenv.config();

// Default to Monday May 25, 2026 00:00:00 UTC
const DEFAULT_GENESIS = '2026-05-25T00:00:00Z';

export function getGenesisTime(): number {
  const genesisStr = process.env.GENESIS_DATE || DEFAULT_GENESIS;
  return new Date(genesisStr).getTime();
}

/**
 * Returns the current date formatted as YYYY-MM-DD in UTC.
 */
export function getDayId(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calculates the week ID (1-indexed week number since genesis) in UTC.
 * Each week starts on Monday 00:00:00 UTC and ends Sunday 23:59:59 UTC.
 */
export function getWeekId(date: Date = new Date()): number {
  const genesisTime = getGenesisTime();
  const elapsedMs = date.getTime() - genesisTime;
  if (elapsedMs < 0) {
    return 1; // Fallback to week 1 for dates prior to genesis
  }
  // Calculate full weeks elapsed: 7 days = 604,800,000 ms
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  return Math.floor(elapsedMs / ONE_WEEK_MS) + 1;
}
