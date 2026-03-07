import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from './errorHandler';

export const planGate = (featureKey: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new ApiError(401, 'Unauthorized');
            }

            const tenantId = req.user.tenantId;

            // Find tenant's subscription and plan
            const subscription = await prisma.subscription.findUnique({
                where: { tenantId },
                include: {
                    plan: {
                        include: {
                            planFeatures: true,
                        },
                    },
                },
            });

            if (!subscription) {
                throw new ApiError(403, 'Upgrade required: No active subscription found. Please subscribe to a plan.');
            }

            if (subscription.status !== 'active' && subscription.status !== 'trialing') {
                throw new ApiError(403, `Upgrade required: Subscription is ${subscription.status}`);
            }

            // Check if feature is enabled in their plan features
            const feature = subscription.plan.planFeatures.find(f => f.featureKey === featureKey);

            if (!feature || !feature.isEnabled) {
                throw new ApiError(403, `Upgrade required: '${featureKey}' not included in your current plan.`);
            }

            // Store the limit in the request object for downstream use
            req.planLimit = feature.limit;

            next();
        } catch (error) {
            next(error);
        }
    };
};

// Types augmentation
declare global {
    namespace Express {
        interface Request {
            planLimit?: number | null;
        }
    }
}
