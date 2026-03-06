import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_key_replace_me', {
    apiVersion: '2026-02-25.clover',
    appInfo: {
        name: 'HRForge',
        version: '1.0.0',
    },
});
