if(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET)throw new Error('Remove Stripe credentials for offline acceptance');
process.env.NODE_ENV='development';
process.env.MUSICBAT_LOCAL_ACCEPTANCE='1';
const args=process.argv.slice(2);
process.argv=[process.execPath,new URL('./run-framework.mjs',import.meta.url).pathname,'dev',...(args.length?args:['--host','127.0.0.1','--port','5173'])];
await import('./run-framework.mjs');
