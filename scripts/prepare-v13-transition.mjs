// LOCAL PREPARATION ONLY. Does not push, configure, migrate or deploy anything.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
const [mode,destination]=process.argv.slice(2);
if(!['maintenance','rollback'].includes(mode)||!destination||!isAbsolute(destination))throw Error('Usage: node scripts/prepare-v13-transition.mjs maintenance|rollback /absolute/empty-worktree');
const root=process.cwd(),out=resolve(destination),baseline='706082ad960574dd1f67f84bab61667dabfb0897';
if(existsSync(out))throw Error('Destination must not exist.');
execFileSync('git',['cat-file','-e',baseline+'^{commit}']);
execFileSync('git',['worktree','add','--detach',out,baseline],{stdio:'inherit'});
const paths=['app/api/musicbat/route.ts','app/api/musicbat/purchase/route.ts','app/api/musicbat/stripe/connect/route.ts','app/api/musicbat/stripe/webhook/route.ts'];
for(const name of paths){const p=join(out,name);let s=readFileSync(p,'utf8');const patterns=['export async function POST(request: Request) {'];if(name.includes('/connect/'))patterns.push('export async function GET() {');for(const pattern of patterns){if(!s.includes(pattern))throw Error('Unexpected baseline handler '+name);s=s.replace(pattern,pattern+'\n  if (env.MUSICBAT_RELEASE_PAUSED === "1") return Response.json({ error: "MusicBat is briefly paused for an update." }, { status: 503, headers: { "retry-after": "60", "cache-control": "no-store" } });')}writeFileSync(p,s)}
const types=join(out,'cloudflare-env.d.ts');writeFileSync(types,readFileSync(types,'utf8').replace('interface Env {','interface Env {\n    MUSICBAT_RELEASE_PAUSED?: string;'));
if(mode==='rollback'){
 // Carry the release migration history forward, never restore its old ledger.
 rmSync(join(out,'drizzle'),{recursive:true,force:true});
 cpSync(join(root,'drizzle'),join(out,'drizzle'),{recursive:true});
 const j=JSON.parse(readFileSync(join(out,'drizzle/meta/_journal.json'),'utf8'));
 j.entries.push({idx:10,version:'6',when:j.entries[9].when+1000,tag:'0010_v13_preserving_rollback',breakpoints:true});
 writeFileSync(join(out,'drizzle/meta/_journal.json'),JSON.stringify(j,null,2)+'\n');
 writeFileSync(join(out,'drizzle/0010_v13_preserving_rollback.sql'),readFileSync(join(root,'release/v13/rollback-signals.sql'),'utf8').replaceAll(';\n',';\n--> statement-breakpoint\n'));
}
execFileSync('git',['add','app','cloudflare-env.d.ts','drizzle'],{cwd:out});
execFileSync('git',['commit','-m',mode==='maintenance'?'Prepare version 13 release write pause':'Prepare preserving version 13 rollback'],{cwd:out,stdio:'inherit'});
console.log(JSON.stringify({mode,checkout_path:out,commit_sha:execFileSync('git',['rev-parse','HEAD'],{cwd:out,encoding:'utf8'}).trim(),productionChanged:false}));
