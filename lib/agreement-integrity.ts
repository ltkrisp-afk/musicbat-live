import { directLicenseFinal } from './direct-license-final';

export async function sha256Text(body: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export type StoredAgreement = { version: string; body: string; acceptance_text: string };
export async function verifiedCurrentAgreement(db: D1Database): Promise<(StoredAgreement & {sha256:string}) | null> {
  const agreement = await db.prepare(`SELECT v.version,v.body,v.acceptance_text FROM direct_license_current c
    JOIN direct_license_versions v ON v.version=c.version WHERE c.id=1 AND lower(v.version) NOT LIKE 'draft-%'`).bind().first<StoredAgreement>();
  if (!agreement) return null;
  // Legacy versions retain their original evidence. New final-version acceptance
  // requires exact bytes, immutable integrity registration and release approval.
  const sha256 = await sha256Text(agreement.body);
  if (agreement.version === directLicenseFinal.version) {
    const record = await db.prepare('SELECT sha256,release_approved FROM agreement_integrity WHERE version=?').bind(agreement.version).first<{sha256:string;release_approved:number}>();
    if (agreement.body !== directLicenseFinal.body || agreement.acceptance_text !== directLicenseFinal.acceptance_text || sha256 !== directLicenseFinal.sha256 || record?.sha256 !== sha256 || record.release_approved !== 1)
      throw new Error('Agreement integrity or release approval is incomplete.');
  }
  return {...agreement,sha256};
}
