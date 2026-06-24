import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Player } from '../models/Player.js';
import { Score } from '../models/Score.js';

/**
 * Creates a new player or logs in an existing player.
 * Automatically generates a unique, alphanumeric referral code.
 * Rewards both the referrer (50 points) and referred user (25 points).
 */
export const createPlayer = async (req: Request, res: Response) => {
  try {
    const { address, username, email, referredBy } = req.body;

    if (!address || !username) {
      return res.status(400).json({ error: 'ADDRESS_AND_USERNAME_REQUIRED' });
    }

    const lowerAddress = address.toLowerCase();

    // Check if the player already exists by address
    let player = await Player.findOne({ address: lowerAddress });
    if (player) {
      const token = jwt.sign(
        { address: player.address },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '3650d' }
      );
      return res.status(200).json({ player, token });
    }

    // Check if the username is already taken by another player
    const existingUsername = await Player.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: 'USERNAME_TAKEN' });
    }

    // Check if the email is already registered by another player
    if (email) {
      const lowerEmail = email.toLowerCase();
      const existingEmail = await Player.findOne({ email: lowerEmail });
      if (existingEmail) {
        return res.status(400).json({ error: 'EMAIL_TAKEN' });
      }
    }

    // Generate unique 6-character uppercase alphanumeric referral code
    let referralCode = '';
    let isUnique = false;
    while (!isUnique) {
      referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const existingCode = await Player.findOne({ referralCode });
      if (!existingCode) {
        isUnique = true;
      }
    }

    let referredByAddress: string | null = null;
    let initialReferralPoints = 0;

    // Process referral code if provided
    if (referredBy) {
      const referrer = await Player.findOne({ referralCode: referredBy.toUpperCase() });
      if (referrer) {
        referredByAddress = referrer.address;
        initialReferralPoints = 25; // 25 points for being referred

        // Credit the referrer: 50 points and increment referral count
        referrer.referralPoints += 50;
        referrer.referralCount += 1;
        await referrer.save();
      }
    }

    player = new Player({
      address: lowerAddress,
      username,
      email,
      referralCode,
      referredBy: referredByAddress,
      referralPoints: initialReferralPoints,
      referralCount: 0
    });

    await player.save();

    const token = jwt.sign(
      { address: player.address },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '3650d' }
    );

    return res.status(201).json({ player, token });
  } catch (error: any) {
    console.error('Error creating player:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

/**
 * Retrieves player profile details and stats (total games played, highest score).
 */
export const getPlayer = async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'ADDRESS_REQUIRED' });
    }

    const lowerAddress = address.toLowerCase();
    const player = await Player.findOne({ address: lowerAddress });

    if (!player) {
      return res.status(404).json({ error: 'PLAYER_NOT_FOUND' });
    }

    // Calculate score statistics
    const scores = await Score.find({ playerAddress: lowerAddress, isValid: true });
    const highestScore = scores.reduce((sum, s) => sum + s.score, 0);
    const totalGames = scores.length;

    return res.status(200).json({
      player,
      stats: {
        highestScore,
        totalGames
      }
    });
  } catch (error: any) {
    console.error('Error fetching player profile:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

/**
 * Checks if a player exists by their wallet address.
 * Public endpoint (does not require JWT).
 */
export const checkPlayerExists = async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'ADDRESS_REQUIRED' });
    }

    const lowerAddress = address.toLowerCase();
    const player = await Player.findOne({ address: lowerAddress });

    return res.status(200).json({ exists: !!player });
  } catch (error: any) {
    console.error('Error checking player existence:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};
