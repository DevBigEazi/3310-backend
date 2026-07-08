import dotenv from 'dotenv';
dotenv.config();

// Genesis date is fixed to Monday May 25, 2026 00:00:00 UTC
const GENESIS_DATE = '2026-05-25T00:00:00Z';

export function getGenesisTime(): number {
  return new Date(GENESIS_DATE).getTime();
}

/**
 * Aligns the genesis timestamp to the Monday 00:00:00 UTC of the same week.
 * This guarantees weekly boundaries always fall on Monday-Sunday UTC.
 */
export function getAlignedGenesisTime(): number {
  const genesisTime = getGenesisTime();
  const genesisDate = new Date(genesisTime);
  const genesisDay = genesisDate.getUTCDay();
  // Calculate difference to Monday (1). Sunday (0) goes back 6 days, other days go back (day - 1) days.
  const genesisMondayDiff = genesisDate.getUTCDate() - genesisDay + (genesisDay === 0 ? -6 : 1);
  const genesisMonday = new Date(genesisDate);
  genesisMonday.setUTCDate(genesisMondayDiff);
  genesisMonday.setUTCHours(0, 0, 0, 0);
  return genesisMonday.getTime();
}

/**
 * Returns the current date formatted as YYYY-MM-DD in UTC.
 */
export function getDayId(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calculates the week ID (1-indexed week number since aligned genesis) in UTC.
 * Each week starts on Monday 00:00:00 UTC and ends Sunday 23:59:59 UTC.
 */
export function getWeekId(date: Date = new Date()): number {
  const alignedGenesisTime = getAlignedGenesisTime();
  const elapsedMs = date.getTime() - alignedGenesisTime;
  if (elapsedMs < 0) {
    return 1; // Fallback to week 1 for dates prior to aligned genesis
  }
  // Calculate full weeks elapsed: 7 days = 604,800,000 ms
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  return Math.floor(elapsedMs / ONE_WEEK_MS) + 1;
}
