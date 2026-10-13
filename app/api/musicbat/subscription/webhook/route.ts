import { env } from 'cloudflare:workers';
import { plusWebhook } from '../../../../../lib/radio-plus';
import { StripeConfigurationError } from '../../stripe/stripe';
export async function POST(request:Request) {
  try{return Response.json(await plusWebhook(env,request),{headers:{'cache-control':'no-store'}});}
  catch(error){return Response.json({error:error instanceof StripeConfigurationError?error.message:'Subscription webhook rejected.'},{status:error instanceof StripeConfigurationError?503:400,headers:{'cache-control':'no-store'}});}
}
