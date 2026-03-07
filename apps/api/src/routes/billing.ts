import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { authenticate } from '../middleware/authenticate';
import { ApiError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger();
const router = Router();

// GET /v1/billing/plans - Get all available plans
router.get('/plans', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const plans = await prisma.plan.findMany({
            where: { isActive: true },
            include: {
                planFeatures: true,
            },
            orderBy: {
                displayOrder: 'asc',
            },
        });

        res.status(200).json({
            success: true,
            data: { plans },
        });
    } catch (error) {
        next(error);
    }
});

// GET /v1/billing/subscription - Get current tenant subscription
router.get('/subscription', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.user!.tenantId;

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

        res.status(200).json({
            success: true,
            data: { subscription },
        });
    } catch (error) {
        next(error);
    }
});

// POST /v1/billing/create-checkout-session
router.post('/create-checkout-session', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { planId } = req.body;
        const tenantId = req.user!.tenantId;

        const plan = await prisma.plan.findUnique({ where: { id: planId } });
        if (!plan || !plan.stripePriceId) {
            throw new ApiError(400, 'Invalid plan or missing Stripe Price ID');
        }

        // Get tenant
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) throw new ApiError(404, 'Tenant not found');

        // See if they already have a stripe customer id
        let customerId;
        const existingSubscription = await prisma.subscription.findUnique({ where: { tenantId } });
        if (existingSubscription?.stripeCustomerId) {
            customerId = existingSubscription.stripeCustomerId;
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: plan.stripePriceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.FRONTEND_URL}/dashboard/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
            customer: customerId,
            customer_email: customerId ? undefined : req.user!.email,
            client_reference_id: tenantId,
            subscription_data: {
                metadata: {
                    tenantId: tenantId,
                    planId: plan.id,
                },
            },
        });

        // We can pre-create the subscription table entry here in "incomplete" mode if we want,
        // or just rely completely on the webhook. We'll rely on the webhook.
        res.status(200).json({
            success: true,
            data: {
                url: session.url,
            },
        });
    } catch (error) {
        next(error);
    }
});

// POST /v1/billing/customer-portal
router.post('/customer-portal', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.user!.tenantId;

        const subscription = await prisma.subscription.findUnique({ where: { tenantId } });

        if (!subscription || !subscription.stripeCustomerId) {
            throw new ApiError(400, 'No active billing relationship found');
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: subscription.stripeCustomerId,
            return_url: `${process.env.FRONTEND_URL}/dashboard/settings/billing`,
        });

        res.status(200).json({
            success: true,
            data: {
                url: portalSession.url,
            },
        });
    } catch (error: any) {
        if (error.type === 'StripeInvalidRequestError') {
            throw new ApiError(400, 'Stripe Error: ' + error.message);
        }
        next(error);
    }
});

export const billingRouter = router;
