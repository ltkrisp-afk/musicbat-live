export const testAgreement = { version: 'test-only-v1', body: 'SYNTHETIC TEST FIXTURE. Not an operative license.', acceptanceText: 'I own or control the necessary rights to this recording and composition, and I agree to MusicBat’s Direct Licensing Agreement.' };
export function seedTestAgreement(sqlite) {
 if(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='agreement_clearance_policy'").get())sqlite.prepare("INSERT OR IGNORE INTO agreement_clearance_policy VALUES(?,'legacy')").run(testAgreement.version);
 sqlite.prepare('INSERT OR IGNORE INTO direct_license_versions VALUES (?,?,?,?,?)').run(testAgreement.version,testAgreement.body,testAgreement.acceptanceText,'test-only-reviewer',1);
 sqlite.prepare('INSERT OR IGNORE INTO direct_license_current VALUES (1,?)').run(testAgreement.version);
}
export const testRightsDeclaration = { creationClassification:'Human', version:'rights-2026-10-29.1', legalName:'Synthetic test artist', capacity:'Individual owner', rightsBasis:'sole', masterOwners:'Synthetic test artist 100%', compositionOwners:'Synthetic test work: Synthetic test artist 100%', proStatus:'none', proDetails:'', ipiCae:'', restrictions:'none', evidenceReference:'', paymentAuthority:'Synthetic test artist receives 100% of the artist pool' };
