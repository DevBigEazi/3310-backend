import { Router } from 'express';
import { createPlayer, getPlayer, checkPlayerExists } from '../controllers/playerController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = Router();

// Registration/Login is public
router.post('/', createPlayer);
router.get('/check/:address', checkPlayerExists);

// Profile lookup is protected by JWT
router.get('/:address', authenticateJWT, getPlayer);

export default router;
