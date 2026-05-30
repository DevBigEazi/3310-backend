import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import serverless from 'serverless-http';
import playerRoutes from './routes/playerRoutes.js';
import scoreRoutes from './routes/scoreRoutes.js';

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

// Database and Server startup for local development
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      console.log('Successfully connected to MongoDB.');
      app.listen(PORT, () => {
        console.log(`Backend server is running on port ${PORT}`);
      });
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

