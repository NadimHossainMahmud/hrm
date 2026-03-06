import jwt from 'jsonwebtoken';
import { createLogger } from '../utils/logger';

const logger = createLogger();

// JWT Configuration
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret-change-in-production';
const JWT_ACCESS_EXPIRY: jwt.SignOptions['expiresIn'] = '15m';
const JWT_REFRESH_EXPIRY: jwt.SignOptions['expiresIn'] = '7d';

// Token payload interface
export interface TokenPayload {
  userId: string;
  email: string;
  tenantId: string;
  roleId: string;
  permissions: string[];
  type: 'access' | 'refresh';
}

// Generate access token
export const generateAccessToken = (payload: Omit<TokenPayload, 'type'>): string => {
  return jwt.sign(
    { ...payload, type: 'access' },
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
};

// Generate refresh token
export const generateRefreshToken = (payload: Omit<TokenPayload, 'type'>): string => {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY }
  );
};

// Verify access token
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as TokenPayload;
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    logger.warn('Access token verification failed', { error });
    throw new Error('Invalid or expired access token');
  }
};

// Verify refresh token
export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    logger.warn('Refresh token verification failed', { error });
    throw new Error('Invalid or expired refresh token');
  }
};

// Decode token without verification (for debugging)
export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
};

// Generate token pair (access + refresh)
export const generateTokenPair = (payload: Omit<TokenPayload, 'type'>) => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  
  return {
    accessToken,
    refreshToken,
    expiresIn: JWT_ACCESS_EXPIRY,
  };
};
