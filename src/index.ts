import express from 'express';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ==================== CONFIG ====================
const BACKEND_PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;
if (!BACKEND_PRIVATE_KEY) {
  console.error('BACKEND_PRIVATE_KEY environment variable is required');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/game3310';

// Create signer from backend private key
const signer = new ethers.Wallet(BACKEND_PRIVATE_KEY);
app.locals.signer = signer;

// ==================== DATABASE ====================
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('DB Connection Error:', err));

// ==================== ROUTES ====================

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`3310 Backend running on port ${PORT}`);
  console.log(`Backend signer: ${signer.address}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});

export default app;
