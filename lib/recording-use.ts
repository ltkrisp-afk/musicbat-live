export const recordingUses = ['discovery-preview','noninteractive-radio','free-stream','member-stream','download-sale','other'] as const;
export type RecordingUse = typeof recordingUses[number];
export type UseDecision = {
  decision:string; master_verified:number; composition_verified:number; authority_reference:string;
  compensation_reference:string; recipient_reference:string; territory:string; starts_at:number; expires_at:number;
  license_required:number; platform_cost_cents:number|null; payer:string|null; funding_source:string|null;
  ceiling_bps:number|null; ceiling_reference:string|null; counsel_required:number; counsel_reference:string|null;
};
export function evaluateUse(row: UseDecision | null, context:{now:number;territory:string;basePriceCents?:number}) {
  if (!row || row.decision !== 'cleared') return {allowed:false,reason:'use-not-cleared'};
  if (row.master_verified!==1 || row.composition_verified!==1 || !row.authority_reference?.trim() || !row.compensation_reference?.trim() || !row.recipient_reference?.trim()) return {allowed:false,reason:'rights-or-payment-incomplete'};
  if (!Number.isSafeInteger(context.now) || row.starts_at>context.now || row.expires_at<=context.now || !Number.isSafeInteger(row.starts_at) || !Number.isSafeInteger(row.expires_at)) return {allowed:false,reason:'use-expired-or-not-started'};
  if (!row.territory || (row.territory!=='worldwide' && row.territory!==context.territory)) return {allowed:false,reason:'territory-not-covered'};
  if (row.counsel_required===1 && !row.counsel_reference?.trim()) return {allowed:false,reason:'required-counsel-evidence-missing'};
  if (row.license_required!==0 && row.license_required!==1) return {allowed:false,reason:'license-requirement-unknown'};
  if (row.license_required===1) {
    if (!row.payer?.trim() || !row.funding_source?.trim()) return {allowed:false,reason:'license-funding-undecided'};
    if (row.payer==='MusicBat') {
      if (row.ceiling_bps===null || !Number.isSafeInteger(row.ceiling_bps) || row.ceiling_bps<0 || row.ceiling_bps>10000 || !row.ceiling_reference?.trim()) return {allowed:false,reason:'owner-license-ceiling-undecided'};
      if (!Number.isSafeInteger(row.platform_cost_cents) || row.platform_cost_cents!<0 || !Number.isSafeInteger(context.basePriceCents) || context.basePriceCents!<1) return {allowed:false,reason:'license-cost-estimate-missing'};
      const base=BigInt(context.basePriceCents!),platform=base-(base*BigInt(85)+BigInt(50))/BigInt(100);
      if (BigInt(row.platform_cost_cents!)*BigInt(10000)>platform*BigInt(row.ceiling_bps)) return {allowed:false,reason:'license-cost-exceeds-ceiling'};
    }
    // Artist's allocation is never used as a platform funding source.
    if (row.payer!=='MusicBat' && row.payer!=='external') return {allowed:false,reason:'unsupported-license-payer'};
  }
  return {allowed:true,reason:'independently-cleared-use'};
}
export async function authorizeRecordingUse(db:Pick<D1Database,'prepare'>,trackId:number,use:RecordingUse,territory:string,now=Date.now()) {
  const acceptance=await db.prepare('SELECT agreement_version FROM artist_license_acceptances WHERE track_id=? ORDER BY accepted_at DESC LIMIT 1').bind(trackId).first<{agreement_version:string}>();
  // Historical permissions are preserved under their own checks. Never backfill
  // a license or change a completed purchase merely by applying this migration.
  if (acceptance?.agreement_version!=='2026-10-29.3') return {allowed:true,reason:'legacy-authorization-boundary'};
  const track=await db.prepare('SELECT status,sale_price_cents FROM tracks WHERE id=?').bind(trackId).first<{status:string;sale_price_cents:number}>();
  if (track?.status!=='active') return {allowed:false,reason:'recording-withdrawn'};
  const ingestion=await db.prepare('SELECT state FROM recording_ingestion_current WHERE track_id=?').bind(trackId).first<{state:string}>();
  if (ingestion?.state!=='VERIFIED') return {allowed:false,reason:'ingestion-not-verified'};
  const row=await db.prepare('SELECT * FROM recording_use_current WHERE track_id=? AND use=?').bind(trackId,use).first<UseDecision>();
  return evaluateUse(row,{now,territory,basePriceCents:track.sale_price_cents});
}

/** The current shared scheduler is noninteractive. A tier permission alone
 * cannot establish the transmission right, and a radio label proves nothing. */
export async function authorizeChannelUse(db:Pick<D1Database,'prepare'>,trackId:number,member:boolean,territory:string,now=Date.now()) {
  const transmission=await authorizeRecordingUse(db,trackId,'noninteractive-radio',territory,now);
  if(!transmission.allowed)return transmission;
  return authorizeRecordingUse(db,trackId,member?'member-stream':'free-stream',territory,now);
}
