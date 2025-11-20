import express from 'express';
import type { Response } from 'express';
import { ethers } from 'ethers';
import { jwtAuth } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Admin: Get backend signer address (for contract verification)
router.get('/signer', jwtAuth, (req: AuthRequest, res: Response) => {
  const signer = req.app.locals.signer as ethers.Wallet;
  
  res.json({
    signerAddress: signer.address,
    message: 'Admin signer address to verify signatures in the smart contract'
  });
});

export default router;
