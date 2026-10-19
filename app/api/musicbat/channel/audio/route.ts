import { configuredRadioService } from '../../../../../lib/configured-radio-service';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../../chatgpt-auth';
import { forwardRadio } from '../../../../../lib/radio-gateway';
async function handle(request: Request) {
  const user = await getChatGPTUser();
  return forwardRadio(request,configuredRadioService(env),user?.userId ?? null);
}
export const GET = handle;
export const HEAD = handle;
