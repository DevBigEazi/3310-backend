import { Router } from 'express';
import { createPlayer, getPlayer } from '../controllers/playerController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = Router();

// Registration/Login is public
router.post('/', createPlayer);

// Profile lookup is protected by JWT
router.get('/:address', authenticateJWT, getPlayer);

export default router;
