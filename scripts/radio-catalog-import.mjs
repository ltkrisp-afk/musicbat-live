import { readFile } from 'node:fs/promises';
import { RadioRuntime } from '../radio/runtime.ts';
import { publishCatalogRecording } from '../radio/catalog-import.ts';
// Explicit isolated export only. No credentials, production reads or migration.
const path=process.argv[2];if(!path)throw new Error('Supply a reviewed catalog export manifest.');
const manifest=JSON.parse(await readFile(path,'utf8'));
if(manifest.version!==1 || !Array.isArray(manifest.recordings))throw new Error('Expected version 1 recordings manifest.');
const options={databasePath:process.env.MUSICBAT_RADIO_DATABASE,assetRoot:process.env.MUSICBAT_RADIO_ASSETS,gatewayToken:process.env.MUSICBAT_RADIO_GATEWAY_TOKEN};
if(!options.databasePath || !options.assetRoot || !options.gatewayToken)throw new Error('Explicit private runtime configuration is required.');
const runtime=new RadioRuntime(options);
try{for(const r of manifest.recordings)publishCatalogRecording(runtime,r.catalog,r.permission,r.review,r.asset);console.log(JSON.stringify({imported:manifest.recordings.length}));}finally{runtime.close()}
