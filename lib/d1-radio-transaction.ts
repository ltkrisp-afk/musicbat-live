type Parameter = string | number;
type Row = Record<string, string | number | null>;

/** Request-local write set, never an authority cache. D1 persists all state.
 * D1 batch rolls back every statement if a guard or a write fails. Reads are
 * repeated as guards in that same batch, so concurrent writers cannot commit a
 * decision calculated from stale catalog, timeline, audit or listener state.
 * No BEGIN/COMMIT SQL or asynchronous callback transaction is sent to D1.
 */
export class D1RadioDatabase {
 private session:D1DatabaseSession;
 private guards:D1PreparedStatement[]=[];
 private writes:D1PreparedStatement[]=[];
 constructor(db:D1Database) { this.session=db.withSession('first-primary'); }
 prepare(sql:string,{allowChannelClockAdvance=false}={}) {
  const read=async(params:Parameter[])=>{
   const result=await this.session.prepare(sql).bind(...params).all<Row>();
   if(!result.success)throw new Error('radio-d1-read-failed');
   const rows=result.results;
   if(rows.length>10000)throw new Error('radio-d1-review-capacity-exceeded');
   let condition:string,expected:Parameter[]=[];
   if(!rows.length)condition=`NOT EXISTS (${sql})`;
   else {
    // Independent listeners refresh the same trusted clock. A forward-only
    // clock refresh does not change the reviewed config, revision or ledger.
    // Keep those exact guards and reject a clock moving backwards.
    const columns=Object.keys(rows[0]).filter(c=>!(allowChannelClockAdvance&&c==='last_clock'));
    if(allowChannelClockAdvance)for(const row of rows)this.guards.push(this.session.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM radio_engine_channels WHERE id=? AND last_clock>=?) THEN 1 ELSE json('musicbat-stale-radio-read') END AS radio_clock_guard").bind(row.id,row.last_clock));
    const names=columns.map(c=>'"'+c.replaceAll('"','""')+'"').join(',');
    condition=`(SELECT json_group_array(json_array(${names})) FROM (${sql}))=?`;
    expected=[JSON.stringify(rows.map(row=>columns.map(c=>row[c])))];
   }
   // The false branch deliberately raises SQLite's malformed-JSON error.
   // Unlike a false SELECT or a zero-row UPDATE, it aborts the entire D1 batch.
   this.guards.push(this.session.prepare(`SELECT CASE WHEN ${condition} THEN 1 ELSE json('musicbat-stale-radio-read') END AS radio_guard`).bind(...params,...expected));
   return rows;
  };
  return {
   get:async(...params:Parameter[])=>(await read(params))[0],
   all:(...params:Parameter[])=>read(params),
   run:(...params:Parameter[])=>{this.writes.push(this.session.prepare(sql).bind(...params));},
  };
 }
 async commit() {
  // Read-only navigation still verifies one coherent observed catalog/config.
  const statements=[...this.guards,...this.writes];
  if(statements.length)await this.session.batch(statements);
 }
}

export async function retryD1RadioTransaction<T>(db:D1Database,action:(unit:D1RadioDatabase)=>Promise<T>):Promise<T> {
 for(let attempt=0;attempt<4;attempt++) {
  const unit=new D1RadioDatabase(db);
  try {const result=await action(unit);await unit.commit();return result;}
  catch(error) {
   // A concurrent commit can overtake the clock sampled before an async read.
   // Recompute that snapshot too; a genuinely regressed clock still fails after
   // the same bounded retry budget. Transport/auth/storage failures fail
   // closed; a lost response never causes an unbounded blind write retry.
   const reason=error instanceof Error?error.message:String(error);
   // A boundary can also commit between the channel, history and audit reads.
   // Recompute that provisional mismatch; persistent corruption still fails
   // within this same four-attempt budget and is never rewritten or repaired.
   if(attempt===3 || !(reason==='server-clock-regressed'||reason==='channel-ledger-incomplete'||/malformed JSON/i.test(reason)))throw error;
  }
 }
 throw new Error('radio-d1-contention');
}
