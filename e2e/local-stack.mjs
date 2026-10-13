import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { RadioRuntime } from '../radio/runtime.ts';
import { createRadioServer, readHttpRequest, writeHttpResponse } from '../radio/server.ts';
import { forwardRadio } from '../lib/radio-gateway.ts';
import { privateRadioService } from '../lib/private-radio-service.ts';
export async function localStack({databasePath, assetRoot, clock, port=0, host="127.0.0.1", browserFixtureListener=null}) {
  const token=randomBytes(32).toString('hex');
  const runtime=new RadioRuntime({databasePath,assetRoot,gatewayToken:token,clock});
  const privateServer=createRadioServer(runtime);
  privateServer.listen(0,'127.0.0.1'); await once(privateServer,'listening');
  const internalOrigin=`http://127.0.0.1:${privateServer.address().port}`;
  // Isolated authenticated test gateway. Cookie identities are random server-owned
  // opaque sessions, not oai headers supplied by a browser. No login/admin API exists.
  const sessions=new Map();
  const controls={offline:false};
  function session(id,territory='US') {const value=randomBytes(24).toString('hex');sessions.set(value,{id,territory});return value}
  const service=privateRadioService(internalOrigin,token,true);
  const vite=await createViteServer({configFile:false,root:fileURLToPath(new URL('.',import.meta.url)),
    plugins:[react(),{name:'isolated-radio-gateway',configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.url?.startsWith('/api/musicbat/'))return next();
      try {
        const origin=`http://${req.headers.host}`;
        const request=await readHttpRequest(req,origin);
        const cookie=/\bbat_test_session=([a-f0-9]+)/.exec(req.headers.cookie??'')?.[1];
        const authority=browserFixtureListener ? {id:browserFixtureListener,territory:"US"} : sessions.get(cookie);
        if(controls.offline) return await writeHttpResponse(new Response(null,{status:503}),res);
        // Any legacy track-request media route is deliberately closed in this stack.
        if(!['/api/musicbat/channel','/api/musicbat/channel/audio'].includes(new URL(request.url).pathname)) {
          return await writeHttpResponse(new Response(null,{status:410}),res);
        }
        Object.defineProperty(request,'cf',{value:{country:authority?.territory??'unknown'}});
        const response=await forwardRadio(request,service,authority?.id??null);
        await writeHttpResponse(response,res);
      }catch{res.writeHead(503);res.end()}
    })}}],server:{middlewareMode:true,hmr:false,ws:false,host,port,strictPort:true,allowedHosts:['terminal.local'],fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]}}});
  const httpServer=createServer(vite.middlewares);
  httpServer.listen(port,host);await once(httpServer,'listening');
  const origin=`http://127.0.0.1:${httpServer.address().port}`;
  return {runtime,origin,session,controls,async close(){await vite.close();httpServer.closeAllConnections();await new Promise(r=>httpServer.close(r));privateServer.closeAllConnections();await new Promise(r=>privateServer.close(r));runtime.close()}};
}
