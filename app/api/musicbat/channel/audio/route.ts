import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../../chatgpt-auth';
import { forwardRadio } from '../../../../../lib/radio-gateway';
import { privateRadioService } from '../../../../../lib/private-radio-service';
async function handle(request: Request) {
  const user = await getChatGPTUser();
  return forwardRadio(request,env.RADIO_SERVICE ?? privateRadioService(env.RADIO_RUNTIME_ORIGIN,env.RADIO_RUNTIME_TOKEN),user?.userId ?? null);
}
export const GET = handle;
export const HEAD = handle;
