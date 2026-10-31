"use client";
import { useState } from 'react';
import { declarationVersion } from '../lib/artist-rights-declaration';
export function ArtistRightsDeclarations() {
  const [basis,setBasis]=useState('');
  const [pro,setPro]=useState('');
  const fields = [
    ['legalName','Your legal name or contracting entity',''],
    ['capacity','Signer name and capacity','For an entity, identify the individual signer and authority.'],
    ['masterOwners','Recording owners and controlled shares','List legal names, ownership percentages, controllers and who authorized you. Mark unknown shares as unknown.'],
    ['compositionOwners','Underlying compositions, writers and publishers','For each composition separately, list title, writers, publishers, administrators, ownership and controlled shares.'],
    ['restrictions','Existing contracts and third-party material','Identify labels, collaborators, covers, samples, artwork and restrictions. Enter none only if none apply.'],
    ['paymentAuthority','Artist payment recipient and allocation','Identify the intended verified recipient, collection authority and beneficiaries’ shares of the artist pool. This does not establish copyright ownership or automatic split payouts.'],
  ];
  return <fieldset className="space-y-3 rounded-xl border border-white/15 p-4 text-sm">
    <legend className="px-2 font-semibold">Recording and composition rights declarations</legend>
    <input type="hidden" name="rights_version" value={declarationVersion} />
    <p>Provide accurate declarations for this recording. Acceptance is not proof of third-party clearance. Shared, external, uncertain or restricted rights remain on review hold.</p>
    <label className="block">Recording creation<select name="rights_creationClassification" required defaultValue="" className="mt-1 block w-full rounded bg-[#17141d] p-2"><option value="" disabled>Choose a classification</option>{['Human','Human + AI','AI'].map(value=><option key={value}>{value}</option>)}</select></label>
    <p className="text-xs text-white/60">All three classifications may enter free discovery after existing rights and eligibility checks. Creation classification is a declaration, not copyright ownership or rights clearance.</p>
    <p>Previously released music is welcome. Prior distribution, historical earnings and popularity do not establish or defeat present licensing authority. Disclose any surviving exclusivity, publisher, collection or territorial restrictions.</p>
    <label className="block">Current distribution authority<select name="rights_distributionStatus" defaultValue="unknown" className="mt-1 block w-full rounded bg-[#17141d] p-2"><option value="never">Not previously distributed</option><option value="nonexclusive">Prior or current nonexclusive distribution</option><option value="terminated">Prior distributor relationship ended</option><option value="restricted">Continuing restrictions require review</option><option value="unknown">Not yet established — review required</option></select></label>
    <label className="block">Distribution authority details<textarea name="rights_distributionDetails" maxLength={4000} className="mt-1 block w-full rounded border border-white/20 bg-black/30 p-2"/><span className="text-xs text-white/60">For an ended or nonexclusive relationship, identify present licensing authority and any surviving restrictions. Do not assume termination clears every right. No historical earnings evidence is required.</span></label>
    {fields.map(([key,label,help])=><label key={key} className="block">{label}<textarea name={'rights_'+key} required maxLength={4000} rows={2} className="mt-1 block w-full rounded border border-white/20 bg-black/30 p-2" />{help && <span className="text-xs text-white/60">{help}</span>}</label>)}
    <label className="block">Rights control<select name="rights_rightsBasis" required value={basis} onChange={e=>setBasis(e.target.value)} className="mt-1 block w-full rounded bg-[#17141d] p-2"><option value="">Choose</option><option value="sole">I solely own and directly control all required rights</option><option value="shared">Shared ownership or collaborators</option><option value="external">Publisher, label or other external control</option><option value="uncertain">Authority or shares are uncertain</option></select></label>
    <label className="block">PRO or collecting-society affiliation<select name="rights_proStatus" required value={pro} onChange={e=>setPro(e.target.value)} className="mt-1 block w-full rounded bg-[#17141d] p-2"><option value="">Choose</option><option value="none">No applicable affiliation</option><option value="affiliated">One or more affiliated parties</option><option value="unknown">Unknown — requires review</option></select></label>
    <label className="block">PRO organizations and affiliated parties<textarea name="rights_proDetails" required={pro==='affiliated'} maxLength={4000} className="mt-1 block w-full rounded border border-white/20 bg-black/30 p-2" /></label>
    <label className="block">IPI/CAE identifiers, if assigned<input name="rights_ipiCae" required={pro==='affiliated'} maxLength={4000} className="mt-1 block w-full rounded border border-white/20 bg-black/30 p-2" /><span className="text-xs text-white/60">Match each identifier to its party. Enter unknown or not assigned when accurate; never invent one.</span></label>
    <label className="block">Supporting authorization reference<textarea name="rights_evidenceReference" maxLength={4000} required={Boolean(basis && basis!=='sole' || pro && pro!=='none')} className="mt-1 block w-full rounded border border-white/20 bg-black/30 p-2" /><span className="text-xs text-white/60">Reference privately supplied signed permissions, including use, territory, term and prior-purchase delivery rights, or describe what is missing. Do not paste credentials or private contracts here. A reference alone never grants clearance.</span></label>
  </fieldset>;
}
