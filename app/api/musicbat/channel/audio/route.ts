import { catalogBoundRadio } from "../../../../../lib/catalog-radio-boundary";
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../../chatgpt-auth';
import { forwardRadio } from '../../../../../lib/radio-gateway';
import { privateRadioService } from '../../../../../lib/private-radio-service';
import { membershipBoundRadio } from '../../../../../lib/membership-radio-boundary';
async function handle(request: Request) {
  const user = await getChatGPTUser();
  return forwardRadio(request,env.DB ? catalogBoundRadio(membershipBoundRadio(env.RADIO_SERVICE ?? privateRadioService(env.RADIO_RUNTIME_ORIGIN,env.RADIO_RUNTIME_TOKEN),env.DB,env.MUSICBAT_RADIO_PLUS_ENABLED==='test' && env.MUSICBAT_STRIPE_MODE!=='live'),env.DB,env.BUCKET) : undefined,user?.userId ?? null);
}
export const GET = handle;
export const HEAD = handle;
