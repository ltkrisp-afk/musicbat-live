if(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_WEBHOOK_SECRET)throw new Error('Remove Stripe credentials for offline acceptance');
process.env.NODE_ENV='development';
process.env.MUSICBAT_LOCAL_ACCEPTANCE='1';
process.argv=[process.execPath,new URL('./run-framework.mjs',import.meta.url).pathname,'dev','--hostname','127.0.0.1','--port','5173'];
await import('./run-framework.mjs');
