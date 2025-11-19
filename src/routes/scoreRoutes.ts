import express from 'express';
import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import { rateLimit } from 'express-rate-limit';
import { Player } from '../models/Player.js';
import { Score } from '../models/Score.js';
import { getWeekNumber, isScoreValid, signScore } from '../utils/helpers.js';

const router = express.Router();

// Rate limiting
const validateScoreLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 requests per minute per IP
  message: { error: 'Too many validation requests' }
});

const submitScoreLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 1, // Max 1 submission per second per IP
  message: { error: 'Please wait before submitting another score' }
});

// Types
interface ValidateScoreRequest {
  playerAddress: string;
  score: number;
  gameSessionId: string;
  timestamp?: number;
}

// Validate and sign score
router.post('/validate-score', validateScoreLimiter, async (req: Request, res: Response) => {
  try {
    const { playerAddress, score, gameSessionId, timestamp } = req.body as ValidateScoreRequest;
    const signer = req.app.locals.signer as ethers.Wallet;

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

    // Check submission frequency per player (max 5 submissions per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentSubmissions = await Score.countDocuments({
      playerAddress: playerAddress.toLowerCase(),
      submittedAt: { $gte: oneHourAgo }
    });
    if (recentSubmissions >= 5) {
      return res.status(429).json({ error: 'Too many submissions this hour' });
    }

    // Use provided timestamp or server timestamp
    const submitTimestamp = timestamp || Math.floor(Date.now() / 1000);

    // Sign the score
    const signature = signScore(signer, playerAddress, score, gameSessionId, submitTimestamp);

    // Save to database
    const scoreDoc = new Score({
      playerAddress: playerAddress.toLowerCase(),
      score,
      gameSessionId,
      signature,
      weekNumber: getWeekNumber(),
      isValid: true
    });
    await scoreDoc.save();

    // Update or create player
    await Player.findOneAndUpdate(
      { address: playerAddress.toLowerCase() },
      {
        $inc: { totalScoresSubmitted: 1 },
        $setOnInsert: { address: playerAddress.toLowerCase() }
      },
      { upsert: true }
    );

    res.json({
      success: true,
      score,
      signature,
      playerAddress: playerAddress.toLowerCase(),
      gameSessionId,
      timestamp: submitTimestamp,
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

    const leaderboard = await Score.aggregate([
      { $match: { weekNumber: currentWeek, isValid: true } },
      { $group: { _id: '$playerAddress', bestScore: { $max: '$score' } } },
      { $sort: { bestScore: -1 } },
      { $limit: 100 }
    ]);

    const qualified = leaderboard.filter((entry: { _id: string; bestScore: number }) => entry.bestScore >= MIN_QUALIFICATION_SCORE);
    const topTen = qualified.slice(0, 10);

    res.json({
      weekNumber: currentWeek,
      qualificationScore: MIN_QUALIFICATION_SCORE,
      totalPlayers: leaderboard.length,
      qualifiedPlayers: qualified.length,
      topTen: topTen.map((entry: { _id: string; bestScore: number }, idx: number) => ({
        rank: idx + 1,
        address: entry._id,
        score: entry.bestScore
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

export default router;
