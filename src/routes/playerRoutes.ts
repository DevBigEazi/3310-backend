import express from 'express';
import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import { Player } from '../models/Player.js';
import { Score } from '../models/Score.js';
import { GameSession } from '../models/GameSession.js';
import { jwtAuth } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { getWeekNumber, MAX_GAMES_PER_HOUR } from '../utils/helpers.js';

const router = express.Router();

// Get player stats
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const addressParam = req.params.address;
    
    if (!addressParam) {
      return res.status(400).json({ error: 'Address parameter is required' });
    }
    
    const address = addressParam.toLowerCase();
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const player = await Player.findOne({ address });
    if (!player) {
      console.log(`Player not found for address: ${address}`);
      return res.status(404).json({ error: 'Player not found' });
    }

    const currentWeek = getWeekNumber();
    
    // Get player's weekly accumulated score
    const gameSession = await GameSession.findOne(
      { playerAddress: address, weekNumber: currentWeek },
      { weeklyAccumulatedScore: 1, gamesPlayedInCurrentHour: 1, firstGameInHour: 1 }
    );
    
    // Get player's best individual score for the week
    const weeklyBestScore = await Score.findOne(
      { playerAddress: address, weekNumber: currentWeek, isValid: true },
      { score: 1 },
      { sort: { score: -1 } }
    );

    // Calculate games remaining in current hour
    const gamesRemaining = gameSession ? 
      Math.max(0, MAX_GAMES_PER_HOUR - gameSession.gamesPlayedInCurrentHour) : 
      MAX_GAMES_PER_HOUR;

    res.json({
      address: player.address,
      username: player.username,
      email: player.email,
      createdAt: player.createdAt,
      totalScoresSubmitted: player.totalScoresSubmitted,
      lifetimeEarnings: player.lifetimeEarnings,
      weeklyBestScore: weeklyBestScore?.score || 0,
      weeklyAccumulatedScore: gameSession?.weeklyAccumulatedScore || 0,
      gamesRemaining
    });
  } catch (error) {
    console.error('Player stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new player
router.post('/', jwtAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Get address from request body
    const { address } = req.body;
    const { username, email } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    const normalizedAddress = address.toLowerCase();
    
    if (!ethers.isAddress(normalizedAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Check if player already exists
    const existingPlayer = await Player.findOne({ address: normalizedAddress });
    if (existingPlayer) {
      // If player exists but doesn't have a username, update it
      if (!existingPlayer.username && username) {
        existingPlayer.username = username;
        if (email) existingPlayer.email = email;
        await existingPlayer.save();
        return res.status(200).json(existingPlayer);
      }
      return res.status(409).json({ error: 'Player already exists', player: existingPlayer });
    }

    // Create new player
    const newPlayer = new Player({
      address: normalizedAddress,
      username,
      email,
      createdAt: new Date(),
      totalScoresSubmitted: 0,
      lifetimeEarnings: 0
    });

    await newPlayer.save();
    res.status(201).json(newPlayer);
  } catch (error) {
    console.error('Create player error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
