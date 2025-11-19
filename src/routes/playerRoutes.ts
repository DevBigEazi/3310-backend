import express from 'express';
import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import { Player } from '../models/Player.js';

const router = express.Router();

// Create a new player
router.post('/', async (req: Request, res: Response) => {
  try {
    const { address, username, email } = req.body;
    
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
