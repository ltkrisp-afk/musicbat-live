import { readFile } from 'node:fs/promises';
import { RadioRuntime } from '../radio/runtime.ts';
const manifestPath=process.argv[2];
if(!manifestPath)throw new Error('Pass one reviewed-source manifest JSON file. Upload attestations are not a manifest.');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(manifest.version!==1 || !Array.isArray(manifest.channels) || !Array.isArray(manifest.sources) || !Array.isArray(manifest.memberships))throw new Error('Invalid version 1 reviewed manifest.');
const options={databasePath:process.env.MUSICBAT_RADIO_DATABASE,assetRoot:process.env.MUSICBAT_RADIO_ASSETS,gatewayToken:process.env.MUSICBAT_RADIO_GATEWAY_TOKEN};
if(!options.databasePath || !options.assetRoot || !options.gatewayToken)throw new Error('Private runtime database, asset root and gateway token are required.');
const runtime=new RadioRuntime(options);
try {
 for(const {track,asset} of manifest.sources)runtime.publishSource(track,asset);
 for(const {id,config} of manifest.channels)runtime.establishChannel(id,config);
 for(const {id,plusUntil,evidence} of manifest.memberships)runtime.setMembership(id,plusUntil,evidence);
 console.log(JSON.stringify({sources:manifest.sources.length,channels:manifest.channels.length,memberships:manifest.memberships.length}));
}finally{runtime.close()}
