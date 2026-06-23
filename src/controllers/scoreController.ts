import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Score } from '../models/Score.js';
import { GameSession } from '../models/GameSession.js';
import { GameAttempt } from '../models/GameAttempt.js';
import { LivesManager } from '../services/livesManager.js';
import { getDayId, getWeekId } from '../utils/timeUtils.js';
import { AuthRequest } from '../middleware/auth.js';
import { BadgeManager } from '../services/badgeManager.js';

/**
 * Resets the hourly game play limit if more than 1 hour has elapsed since firstGameInHour.
 * Returns true if the session was modified, false otherwise.
 */
function checkAndResetHourlyLimit(session: any): boolean {
  if (session.firstGameInHour) {
    const now = new Date();
    const elapsed = now.getTime() - new Date(session.firstGameInHour).getTime();
    if (elapsed >= 60 * 60 * 1000) {
      session.gamesPlayedInCurrentHour = 0;
      session.firstGameInHour = null;
      return true;
    }
  }
  return false;
}

/**
 * Retrieves the player's active session state for today.
 */
export const getGameSession = async (req: AuthRequest, res: Response) => {
  try {
    const address = req.params.address || req.user?.address;
    if (!address) {
      return res.status(400).json({ error: 'ADDRESS_REQUIRED' });
    }

    const lowerAddress = address.toLowerCase();
    
    // Apply refills if needed
    const session = await LivesManager.checkAndApplyRefill(lowerAddress);
    
    // Check and reset hourly limit if expired
    const modified = checkAndResetHourlyLimit(session);
    if (modified) {
      await session.save();
    }

    return res.status(200).json({
      playerAddress: session.playerAddress,
      dayId: session.dayId,
      weekNumber: session.weekNumber,
      gamesPlayedInCurrentHour: session.gamesPlayedInCurrentHour,
      firstGameInHour: session.firstGameInHour,
      currentLives: session.currentLives,
      nextRefillAt: session.nextRefillAt,
      dailyAccumulatedScore: session.dailyAccumulatedScore,
      weeklyAccumulatedScore: session.weeklyAccumulatedScore
    });
  } catch (error: any) {
    console.error('Error fetching game session:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

/**
 * Starts a game session. Validates lives and hourly game counts beforehand.
 * Generates and returns a gameSessionId for replay/duration verification.
 */
export const startGame = async (req: AuthRequest, res: Response) => {
  try {
    const playerAddress = req.user?.address;
    if (!playerAddress) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    // Check refills and get current session
    const session = await LivesManager.checkAndApplyRefill(playerAddress);

    // Verify hourly limits
    const modified = checkAndResetHourlyLimit(session);
    if (modified) {
      await session.save();
    }

    if (session.gamesPlayedInCurrentHour >= 5) {
      return res.status(400).json({ 
        error: 'HOUR_LIMIT_REACHED', 
        firstGameInHour: session.firstGameInHour 
      });
    }

    // Verify lives
    if (session.currentLives <= 0) {
      return res.status(400).json({ 
        error: 'OUT_OF_LIVES', 
        nextRefillAt: session.nextRefillAt 
      });
    }

    // Generate active gameSessionId for this specific attempt
    const gameSessionId = uuidv4();
    const attempt = new GameAttempt({
      gameSessionId,
      playerAddress,
      startTime: new Date(),
      isSubmitted: false
    });
    
    await attempt.save();

    return res.status(200).json({
      gameSessionId,
      currentLives: session.currentLives,
      gamesPlayedInCurrentHour: session.gamesPlayedInCurrentHour
    });
  } catch (error: any) {
    console.error('Error starting game:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

/**
 * Validates the score against replay and time duration checks,
 * consumes 1 life, saves the score, and increments accumulated scores.
 */
export const validateScore = async (req: AuthRequest, res: Response) => {
  try {
    const playerAddress = req.user?.address;
    if (!playerAddress) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const { gameSessionId, score } = req.body;
    if (!gameSessionId || score === undefined) {
      return res.status(400).json({ error: 'GAME_SESSION_ID_AND_SCORE_REQUIRED' });
    }

    // Replay Protection: Find unsubmitted attempt
    const attempt = await GameAttempt.findOne({ 
      gameSessionId, 
      playerAddress, 
      isSubmitted: false 
    });

    if (!attempt) {
      return res.status(400).json({ error: 'INVALID_OR_SUBMITTED_SESSION' });
    }

    // Mark attempt as submitted immediately
    attempt.isSubmitted = true;
    await attempt.save();

    // Consume 1 life
    const session = await LivesManager.consumeLife(playerAddress);

    // Anti-Cheat: Time elapsed verification
    const now = new Date();
    const elapsedMs = now.getTime() - attempt.startTime.getTime();
    const elapsedSeconds = Math.max(elapsedMs / 1000, 0.5); // Prevent division by zero / low numbers
    
    // Players cannot exceed 50 points per second
    const pointsPerSecond = score / elapsedSeconds;
    const isValid = pointsPerSecond <= 50;

    const currentDay = getDayId();
    const currentWeek = getWeekId();

    // Save individual game score
    const scoreDoc = new Score({
      playerAddress,
      score,
      dayId: currentDay,
      weekId: currentWeek,
      isValid
    });
    await scoreDoc.save();

    // Update hourly limit counters (since a game was played and a life consumed)
    checkAndResetHourlyLimit(session);
    
    session.gamesPlayedInCurrentHour += 1;
    if (session.currentLives === 0 && !session.firstGameInHour) {
      session.firstGameInHour = now;
    }

    // Only increment accumulated scores if the attempt is valid (anti-cheat passed)
    if (isValid) {
      session.dailyAccumulatedScore += score;
      session.weeklyAccumulatedScore += score;
    }
    
    await session.save();

    return res.status(200).json({
      isValid,
      score,
      weeklyAccumulatedScore: session.weeklyAccumulatedScore,
      currentLives: session.currentLives,
      nextRefillAt: session.nextRefillAt,
      gamesPlayedInCurrentHour: session.gamesPlayedInCurrentHour
    });
  } catch (error: any) {
    console.error('Error validating score:', error);
    if (error.message === 'OUT_OF_LIVES') {
      return res.status(400).json({ error: 'OUT_OF_LIVES' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

/**
 * Retrieves the Weekly Leaderboard. Sorts players using:
 * Weekly Accumulated Score (Desc) -> Total Games (Asc) -> Referral Points (Desc)
 */
export const getWeeklyLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const weekId = req.query.weekId ? parseInt(req.query.weekId as string) : getWeekId();
    
    // Aggregate weekly scores
    const leaderboard = await Score.aggregate([
      { $match: { weekId, isValid: true } },
      {
        $group: {
          _id: '$playerAddress',
          weeklyScore: { $sum: '$score' },
          gamesCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'players',
          localField: '_id',
          foreignField: 'address',
          as: 'playerInfo'
        }
      },
      { $unwind: '$playerInfo' },
      {
        $project: {
          address: '$_id',
          username: '$playerInfo.username',
          weeklyScore: 1,
          gamesCount: 1,
          referralPoints: '$playerInfo.referralPoints'
        }
      },
      {
        $sort: {
          weeklyScore: -1,
          gamesCount: 1,
          referralPoints: -1
        }
      },
      { $limit: 100 } // Limit to top 100 for leaderboard screen
    ]);

    return res.status(200).json({ weekId, leaderboard });
  } catch (error: any) {
    console.error('Error fetching weekly leaderboard:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

/**
 * Returns the All-Time Leaderboard. Sorts by single-game highest score.
 */
export const getAllTimeLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const leaderboard = await Score.aggregate([
      { $match: { isValid: true } },
      {
        $group: {
          _id: '$playerAddress',
          highScore: { $sum: '$score' },
          totalGames: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'players',
          localField: '_id',
          foreignField: 'address',
          as: 'playerInfo'
        }
      },
      { $unwind: '$playerInfo' },
      {
        $project: {
          address: '$_id',
          username: '$playerInfo.username',
          highScore: 1,
          totalGames: 1,
          referralPoints: '$playerInfo.referralPoints'
        }
      },
      {
        $sort: {
          highScore: -1,
          totalGames: 1
        }
      },
      { $limit: 100 }
    ]);

    return res.status(200).json({ leaderboard });
  } catch (error: any) {
    console.error('Error fetching all-time leaderboard:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

/**
 * Triggers weekly leaderboard resolution and awards badges.
 */
export const resolveWeeklyLeaderboard = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const weekId = req.body.weekId !== undefined ? parseInt(req.body.weekId as string) : getWeekId();
    
    if (isNaN(weekId)) {
      return res.status(400).json({ error: 'INVALID_WEEK_ID' });
    }

    await BadgeManager.resolveWeeklyRanksAndAwardBadges(weekId);
    
    return res.status(200).json({ success: true, message: `Weekly ranks resolved and badges awarded for week ${weekId}.` });
  } catch (error: any) {
    console.error('Error resolving weekly leaderboard:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};
