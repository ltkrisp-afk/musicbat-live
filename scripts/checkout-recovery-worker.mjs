// Local-only operator: never deploys, migrates, creates Checkout or loads live keys.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {runCheckoutRecovery,checkoutRecoveryStatus,checkoutRecoveryOperations,isStripeSandboxKey} from '../app/api/musicbat/stripe/stripe.ts';

export function recoveryWorkerOptions(args) {
  let databasePath;let once=false;let status=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--db')databasePath=args[++i];
    else if(args[i]==='--once')once=true;
    else if(args[i]==='--status')status=true;
    else throw new Error('Use --db /absolute/existing-development.sqlite [--once | --status].');
  }
  if(!databasePath||!isAbsolute(databasePath)||!existsSync(databasePath)||once&&status)
    throw new Error('An existing absolute development SQLite path and one mode are required.');
  return {databasePath,once,status};
}

export function recoveryD1(db) {
  return {
    prepare(sql) {
      const stmt=db.prepare(sql);
      const bind=(...values)=>({
        async first(){return stmt.get(...values)??null},
        async all(){return {results:stmt.all(...values)}},
        async run(){return {meta:{changes:stmt.run(...values).changes}}},
      });return {...bind(),bind};
    },
  };
}

export async function recoveryWorkerMain(args=process.argv.slice(2),environment=process.env) {
  const {databasePath,once,status}=recoveryWorkerOptions(args);
  if(!status&&((environment.MUSICBAT_STRIPE_MODE??'test')!=='test'||!isStripeSandboxKey(environment.STRIPE_SECRET_KEY?.trim())))
    throw new Error('Sandbox credentials required; worker did not open or mutate the database.');
  const db=new DatabaseSync(databasePath,{readOnly:status});
  // D1's SQLite binding file may be shared with the local development server.
  db.exec('PRAGMA busy_timeout=5000');
  const runtime={DB:recoveryD1(db),MUSICBAT_STRIPE_MODE:'test',STRIPE_SECRET_KEY:environment.STRIPE_SECRET_KEY};
  const shutdown=new AbortController();
  const stop=()=>shutdown.abort();
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try {
    // Fail before network/mutations on a missing migration; never apply schema implicitly.
    db.prepare('SELECT lease_token,next_attempt_at FROM checkout_recovery_jobs LIMIT 0').all();
    db.prepare('SELECT stripe_created FROM checkout_payment_evidence LIMIT 0').all();
    if(status){console.log(JSON.stringify({sandboxOnly:true,states:await checkoutRecoveryStatus(runtime),operations:await checkoutRecoveryOperations(runtime)}));return}
    do {
      const pass=await runCheckoutRecovery(runtime,{limit:10,signal:shutdown.signal});
      console.log(JSON.stringify({at:new Date().toISOString(),...pass,states:await checkoutRecoveryStatus(runtime)}));
      if(once||shutdown.signal.aborted)break;
      try{await delay(5000,undefined,{signal:shutdown.signal})}catch{break}
    }while(!shutdown.signal.aborted);
  } finally {process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);db.close()}
}

if(import.meta.url===new URL(process.argv[1]??'', 'file:').href){
  recoveryWorkerMain().catch(()=>{console.error('Checkout recovery stopped; check sandbox credentials, database path and migration 0014. No production fallback attempted.');process.exitCode=1});
}
