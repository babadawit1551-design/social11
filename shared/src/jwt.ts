import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

export function createAccessToken(
  userId: string,
  role: string,
  secretKey: string,
  expiresInMinutes = 15,
): string {
  return jwt.sign(
    { sub: userId, role, type: 'access' } satisfies Omit<AccessTokenPayload, never>,
    secretKey,
    { expiresIn: expiresInMinutes * 60 },
  );
}

export function createRefreshToken(
  userId: string,
  secretKey: string,
  expiresInDays = 7,
): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' } satisfies Omit<RefreshTokenPayload, never>,
    secretKey,
    { expiresIn: expiresInDays * 24 * 60 * 60 },
  );
}

export function verifyAccessToken(token: string, secretKey: string): AccessTokenPayload {
  const payload = jwt.verify(token, secretKey) as AccessTokenPayload;
  if (payload.type !== 'access') throw new Error('Invalid token type');
  return payload;
}

export function verifyRefreshToken(token: string, secretKey: string): RefreshTokenPayload {
  const payload = jwt.verify(token, secretKey) as RefreshTokenPayload;
  if (payload.type !== 'refresh') throw new Error('Invalid token type');
  return payload;
}
