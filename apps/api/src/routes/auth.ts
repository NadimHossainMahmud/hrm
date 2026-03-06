import { Router, Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '@hrforge/shared';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPassword, comparePassword, generatePasswordResetToken } from '../lib/password';
import { generateTokenPair, verifyRefreshToken } from '../lib/jwt';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { ApiError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';
import { emitUserLogin, emitUserLogout, emitUserRegistered } from '../lib/events';

const logger = createLogger();
const router = Router();

// Cookie options for refresh token
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// POST /v1/auth/register - Create tenant and admin user
router.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { companyName, adminEmail, adminPassword, adminFirstName, adminLastName } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: adminEmail },
      });

      if (existingUser) {
        throw new ApiError(409, 'User with this email already exists');
      }

      // Generate slug from company name
      const slug = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Check if slug is taken
      const existingTenant = await prisma.tenant.findUnique({
        where: { slug },
      });

      if (existingTenant) {
        throw new ApiError(409, 'Company name already taken');
      }

      // Get the admin role (will be created in seed)
      const adminRole = await prisma.role.findFirst({
        where: { name: 'admin' },
      });

      if (!adminRole) {
        throw new ApiError(500, 'System roles not initialized. Please run database seed.');
      }

      // Hash password
      const hashedPassword = await hashPassword(adminPassword);

      // Create tenant and admin user in transaction
      const result = await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: companyName,
            slug,
          },
        });

        // Create admin user
        const user = await tx.user.create({
          data: {
            email: adminEmail,
            password: hashedPassword,
            firstName: adminFirstName,
            lastName: adminLastName,
            tenantId: tenant.id,
            roleId: adminRole.id,
          },
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        });

        return { tenant, user };
      });

      // Get user permissions
      const permissions = result.user.role.rolePermissions.map(
        (rp: { permission: { key: string } }) => rp.permission.key
      );

      // Generate tokens
      const tokens = generateTokenPair({
        userId: result.user.id,
        email: result.user.email,
        tenantId: result.tenant.id,
        roleId: result.user.roleId,
        permissions,
      });

      // Store refresh token
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: result.user.id,
          expiresAt: refreshTokenExpiry,
        },
      });

      // Set refresh token cookie
      res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      // Emit audit event
      emitUserRegistered(result.user.id, result.tenant.id, result.user.email);

      logger.info('User registered', {
        userId: result.user.id,
        tenantId: result.tenant.id,
        email: adminEmail,
      });

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            tenantId: result.tenant.id,
            roleId: result.user.roleId,
          },
          tenant: {
            id: result.tenant.id,
            name: result.tenant.name,
            slug: result.tenant.slug,
          },
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/auth/login - Authenticate user
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      // Find user with role and permissions
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        throw new ApiError(401, 'Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await comparePassword(password, user.password);

      if (!isPasswordValid) {
        throw new ApiError(401, 'Invalid credentials');
      }

      // Check if MFA is enabled
      if (user.mfaEnabled) {
        // Return partial auth - require MFA verification
        return res.status(200).json({
          success: true,
          message: 'MFA verification required',
          data: {
            mfaRequired: true,
            userId: user.id,
            tempToken: generateTokenPair({
              userId: user.id,
              email: user.email,
              tenantId: user.tenantId,
              roleId: user.roleId,
              permissions: [], // No permissions until MFA verified
            }).accessToken,
          },
        });
      }

      // Get user permissions
      const permissions = user.role.rolePermissions.map(
        (rp: { permission: { key: string } }) => rp.permission.key
      );

      // Generate tokens
      const tokens = generateTokenPair({
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        roleId: user.roleId,
        permissions,
      });

      // Store refresh token
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: refreshTokenExpiry,
        },
      });

      // Set refresh token cookie
      res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      // Emit audit event
      emitUserLogin(user.id, user.tenantId, req.ip, req.headers['user-agent']);

      logger.info('User logged in', { userId: user.id, email: user.email });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tenantId: user.tenantId,
            roleId: user.roleId,
          },
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/auth/logout - Logout user
router.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refreshToken;

      // Revoke refresh token if exists
      if (refreshToken) {
        await prisma.refreshToken.updateMany({
          where: { token: refreshToken },
          data: { revokedAt: new Date() },
        });
      }

      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      // Emit audit event
      if (req.user) {
        emitUserLogout(req.user.userId, req.user.tenantId, req.ip);
        logger.info('User logged out', { userId: req.user.userId });
      }

      res.status(200).json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/auth/refresh - Refresh access token
router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        throw new ApiError(401, 'Refresh token required');
      }

      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Check if token exists and is not revoked
      const storedToken = await prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!storedToken) {
        throw new ApiError(401, 'Invalid or expired refresh token');
      }

      // Get user with permissions
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        throw new ApiError(401, 'User not found or inactive');
      }

      // Get permissions
      const permissions = user.role.rolePermissions.map(
        (rp: { permission: { key: string } }) => rp.permission.key
      );

      // Generate new token pair
      const tokens = generateTokenPair({
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        roleId: user.roleId,
        permissions,
      });

      // Revoke old refresh token
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      // Store new refresh token
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: refreshTokenExpiry,
        },
      });

      // Set new refresh token cookie
      res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      logger.info('Token refreshed', { userId: user.id });

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/auth/forgot-password - Request password reset
router.post(
  '/forgot-password',
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      // Always return success to prevent email enumeration
      if (!user) {
        return res.status(200).json({
          success: true,
          message: 'If an account exists, a password reset email has been sent',
        });
      }

      // Generate reset token
      const { token, expiresAt } = generatePasswordResetToken();

      // Store reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: token,
          passwordResetExpires: expiresAt,
        },
      });

      // TODO: Send email with reset link
      // For now, just log it
      logger.info('Password reset requested', {
        userId: user.id,
        email: user.email,
        resetToken: token,
      });

      res.status(200).json({
        success: true,
        message: 'If an account exists, a password reset email has been sent',
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/auth/reset-password - Reset password with token
router.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, password } = req.body;

      // Find user with valid reset token
      const user = await prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: {
            gt: new Date(),
          },
        },
      });

      if (!user) {
        throw new ApiError(400, 'Invalid or expired reset token');
      }

      // Hash new password
      const hashedPassword = await hashPassword(password);

      // Update password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });

      // Revoke all refresh tokens for user
      await prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      logger.info('Password reset successful', { userId: user.id });

      res.status(200).json({
        success: true,
        message: 'Password reset successful. Please log in with your new password.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/auth/me - Get current user
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      const permissions = user.role.rolePermissions.map(
        (rp: { permission: { key: string } }) => rp.permission.key
      );

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tenantId: user.tenantId,
            roleId: user.roleId,
            mfaEnabled: user.mfaEnabled,
            emailVerified: user.emailVerified,
            permissions,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export const authRouter = router;
