import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export interface AuthRequest extends Request {
  user?: {
    address: string;
  };
}

export const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { address: string };
    
    if (!payload.address) {
      return res.status(401).json({ error: 'INVALID_TOKEN' });
    }
    
    req.user = { address: payload.address.toLowerCase() };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'INVALID_TOKEN' });
  }
};
