// Read-only Stripe account checks. No Checkout, PaymentIntent, charge or refund calls.
import {stripeMode} from '../app/api/musicbat/stripe/stripe.ts';
const mode=stripeMode(process.env),key=process.env.STRIPE_SECRET_KEY?.trim();
if(mode!=='live'||!key?.startsWith('sk_live_')||!process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))throw Error('Live-mode server configuration is incomplete.');
for(const name of ['MUSICBAT_PROCESSING_BPS','MUSICBAT_PROCESSING_FIXED_CENTS'])if(!/^\d+$/.test(process.env[name]??''))throw Error('Verified processing rates are required.');
if(Number(process.env.MUSICBAT_PROCESSING_BPS)>=10000)throw Error('Invalid processing percentage.');
const artistId=process.argv[2];if(artistId&&!/^acct_[A-Za-z0-9]+$/.test(artistId))throw Error('Invalid connected account ID.');
async function account(path){const response=await fetch('https://api.stripe.com/v1/'+path,{headers:{authorization:'Bearer '+key},redirect:'error'});if(!response.ok)throw Error('Stripe account read failed; verify account scope and access in Dashboard.');return response.json()}
try {const platform=await account('account');const artist=artistId?await account('accounts/'+encodeURIComponent(artistId)):null;
 console.log(JSON.stringify({mode,platform:{id:platform.id,country:platform.country,default_currency:platform.default_currency,charges_enabled:platform.charges_enabled,payouts_enabled:platform.payouts_enabled},artist:artist?{id:artist.id,details_submitted:artist.details_submitted,charges_enabled:artist.charges_enabled,payouts_enabled:artist.payouts_enabled}:null,ready:Boolean(platform.charges_enabled&&platform.payouts_enabled&&artist?.details_submitted&&artist?.charges_enabled&&artist?.payouts_enabled),webhookDeliveryVerified:false,actualRateVerified:false},null,2));
}catch{console.error('Read-only Stripe readiness check failed. No payment was initiated.');process.exitCode=1}
