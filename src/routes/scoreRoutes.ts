import express from "express";
import type { Request, Response } from "express";
import { ethers } from "ethers";
import { rateLimit } from "express-rate-limit";
import { Player } from "../models/Player.js";
import { Score } from "../models/Score.js";
import { GameSession } from "../models/GameSession.js";
import { jwtAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import {
  getDayId,
  isScoreValid,
  signScore,
  getTimeRemainingUntilNextSession,
  formatTimeRemaining,
  MAX_GAMES_PER_HOUR,
  HOUR_IN_MS,
  checkAndRewardReferrer,
} from "../utils/helpers.js";

const router = express.Router();

// Rate limiting
const validateScoreLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 requests per minute per IP
  message: { error: "Too many validation requests" },
});

// Types
interface ValidateScoreRequest {
  playerAddress: string;
  score: number;
  gameSessionId: string;
  timestamp?: number;
}

// Validate and sign score
router.post(
  "/validate-score",
  validateScoreLimiter,
  jwtAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { playerAddress, score, gameSessionId, timestamp } =
        req.body as ValidateScoreRequest;
      const signer = req.app.locals.signer as ethers.Wallet;
      const now = new Date();
      const currentDay = getDayId(now);

      // Input validation
      if (!playerAddress || score === undefined || !gameSessionId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate address format
      if (!ethers.isAddress(playerAddress)) {
        return res.status(400).json({ error: "Invalid player address" });
      }

      // Validate score
      if (!isScoreValid(score)) {
        return res
          .status(400)
          .json({
            error: `Score must be between ${process.env.MIN_SCORE || 0} and ${process.env.MAX_SCORE || 100000
              }`,
          });
      }

      // Check for duplicate gameSessionId (prevent replay attacks)
      const existingSubmission = await Score.findOne({ gameSessionId });
      if (existingSubmission) {
        return res
          .status(400)
          .json({ error: "Game session already submitted" });
      }

      // Get or create player game session for the current day
      let gameSession = await GameSession.findOne({
        playerAddress,
        dayId: currentDay,
      });

      if (!gameSession) {
        // First game of the day for this player
        gameSession = new GameSession({
          playerAddress,
          firstGameInHour: now,
          gamesPlayedInCurrentHour: 0,
          dayId: currentDay,
          dailyAccumulatedScore: 0,
          lastUpdated: now,
        });
      }

      // Check if we need to reset the hourly counter
      const timeRemaining = getTimeRemainingUntilNextSession(
        gameSession.firstGameInHour
      );

      if (timeRemaining.canPlay) {
        // Hour has passed since first game, reset counter
        gameSession.gamesPlayedInCurrentHour = 0;
        gameSession.firstGameInHour = now;
      }

      // Check if player has reached the hourly game limit
      if (gameSession.gamesPlayedInCurrentHour >= MAX_GAMES_PER_HOUR) {
        const resetTime = new Date(
          gameSession.firstGameInHour.getTime() + HOUR_IN_MS
        );
        return res.status(429).json({
          error: "Game limit reached for this hour",
          timeRemaining: {
            ms: timeRemaining.timeRemainingMs,
            formatted: formatTimeRemaining(timeRemaining.timeRemainingMs),
            resetTime: resetTime.toISOString(),
          },
        });
      }

      // Use provided timestamp or server timestamp
      const submitTimestamp = timestamp || Math.floor(now.getTime() / 1000);

      // Sign the score
      const signature = signScore(
        signer,
        playerAddress,
        score,
        gameSessionId,
        submitTimestamp
      );

      // Increment games played counter and update accumulated score
      gameSession.gamesPlayedInCurrentHour += 1;
      gameSession.dailyAccumulatedScore += score;
      gameSession.lastUpdated = now;

      // If player has reached the hourly limit, reset the hour window to start from now
      // This forces the player to wait a full hour before playing again
      if (gameSession.gamesPlayedInCurrentHour >= MAX_GAMES_PER_HOUR) {
        gameSession.firstGameInHour = now;
      }

      await gameSession.save();

      // Save individual score to database
      const scoreDoc = new Score({
        playerAddress,
        score, // Save the individual game score, not the accumulated total
        gameSessionId,
        signature,
        submittedAt: now,
        dayId: currentDay,
        isValid: true,
      });
      await scoreDoc.save();

      // Update player stats
      await Player.findOneAndUpdate(
        { address: playerAddress },
        {
          $inc: { totalScoresSubmitted: 1 },
          $setOnInsert: { address: playerAddress },
        },
        { upsert: true }
      );

      // Check if the player has reached 50 points and reward their referrer if applicable
      await checkAndRewardReferrer(
        playerAddress,
        gameSession.dailyAccumulatedScore
      );

      // Calculate games remaining in this hour
      const gamesRemaining =
        MAX_GAMES_PER_HOUR - gameSession.gamesPlayedInCurrentHour;

      res.json({
        success: true,
        score,
        signature,
        playerAddress,
        gameSessionId,
        timestamp: submitTimestamp,
        dailyAccumulatedScore: gameSession.dailyAccumulatedScore,
        currentDay,
        gamesRemaining,
        message: "Score validated and signed",
      });
    } catch (error) {
      console.error("Validation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * Get current day's aggregated metrics for smart contract submission
 * Called when player wants to submit their score to the smart contract
 */
router.get("/daily-stats/:address", async (req: Request, res: Response) => {
  try {
    const addressParam = req.params.address;

    if (!addressParam) {
      return res.status(400).json({ error: "Address parameter is required" });
    }

    const address = addressParam.toLowerCase();

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const currentDay = getDayId();
    const signer = req.app.locals.signer as ethers.Wallet;
    const MIN_QUALIFICATION_SCORE = 500;

    // 1. Get aggregated game scores for the day
    const stats = await Score.aggregate([
      {
        $match: {
          playerAddress: address,
          dayId: currentDay,
          isValid: true,
        },
      },
      {
        $group: {
          _id: null,
          totalScore: { $sum: "$score" },
          highestGameScore: { $max: "$score" },
          gameCount: { $sum: 1 },
        },
      },
    ]);

    const dailyStats = stats[0] || {
      totalScore: 0,
      highestGameScore: 0,
      gameCount: 0,
    };

    // 2. Get referral points (daily and lifetime)
    const player = await Player.findOne({ address });
    const lifetimeReferralPoints = player?.referralPoints || 0;

    const gameSession = await GameSession.findOne({
      playerAddress: address,
      dayId: currentDay,
    });
    const dailyReferralPoints = gameSession?.dailyReferralPoints || 0;

    // 3. COMBINE score + DAILY referral points for submission
    // We use dailyReferralPoints (earned today) instead of lifetime points
    const combinedScore = dailyStats.totalScore + dailyReferralPoints;

    // 4. Check qualification based on COMBINED score
    if (combinedScore < MIN_QUALIFICATION_SCORE) {
      return res.status(400).json({
        error: `Score must be at least ${MIN_QUALIFICATION_SCORE} to submit`,
        currentScore: combinedScore,
        scoreNeeded: MIN_QUALIFICATION_SCORE - combinedScore,
      });
    }

    // 6. Create the message hash using abi.encodePacked format
    // Send COMBINED score (game score + daily referral points)
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
        [
          address,
          currentDay,
          combinedScore, // Game score + DAILY referral points
          dailyStats.highestGameScore,
          dailyStats.gameCount,
          lifetimeReferralPoints, // Still included for tiebreaker logic (lifetime)
        ]
      )
    );

    // 6. Create the Ethereum signed message (adds the prefix)
    const messageHashBytes = ethers.getBytes(messageHash);
    const ethSignedMessageHash = ethers.hashMessage(messageHashBytes);

    // 7. Sign and get the signature as a hex string
    const signature = signer.signingKey.sign(ethSignedMessageHash).serialized;

    console.log("Signature generation debug:", {
      address,
      currentDay,
      gameScore: dailyStats.totalScore,
      dailyReferralPoints,
      lifetimeReferralPoints,
      combinedScore: combinedScore, // Total for ranking
      highestGameScore: dailyStats.highestGameScore,
      gameCount: dailyStats.gameCount,
      messageHash,
      ethSignedMessageHash,
      signature,
      signatureType: typeof signature,
    });

    res.json({
      success: true,
      dayId: currentDay,
      playerAddress: address,
      score: combinedScore, // Combined score for ranking
      gameScore: dailyStats.highestGameScore,
      gameCount: dailyStats.gameCount,
      referralPoints: lifetimeReferralPoints, // Still sent for tiebreaker
      signature: signature,
      message: "Ready to submit to smart contract",
    });
  } catch (error) {
    console.error("Daily stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get player leaderboard (current day)
router.get("/leaderboard/daily", async (_req: Request, res: Response) => {
  try {
    const currentDay = getDayId();
    const MIN_QUALIFICATION_SCORE = 500;

    // Get accumulated scores from GameSession collection and join with Player for referral points
    const leaderboard = await GameSession.aggregate([
      { $match: { dayId: currentDay } },
      {
        $lookup: {
          from: "players",
          localField: "playerAddress",
          foreignField: "address",
          as: "player",
        },
      },
      { $unwind: { path: "$player", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          totalScore: "$dailyAccumulatedScore",
        },
      },
      {
        $sort: {
          totalScore: -1,
          gamesPlayedInCurrentHour: 1,
          "player.referralPoints": -1,
          "player.createdAt": 1,
        },
      },
      { $limit: 100 },
    ]);

    const qualified = leaderboard.filter(
      (entry) => entry.dailyAccumulatedScore >= MIN_QUALIFICATION_SCORE
    );
    const topTen = qualified.slice(0, 10);

    res.json({
      type: "daily",
      dayId: currentDay,
      totalPlayers: qualified.length,
      topTen: topTen.map((entry, index) => ({
        rank: index + 1,
        address: entry.playerAddress,
        score: entry.totalScore,
        gameScore: entry.dailyAccumulatedScore,
        referralPoints: entry.player?.referralPoints || 0,
      })),
      playerScores: qualified.map((entry) => ({
        address: entry.playerAddress,
        score: entry.totalScore,
        gameScore: entry.dailyAccumulatedScore,
        referralPoints: entry.player?.referralPoints || 0,
      })),
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all-time leaderboard
router.get("/leaderboard/all-time", async (_req: Request, res: Response) => {
  try {
    // First, get all valid scores grouped by player and sum them up
    const leaderboard = await Score.aggregate([
      {
        $match: {
          isValid: true,
          score: { $gt: 0 }, // Ensure we only include positive scores
        },
      },
      {
        $group: {
          _id: "$playerAddress",
          totalGameScore: { $sum: "$score" },
          gameCount: { $sum: 1 },
          lastPlayed: { $max: "$submittedAt" }, // Add last played timestamp for tie-breaking
        },
      },
      {
        $lookup: {
          from: "players",
          localField: "_id",
          foreignField: "address",
          as: "player",
        },
      },
      { $unwind: { path: "$player", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          totalScore: {
            $add: [
              "$totalGameScore",
              { $ifNull: ["$player.referralPoints", 0] },
            ],
          },
        },
      },
      {
        $sort: {
          totalScore: -1,
          gameCount: 1,
          "player.referralPoints": -1,
          "player.createdAt": 1,
        },
      },
      { $limit: 100 },
    ]);

    res.json({
      type: "all-time",
      totalPlayers: leaderboard.length,
      topScores: leaderboard.map(
        (
          entry: {
            _id: string;
            totalGameScore: number;
            gameCount: number;
            totalScore: number;
            player?: { referralPoints: number };
          },
          idx: number
        ) => ({
          rank: idx + 1,
          address: entry._id,
          score: entry.totalScore,
          gameScore: entry.totalGameScore,
          gameCount: entry.gameCount,
          referralPoints: entry.player?.referralPoints || 0,
        })
      ),
    });
  } catch (error) {
    console.error("All-time leaderboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get player's current game session status
router.get("/game-session/:address", async (req: Request, res: Response) => {
  try {
    const addressParam = req.params.address;

    if (!addressParam) {
      return res.status(400).json({ error: "Address parameter is required" });
    }

    const address = addressParam.toLowerCase();

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const currentDay = getDayId();
    const gameSession = await GameSession.findOne({
      playerAddress: address,
      dayId: currentDay,
    });

    if (!gameSession) {
      // No game session found for this day
      return res.json({
        playerAddress: address,
        dayId: currentDay,
        dailyAccumulatedScore: 0,
        gamesPlayedInCurrentHour: 0,
        gamesRemaining: MAX_GAMES_PER_HOUR,
        canPlay: true,
        timeRemaining: {
          ms: 0,
          formatted: "00:00",
        },
      });
    }

    // Check if we need to reset the hourly counter
    const timeRemaining = getTimeRemainingUntilNextSession(
      gameSession.firstGameInHour
    );
    const gamesPlayedInCurrentHour = timeRemaining.canPlay
      ? 0
      : gameSession.gamesPlayedInCurrentHour;
    const gamesRemaining = MAX_GAMES_PER_HOUR - gamesPlayedInCurrentHour;
    const canPlay = gamesRemaining > 0 || timeRemaining.canPlay;

    res.json({
      playerAddress: address,
      dayId: currentDay,
      dailyAccumulatedScore: gameSession.dailyAccumulatedScore,
      gamesPlayedInCurrentHour,
      gamesRemaining,
      canPlay,
      dailyReferralPoints: gameSession.dailyReferralPoints || 0,
      timeRemaining: {
        ms: timeRemaining.timeRemainingMs,
        formatted: formatTimeRemaining(timeRemaining.timeRemainingMs),
        resetTime: new Date(
          gameSession.firstGameInHour.getTime() + HOUR_IN_MS
        ).toISOString(),
      },
    });
  } catch (error) {
    console.error("Game session status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
