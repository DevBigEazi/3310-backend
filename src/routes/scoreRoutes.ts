import express from 'express';
import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import { rateLimit } from 'express-rate-limit';
import { Player } from '../models/Player.js';
import { Score } from '../models/Score.js';
import { GameSession } from '../models/GameSession.js';
import { jwtAuth } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getWeekNumber,
  isScoreValid,
  signScore,
  getTimeRemainingUntilNextSession,
  formatTimeRemaining,
  MAX_GAMES_PER_HOUR,
  HOUR_IN_MS,
  isInSubmissionPeriod
} from '../utils/helpers.js';

const router = express.Router();

// Rate limiting
const validateScoreLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 requests per minute per IP
  message: { error: 'Too many validation requests' }
});

// Types
interface ValidateScoreRequest {
  playerAddress: string;
  score: number;
  gameSessionId: string;
  timestamp?: number;
}

// Validate and sign score
router.post('/validate-score', validateScoreLimiter, jwtAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { playerAddress, score, gameSessionId, timestamp } = req.body as ValidateScoreRequest;
    const signer = req.app.locals.signer as ethers.Wallet;
    const normalizedAddress = playerAddress.toLowerCase();
    const now = new Date();
    const currentWeek = getWeekNumber(now);

    // Input validation
    if (!playerAddress || score === undefined || !gameSessionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate address format
    if (!ethers.isAddress(playerAddress)) {
      return res.status(400).json({ error: 'Invalid player address' });
    }

    // Validate score
    if (!isScoreValid(score)) {
      return res.status(400).json({ error: `Score must be between ${process.env.MIN_SCORE || 0} and ${process.env.MAX_SCORE || 100000}` });
    }

    // Check for duplicate gameSessionId (prevent replay attacks)
    const existingSubmission = await Score.findOne({ gameSessionId });
    if (existingSubmission) {
      return res.status(400).json({ error: 'Game session already submitted' });
    }

    // Get or create player game session for the current week
    let gameSession = await GameSession.findOne({
      playerAddress: normalizedAddress,
      weekNumber: currentWeek
    });

    if (!gameSession) {
      // First game of the week for this player
      gameSession = new GameSession({
        playerAddress: normalizedAddress,
        firstGameInHour: now,
        gamesPlayedInCurrentHour: 0,
        weekNumber: currentWeek,
        weeklyAccumulatedScore: 0,
        lastUpdated: now
      });
    }

    // Check if we need to reset the hourly counter
    const timeRemaining = getTimeRemainingUntilNextSession(gameSession.firstGameInHour);
    
    if (timeRemaining.canPlay) {
      // Hour has passed since first game, reset counter
      gameSession.gamesPlayedInCurrentHour = 0;
      gameSession.firstGameInHour = now;
    }

    // Check if player has reached the hourly game limit
    if (gameSession.gamesPlayedInCurrentHour >= MAX_GAMES_PER_HOUR) {
      const resetTime = new Date(gameSession.firstGameInHour.getTime() + HOUR_IN_MS);
      return res.status(429).json({
        error: 'Game limit reached for this hour',
        timeRemaining: {
          ms: timeRemaining.timeRemainingMs,
          formatted: formatTimeRemaining(timeRemaining.timeRemainingMs),
          resetTime: resetTime.toISOString()
        }
      });
    }

    // Use provided timestamp or server timestamp
    const submitTimestamp = timestamp || Math.floor(now.getTime() / 1000);

    // Sign the score
    const signature = signScore(signer, playerAddress, score, gameSessionId, submitTimestamp);

    // Increment games played counter and update accumulated score
    gameSession.gamesPlayedInCurrentHour += 1;
    gameSession.weeklyAccumulatedScore += score;
    gameSession.lastUpdated = now;
    await gameSession.save();

    // Save individual score to database
    const scoreDoc = new Score({
      playerAddress: normalizedAddress,
      score,
      gameSessionId,
      signature,
      submittedAt: now,
      weekNumber: currentWeek,
      isValid: true
    });
    await scoreDoc.save();

    // Update player stats
    await Player.findOneAndUpdate(
      { address: normalizedAddress },
      {
        $inc: { totalScoresSubmitted: 1 },
        $setOnInsert: { address: normalizedAddress }
      },
      { upsert: true }
    );

    // Calculate games remaining in this hour
    const gamesRemaining = MAX_GAMES_PER_HOUR - gameSession.gamesPlayedInCurrentHour;

    res.json({
      success: true,
      score,
      signature,
      playerAddress: normalizedAddress,
      gameSessionId,
      timestamp: submitTimestamp,
      weeklyAccumulatedScore: gameSession.weeklyAccumulatedScore,
      gamesRemaining,
      isSubmissionPeriod: isInSubmissionPeriod(now),
      message: 'Score validated and signed'
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get player leaderboard (current week)
router.get('/leaderboard/weekly', async (_req: Request, res: Response) => {
  try {
    const currentWeek = getWeekNumber();
    const MIN_QUALIFICATION_SCORE = 500;

    // Get accumulated scores from GameSession collection
    const leaderboard = await GameSession.find(
      { weekNumber: currentWeek },
      { playerAddress: 1, weeklyAccumulatedScore: 1 }
    ).sort({ weeklyAccumulatedScore: -1 }).limit(100);

    const qualified = leaderboard.filter(entry => entry.weeklyAccumulatedScore >= MIN_QUALIFICATION_SCORE);
    const topTen = qualified.slice(0, 10);

    res.json({
      weekNumber: currentWeek,
      qualificationScore: MIN_QUALIFICATION_SCORE,
      totalPlayers: leaderboard.length,
      qualifiedPlayers: qualified.length,
      isSubmissionPeriod: isInSubmissionPeriod(),
      topTen: topTen.map((entry, idx) => ({
        rank: idx + 1,
        address: entry.playerAddress,
        score: entry.weeklyAccumulatedScore
      }))
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all-time leaderboard
router.get('/leaderboard/all-time', async (_req: Request, res: Response) => {
  try {
    const leaderboard = await Score.aggregate([
      { $match: { isValid: true } },
      { $group: { _id: '$playerAddress', bestScore: { $max: '$score' } } },
      { $sort: { bestScore: -1 } },
      { $limit: 100 }
    ]);

    res.json({
      type: 'all-time',
      totalPlayers: leaderboard.length,
      topScores: leaderboard.map((entry: { _id: string; bestScore: number }, idx: number) => ({
        rank: idx + 1,
        address: entry._id,
        score: entry.bestScore
      }))
    });
  } catch (error) {
    console.error('All-time leaderboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get player's current game session status
router.get('/game-session/:address', jwtAuth, async (req: AuthRequest, res: Response) => {
  try {
    const addressParam = req.params.address;
    
    if (!addressParam) {
      return res.status(400).json({ error: 'Address parameter is required' });
    }
    
    const address = addressParam.toLowerCase();
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const currentWeek = getWeekNumber();
    const gameSession = await GameSession.findOne({
      playerAddress: address,
      weekNumber: currentWeek
    });

    if (!gameSession) {
      // No game session found for this week
      return res.json({
        playerAddress: address,
        weekNumber: currentWeek,
        weeklyAccumulatedScore: 0,
        gamesPlayedInCurrentHour: 0,
        gamesRemaining: MAX_GAMES_PER_HOUR,
        canPlay: true,
        timeRemaining: {
          ms: 0,
          formatted: '00:00'
        },
        isSubmissionPeriod: isInSubmissionPeriod()
      });
    }

    // Check if we need to reset the hourly counter
    const timeRemaining = getTimeRemainingUntilNextSession(gameSession.firstGameInHour);
    const gamesPlayedInCurrentHour = timeRemaining.canPlay ? 0 : gameSession.gamesPlayedInCurrentHour;
    const gamesRemaining = MAX_GAMES_PER_HOUR - gamesPlayedInCurrentHour;
    const canPlay = gamesRemaining > 0 || timeRemaining.canPlay;

    res.json({
      playerAddress: address,
      weekNumber: currentWeek,
      weeklyAccumulatedScore: gameSession.weeklyAccumulatedScore,
      gamesPlayedInCurrentHour,
      gamesRemaining,
      canPlay,
      timeRemaining: {
        ms: timeRemaining.timeRemainingMs,
        formatted: formatTimeRemaining(timeRemaining.timeRemainingMs),
        resetTime: new Date(gameSession.firstGameInHour.getTime() + HOUR_IN_MS).toISOString()
      },
      isSubmissionPeriod: isInSubmissionPeriod()
    });
  } catch (error) {
    console.error('Game session status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
