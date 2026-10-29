import { plusAccess } from './radio-plus';
/** Entitlements are server-owned invoice evidence, never browser headers. */
export function membershipBoundRadio(service:Pick<Fetcher,'fetch'>|undefined,db:D1Database,testEnabled:boolean|'test'|'live'=false):Pick<Fetcher,'fetch'>|undefined {
  if(!service)return undefined;
  return {async fetch(input:RequestInfo|URL,init?:RequestInit) {
    const request=new Request(input,init),id=request.headers.get('x-musicbat-listener');
    if(!id)return new Response(null,{status:401});
    try {
      const headers=new Headers(request.headers);
      headers.set('x-musicbat-plus-until',String(testEnabled ? await plusAccess(db,id,Date.now(),testEnabled==='live'?'live':'test') : 0));
      return service.fetch(new Request(request,{headers}));
    }catch{return Response.json({error:'Radio membership could not be verified.'},{status:503});}
  }};
}
