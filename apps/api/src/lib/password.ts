import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

// Hash password
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

// Compare password with hash
export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

// Generate secure random token
export const generateToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate MFA secret (base32 encoded)
export const generateMFASecret = (): string => {
  return crypto.randomBytes(20).toString('base64url');
};

// Generate backup codes
export const generateBackupCodes = (count: number = 8): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Format: XXXX-XXXX-XXXX (12 characters, groups of 4)
    const code = crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 12);
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`);
  }
  return codes;
};

// Hash backup codes for storage
export const hashBackupCodes = async (codes: string[]): Promise<string[]> => {
  return Promise.all(
    codes.map(code => bcrypt.hash(code.replace(/-/g, ''), SALT_ROUNDS))
  );
};

// Verify backup code
export const verifyBackupCode = async (
  code: string,
  hashedCodes: string[]
): Promise<boolean> => {
  const normalizedCode = code.replace(/-/g, '').toUpperCase();
  
  for (const hashedCode of hashedCodes) {
    if (await bcrypt.compare(normalizedCode, hashedCode)) {
      return true;
    }
  }
  return false;
};

// Generate password reset token with expiry
export const generatePasswordResetToken = (): { token: string; expiresAt: Date } => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry
  
  return { token, expiresAt };
};

// Generate email verification token
export const generateEmailVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};
