import express from 'express';
import type { Request, Response } from 'express';
import { ethers } from 'ethers';

const router = express.Router();

// Admin: Get backend signer address (for contract verification)
router.get('/signer', (req: Request, res: Response) => {
  const signer = req.app.locals.signer as ethers.Wallet;
  
  res.json({
    signerAddress: signer.address,
    message: 'Use this address to verify signatures in your smart contract'
  });
});

export default router;
