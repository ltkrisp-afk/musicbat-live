import { catalogBoundRadio } from "../../../../lib/catalog-radio-boundary";
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { forwardRadio } from '../../../../lib/radio-gateway';
import { privateRadioService } from '../../../../lib/private-radio-service';
async function handle(request: Request) {
  const user = await getChatGPTUser();
  return forwardRadio(request,env.DB ? catalogBoundRadio(env.RADIO_SERVICE ?? privateRadioService(env.RADIO_RUNTIME_ORIGIN,env.RADIO_RUNTIME_TOKEN),env.DB) : undefined,user?.userId ?? null);
}
export const GET = handle;
export const POST = handle;
