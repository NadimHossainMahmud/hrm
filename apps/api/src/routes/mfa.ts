import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { generateMFASecret, generateBackupCodes, hashBackupCodes, verifyBackupCode } from '../lib/password';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { ApiError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

const logger = createLogger();
const router = Router();

// MFA setup schema
const mfaSetupSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

// MFA verify schema
const mfaVerifySchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
  tempToken: z.string(),
});

// MFA disable schema
const mfaDisableSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

// POST /v1/mfa/setup - Initialize MFA setup
router.post(
  '/setup',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      // Check if MFA is already enabled
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      if (user.mfaEnabled) {
        throw new ApiError(400, 'MFA is already enabled');
      }

      // Generate MFA secret
      const secret = speakeasy.generateSecret({
        name: `HRForge:${user.email}`,
        length: 32,
      });

      // Store encrypted secret temporarily (will be confirmed)
      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaSecret: secret.base32,
        },
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

      logger.info('MFA setup initiated', { userId });

      res.status(200).json({
        success: true,
        message: 'MFA setup initiated',
        data: {
          secret: secret.base32,
          qrCode: qrCodeUrl,
          manualEntryKey: secret.base32,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/mfa/verify-setup - Verify and enable MFA
router.post(
  '/verify-setup',
  authenticate,
  validateBody(mfaSetupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { code } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.mfaSecret) {
        throw new ApiError(400, 'MFA setup not initiated');
      }

      if (user.mfaEnabled) {
        throw new ApiError(400, 'MFA is already enabled');
      }

      // Verify TOTP code
      const verified = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: code,
        window: 2, // Allow 2 time steps drift
      });

      if (!verified) {
        throw new ApiError(400, 'Invalid verification code');
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes(8);
      const hashedBackupCodes = await hashBackupCodes(backupCodes);

      // Enable MFA
      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaBackupCodes: hashedBackupCodes,
        },
      });

      logger.info('MFA enabled', { userId });

      res.status(200).json({
        success: true,
        message: 'MFA enabled successfully',
        data: {
          backupCodes, // Show only once!
          warning: 'Save these backup codes in a secure location. They will not be shown again.',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/mfa/verify - Verify MFA code during login
router.post(
  '/verify',
  validateBody(mfaVerifySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, tempToken } = req.body;

      // TODO: Decode temp token to get userId
      // For now, this is a simplified version
      // In production, you'd verify the tempToken and extract userId

      throw new ApiError(501, 'MFA verification endpoint needs temp token implementation');
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/mfa/disable - Disable MFA
router.post(
  '/disable',
  authenticate,
  validateBody(mfaDisableSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { code } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      if (!user.mfaEnabled || !user.mfaSecret) {
        throw new ApiError(400, 'MFA is not enabled');
      }

      // Verify TOTP code
      const verified = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: code,
        window: 2,
      });

      if (!verified) {
        throw new ApiError(400, 'Invalid verification code');
      }

      // Disable MFA
      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: [],
        },
      });

      logger.info('MFA disabled', { userId });

      res.status(200).json({
        success: true,
        message: 'MFA disabled successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/mfa/verify-backup - Verify backup code
router.post(
  '/verify-backup',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { code } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.mfaEnabled) {
        throw new ApiError(400, 'MFA is not enabled');
      }

      // Verify backup code
      const isValidBackup = await verifyBackupCode(code, user.mfaBackupCodes);

      if (!isValidBackup) {
        throw new ApiError(400, 'Invalid backup code');
      }

      // TODO: Remove used backup code from array
      // This requires updating the array in the database

      res.status(200).json({
        success: true,
        message: 'Backup code verified',
      });
    } catch (error) {
      next(error);
    }
  }
);

export const mfaRouter = router;
