import { Router, Request, Response } from 'express';
import express from 'express';
import { stripe } from '../lib/stripe';
import { prisma } from '../lib/prisma';
import { createLogger } from '../utils/logger';

const logger = createLogger();
const router = Router();

// In production, this must match the webhook dashboard secret
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// We need the raw body to verify the webhook signature
router.post(
    '/stripe',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
        const sig = req.headers['stripe-signature'];

        let event;

        try {
            if (!sig) throw new Error('No signature provided');
            // Verify webhook signature and extract event
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        } catch (err: any) {
            logger.error('Webhook signature verification failed.', err);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        try {
            // Handle the event
            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated': {
                    const subscription = event.data.object as any;

                    await prisma.subscription.upsert({
                        where: {
                            stripeSubscriptionId: subscription.id,
                        },
                        update: {
                            status: subscription.status,
                            currentPeriodStart: new Date(subscription.current_period_start * 1000),
                            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                            cancelAtPeriodEnd: subscription.cancel_at_period_end,
                            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
                        },
                        create: {
                            stripeSubscriptionId: subscription.id,
                            status: subscription.status,
                            stripeCustomerId: subscription.customer,
                            currentPeriodStart: new Date(subscription.current_period_start * 1000),
                            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                            cancelAtPeriodEnd: subscription.cancel_at_period_end,
                            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
                            // Metadata injected during Checkout Session creation
                            tenantId: subscription.metadata.tenantId,
                            planId: subscription.metadata.planId,
                        }
                    });
                    break;
                }
                case 'customer.subscription.deleted': {
                    const subscription = event.data.object as any;
                    await prisma.subscription.updateMany({
                        where: { stripeSubscriptionId: subscription.id },
                        data: {
                            status: 'canceled',
                            canceledAt: new Date()
                        }
                    });
                    break;
                }
                default:
                    logger.info(`Unhandled event type ${event.type}`);
            }

            // Return a 200 response to acknowledge receipt of the event
            res.status(200).json({ received: true });
        } catch (error: any) {
            logger.error('Error processing webhook', error);
            res.status(500).send(`Webhook Handler Error: ${error.message}`);
        }
    }
);

export const webhooksRouter = router;
