// Local development operator. No implicit database creation, migration or Stripe calls.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,writeFile,rm,realpath,stat} from 'node:fs/promises';
import {isAbsolute,resolve,relative,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runIngestionSweep} from '../lib/ingestion-verification.ts';
const execute=promisify(execFile);

export function localD1(db) {
 return {
  prepare(sql) {
   const statement=db.prepare(sql);
   function bind(...args) {
    const execute=()=>statement.columns().length ? {results:statement.all(...args),meta:{changes:0}} : {results:[],meta:{changes:Number(statement.run(...args).changes)}};
    return {bind,execute,async first(){return statement.get(...args)??null},async all(){return execute()},async run(){return execute()}};
   }
   return bind();
  },
  async batch(statements) {
   db.exec('BEGIN IMMEDIATE');
   try {const results=statements.map(s=>s.execute());db.exec('COMMIT');return results}
   catch(error){db.exec('ROLLBACK');throw error}
  },
 };
}

export async function inspectAudio(bytes) {
 const directory=await mkdtemp(join(tmpdir(),'musicbat-inspect-'));
 try {
  const path=join(directory,'input.audio');await writeFile(path,bytes,{mode:0o600});
  let probe;
  try {
   const result=await execute('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-count_frames','-show_entries','format=format_name,duration:stream=codec_type,codec_name,nb_read_frames','-of','json',path],{timeout:20000,maxBuffer:65536});
   probe=JSON.parse(result.stdout);
  }catch(error){if(error.code==='ENOENT'||error.killed)throw new Error('Decoder unavailable');return {valid:false,reason:'invalid_container'}}
  const format=probe.format?.format_name;
  if(!['mp3','flac','wav'].includes(format)||!probe.streams?.some(s=>s.codec_type==='audio'&&Number(s.nb_read_frames)>0))
   return {valid:false,reason:'unsupported_or_empty_audio'};
  try {
   await execute('ffmpeg',['-v','error','-nostdin','-threads','1','-protocol_whitelist','file,pipe','-xerror','-err_detect','explode','-i',path,'-map','0:a:0','-vn','-threads','1','-f','null','-'],{timeout:120000,maxBuffer:65536});
  }catch(error){if(error.code==='ENOENT'||error.killed)throw new Error('Decoder unavailable');return {valid:false,reason:'audio_decode_failed'}}
  return {valid:true,reason:'full_audio_decode_passed'};
 }finally{await rm(directory,{recursive:true,force:true})}
}

export async function readLocalObject(root,key) {
 if(!/^tracks\/[0-9a-f-]{36}\.(mp3|wav|flac)$/i.test(key))throw new Error('Invalid object key');
 const base=await realpath(root),path=await realpath(resolve(base,key)),rel=relative(base,path);
 if(!rel||rel.startsWith('..'+sep)||isAbsolute(rel))throw new Error('Object escaped configured root');
 const info=await stat(path);if(!info.isFile()||info.size<1||info.size>26214400)throw new Error('Object size unsupported');
 return {bytes:new Uint8Array(await readFile(path))};
}

export async function ingestionWorkerMain(args=process.argv.slice(2),environment=process.env) {
 const options={};
 for(let i=0;i<args.length;i+=2){if(!['--db','--objects'].includes(args[i])||!args[i+1])throw new Error('Use --db /absolute/existing-development.sqlite --objects /absolute/materialized-r2-root');options[args[i]]=args[i+1]}
 if(Object.keys(options).length!==2||!Object.values(options).every(p=>isAbsolute(p)&&existsSync(p))||environment.MUSICBAT_STRIPE_MODE!=='test')
  throw new Error('Explicit existing local paths and MUSICBAT_STRIPE_MODE=test are required.');
 const db=new DatabaseSync(options['--db']);db.exec('PRAGMA busy_timeout=5000');db.exec('PRAGMA foreign_keys=ON');
 try {
  db.prepare('SELECT claim_token FROM track_ingestion LIMIT 0').all();
  const result=await runIngestionSweep({db:localD1(db),readObject:key=>readLocalObject(options['--objects'],key),inspect:inspectAudio});
  console.log(JSON.stringify({at:new Date().toISOString(),localOnly:true,...result}));return result;
 }finally{db.close()}
}
if(import.meta.url===new URL(process.argv[1]??'','file:').href)ingestionWorkerMain().catch(()=>{console.error('Ingestion stopped. Check local paths, migration 0016, ffmpeg/ffprobe and explicit test mode.');process.exitCode=1});
