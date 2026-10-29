import {sandboxD1Radio} from './d1-radio-service';
import {privateRadioService} from './private-radio-service';
import {catalogBoundRadio} from './catalog-radio-boundary';
import {membershipBoundRadio} from './membership-radio-boundary';

type RadioEnvironment={
 MUSICBAT_STREAMING_EVIDENCE_ENABLED?:string;MUSICBAT_CLOUDFLARE_RADIO?:string;MUSICBAT_STRIPE_MODE?:string;MUSICBAT_RADIO_PLUS_ENABLED?:string;
 DB?:D1Database;BUCKET?:R2Bucket;RADIO_SERVICE?:Pick<Fetcher,'fetch'>;
 RADIO_RUNTIME_ORIGIN?:string;RADIO_RUNTIME_TOKEN?:string;
};
/** Explicit test mode is an isolation boundary, never a fallback preference. */
export function selectRadioService(env:RadioEnvironment):Pick<Fetcher,'fetch'>|undefined {
 if(env.MUSICBAT_CLOUDFLARE_RADIO==='test'&&env.MUSICBAT_STRIPE_MODE==='test'){
  const missing=['DB','BUCKET'].filter(key=>!env[key as 'DB'|'BUCKET']);
  if(missing.length)return {fetch:async()=>Response.json({error:'Sandbox Radio is missing required bindings.',missing_bindings:missing},{status:503})};
  return sandboxD1Radio(env);
 }
 return env.RADIO_SERVICE??privateRadioService(env.RADIO_RUNTIME_ORIGIN,env.RADIO_RUNTIME_TOKEN);
}
/** Channel and media routes share exactly the same selection and boundaries. */
export function configuredRadioService(env:RadioEnvironment):Pick<Fetcher,'fetch'>|undefined {
 const sandbox=env.MUSICBAT_CLOUDFLARE_RADIO==='test'&&env.MUSICBAT_STRIPE_MODE==='test';
 const service=selectRadioService(env);
 if(sandbox&&(!env.DB||!env.BUCKET))return service;
 return env.DB?catalogBoundRadio(membershipBoundRadio(service,env.DB,env.MUSICBAT_RADIO_PLUS_ENABLED==='live'&&env.MUSICBAT_STRIPE_MODE==='live'?'live':env.MUSICBAT_RADIO_PLUS_ENABLED==='test'&&env.MUSICBAT_STRIPE_MODE!=='live'),env.DB,env.BUCKET,env.MUSICBAT_STREAMING_EVIDENCE_ENABLED===env.MUSICBAT_STRIPE_MODE&&(env.MUSICBAT_STRIPE_MODE==='test'||env.MUSICBAT_STRIPE_MODE==='live')?env.MUSICBAT_STRIPE_MODE:null):undefined;
}
