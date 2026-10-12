import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../../chatgpt-auth';
import { forwardRadio } from '../../../../../lib/radio-gateway';
async function handle(request: Request) {
  const user = await getChatGPTUser();
  return forwardRadio(request,env.RADIO_SERVICE,user?.userId ?? null);
}
export const GET = handle;
export const HEAD = handle;
