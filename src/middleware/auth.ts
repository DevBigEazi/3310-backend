import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// JWT secret key - accessed via function to ensure it's loaded after dotenv
const getJwtSecret = (): string | undefined => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET environment variable is required');
    // Not exiting the process here as it would stop the server
    // Instead, we'll handle this in the middleware
  }
  return secret;
};

// Extended Request interface to include JWT payload
export interface AuthRequest extends Request {
  jwtPayload?: Record<string, any>;
}

/**
 * Simple JWT authentication middleware
 * Verifies the token and adds the payload to the request
 */
export const jwtAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    // Check if JWT_SECRET is available
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      res.status(500).json({ error: 'Server authentication configuration error' });
      return;
    }

    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({ error: 'No authorization token provided' });
      return;
    }
    
    // Format should be "Bearer [token]"
    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Invalid authorization format' });
      return;
    }
    
    // Verify token - only checks validity, not creating expiration
    const payload = jwt.verify(token, jwtSecret);
    
    // Add payload to request object
    req.jwtPayload = payload as Record<string, any>;
    
    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Generate JWT token with custom payload
 * Note: Expiration should be set by the caller if needed
 */
export const generateToken = (
  payload: Record<string, any>,
  options?: jwt.SignOptions
): string => {
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return jwt.sign(payload, jwtSecret, options || {});
};