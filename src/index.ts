import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import serverless from 'serverless-http';
import playerRoutes from './routes/playerRoutes.js';
import scoreRoutes from './routes/scoreRoutes.js';
import { getWeekId } from './utils/timeUtils.js';
import { BadgeManager } from './services/badgeManager.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://UserScore:<db_password>@userscore.z7kjy1z.mongodb.net/test';

app.use(cors());
app.use(express.json());

// Mount routers
app.use('/api/player', playerRoutes);
app.use('/api/scores', scoreRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

function scheduleNextResolution() {
  const now = new Date();
  const nextMonday = new Date();
  nextMonday.setUTCHours(0, 0, 0, 0);
  const day = nextMonday.getUTCDay();
  const daysToAdd = (8 - day) % 7 || 7;
  nextMonday.setUTCDate(nextMonday.getUTCDate() + daysToAdd);

  let msToNextMonday = nextMonday.getTime() - now.getTime();
  if (msToNextMonday <= 0) {
    msToNextMonday += 7 * 24 * 60 * 60 * 1000;
  }
  
  console.log(`Local resolution scheduled for next Monday ${nextMonday.toISOString()} (in ${Math.round(msToNextMonday / 1000 / 60)} minutes)`);
  
  setTimeout(async () => {
    try {
      const weekId = getWeekId() - 1;
      console.log(`[Local Scheduler] Resolving weekly leaderboard for week ${weekId}...`);
      await BadgeManager.resolveWeeklyRanksAndAwardBadges(weekId);
      console.log(`[Local Scheduler] Weekly leaderboard resolved for week ${weekId}.`);
    } catch (error) {
      console.error(`[Local Scheduler] Error resolving week:`, error);
    }
    scheduleNextResolution();
  }, msToNextMonday);
}

// Database and Server startup for local development
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      console.log('Successfully connected to MongoDB.');
      app.listen(PORT, () => {
        console.log(`Backend server is running on port ${PORT}`);
      });
      // Start local scheduler
      scheduleNextResolution();
    })
    .catch((error) => {
      console.error('Database connection error:', error);
      process.exit(1);
    });
}

// Serverless Handler for AWS Lambda
const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  // Prevent Lambda from hanging if database connection is kept open in event loop
  context.callbackWaitsForEmptyEventLoop = false;

  // Connect to MongoDB if not already connected
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('Successfully connected to MongoDB (Serverless).');
    } catch (error) {
      console.error('Database connection error (Serverless):', error);
      throw error;
    }
  }

  return serverlessHandler(event, context);
};

// Scheduled Weekly Leaderboard Resolution for AWS Lambda
export const resolveWeeklyHandler = async (event: any, context: any) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('Successfully connected to MongoDB for weekly resolution.');
    } catch (error) {
      console.error('Database connection error during weekly resolution:', error);
      throw error;
    }
  }

  const weekId = getWeekId() - 1;
  console.log(`Scheduled weekly resolution started for weekId: ${weekId}`);
  try {
    await BadgeManager.resolveWeeklyRanksAndAwardBadges(weekId);
    console.log(`Scheduled weekly resolution finished successfully for weekId: ${weekId}`);
  } catch (error) {
    console.error(`Scheduled weekly resolution failed for weekId: ${weekId}`, error);
    throw error;
  }
};

