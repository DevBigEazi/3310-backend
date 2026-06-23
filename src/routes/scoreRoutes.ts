import { Router } from 'express';
import { 
  getGameSession, 
  startGame, 
  validateScore, 
  getWeeklyLeaderboard, 
  getAllTimeLeaderboard,
  resolveWeeklyLeaderboard
} from '../controllers/scoreController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = Router();

// Retrieve game session (lives, hourly limits)
router.get('/game-session/:address?', authenticateJWT, getGameSession);

// Start game attempt (returns gameSessionId)
router.post('/start', authenticateJWT, startGame);

// Validate/submit game score
router.post('/validate-score', authenticateJWT, validateScore);

// Fetch weekly leaderboard
router.get('/leaderboard/weekly', authenticateJWT, getWeeklyLeaderboard);

// Fetch all-time leaderboard
router.get('/leaderboard/all-time', authenticateJWT, getAllTimeLeaderboard);

// Trigger weekly leaderboard resolution and badge awarding
router.post('/leaderboard/resolve', authenticateJWT, resolveWeeklyLeaderboard);

export default router;
