import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { handlePlus } from '../../../../lib/radio-plus';
async function handle(request:Request) {const user=await getChatGPTUser();return handlePlus(env,request,user?.userId??null);}
export const GET=handle;
export const POST=handle;
