import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Player } from '../models/Player.js';
import { GameSession } from '../models/GameSession.js';
import { checkAndRewardReferrer, getWeekNumber } from '../utils/helpers.js';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate the project root directory
const rootDir = path.resolve(__dirname, '../..');

// Load environment variables from .env file
dotenv.config({ path: path.join(rootDir, '.env') });

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/game3310';

async function testReferralRewards() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create a test referrer
    const referrerAddress = '0x1234567890123456789012345678901234567890';
    let referrer = await Player.findOne({ address: referrerAddress });
    
    if (!referrer) {
      referrer = new Player({
        address: referrerAddress,
        username: 'TestReferrer',
        email: 'referrer@test.com',
        referralCode: 'TEST1234',
        referralPoints: 0
      });
      await referrer.save();
      console.log('Created test referrer:', referrer);
    } else {
      console.log('Using existing referrer:', referrer);
    }

    // Create a test referred player
    const referredAddress = '0x0987654321098765432109876543210987654321';
    let referred = await Player.findOne({ address: referredAddress });
    
    if (!referred) {
      referred = new Player({
        address: referredAddress,
        username: 'TestReferred',
        email: 'referred@test.com',
        referredBy: referrerAddress,
        referralCode: 'TEST5678',
        referralPoints: 0
      });
      await referred.save();
      console.log('Created test referred player:', referred);
    } else {
      // Make sure it's linked to our referrer
      referred.referredBy = referrerAddress;
      await referred.save();
      console.log('Using existing referred player:', referred);
    }

    // Create or update game session for referred player
    const currentWeek = getWeekNumber();
    let gameSession = await GameSession.findOne({
      playerAddress: referredAddress,
      weekNumber: currentWeek
    });

    if (!gameSession) {
      gameSession = new GameSession({
        playerAddress: referredAddress,
        firstGameInHour: new Date(),
        gamesPlayedInCurrentHour: 0,
        weekNumber: currentWeek,
        weeklyAccumulatedScore: 0,
        lastUpdated: new Date()
      });
    }

    // Simulate scoring 30 points (not enough to trigger reward)
    console.log('Before first score - Referrer points:', referrer.referralPoints);
    console.log('Before first score - Referred player points:', referred.referralPoints);
    gameSession.weeklyAccumulatedScore = 30;
    await gameSession.save();
    await checkAndRewardReferrer(referredAddress, 30);
    
    // Check referrer points (should still be 0)
    referrer = await Player.findOne({ address: referrerAddress });
    referred = await Player.findOne({ address: referredAddress });
    
    // Get game sessions to check weekly scores
    let referrerGameSession = await GameSession.findOne({ 
      playerAddress: referrerAddress,
      weekNumber: currentWeek
    });
    
    console.log('After first score (30 points):');
    console.log('- Referrer points:', referrer?.referralPoints || 0);
    console.log('- Referred player points:', referred?.referralPoints || 0);
    console.log('- Referrer weekly score:', referrerGameSession?.weeklyAccumulatedScore || 0);
    console.log('- Referred weekly score:', gameSession.weeklyAccumulatedScore);

    // Simulate scoring 25 more points (crossing the 50-point threshold)
    const initialScore = gameSession.weeklyAccumulatedScore;
    gameSession.weeklyAccumulatedScore = 55; // This is 30 + 25 = 55
    await gameSession.save();
    await checkAndRewardReferrer(referredAddress, 25);
    
    // Check referrer points (should now be 50) and referred player points (should now be 25)
    referrer = await Player.findOne({ address: referrerAddress });
    referred = await Player.findOne({ address: referredAddress });
    
    // Get updated game sessions
    referrerGameSession = await GameSession.findOne({ 
      playerAddress: referrerAddress,
      weekNumber: currentWeek
    });
    gameSession = await GameSession.findOne({ 
      playerAddress: referredAddress,
      weekNumber: currentWeek
    });
    
    console.log('\nAfter second score (55 total points):');
    console.log('- Referrer points:', referrer?.referralPoints || 0);
    console.log('- Referred player points:', referred?.referralPoints || 0);
    console.log('- Referrer weekly score:', referrerGameSession?.weeklyAccumulatedScore || 0);
    console.log('- Referred weekly score:', gameSession?.weeklyAccumulatedScore || 0);
    console.log('- Referred player bonus points added:', (gameSession?.weeklyAccumulatedScore || 0) - 55);

    // Simulate scoring more points (should not give more rewards)
    const scoreBeforeThird = gameSession?.weeklyAccumulatedScore || 0;
    if (gameSession) {
      gameSession.weeklyAccumulatedScore = 75;
      await gameSession.save();
    }
    await checkAndRewardReferrer(referredAddress, 20);
    
    // Check referrer points (should still be 50) and referred player points (should still be 25)
    referrer = await Player.findOne({ address: referrerAddress });
    referred = await Player.findOne({ address: referredAddress });
    
    // Get updated game sessions
    referrerGameSession = await GameSession.findOne({ 
      playerAddress: referrerAddress,
      weekNumber: currentWeek
    });
    gameSession = await GameSession.findOne({ 
      playerAddress: referredAddress,
      weekNumber: currentWeek
    });
    
    console.log('\nAfter third score (75 total points):');
    console.log('- Referrer points:', referrer?.referralPoints || 0);
    console.log('- Referred player points:', referred?.referralPoints || 0);
    console.log('- Referrer weekly score:', referrerGameSession?.weeklyAccumulatedScore || 0);
    console.log('- Referred weekly score:', gameSession?.weeklyAccumulatedScore || 0);
    console.log('- No additional bonus should be added:', gameSession?.weeklyAccumulatedScore === 75);

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the test
testReferralRewards();
