import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from 'smas-shared';
import { config } from '../config';

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token, config.SECRET_KEY);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
