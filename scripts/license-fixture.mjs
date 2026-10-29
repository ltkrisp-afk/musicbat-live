export const testAgreement = { version: 'test-only-v1', body: 'SYNTHETIC TEST FIXTURE. Not an operative license.', acceptanceText: 'I own or control the necessary rights to this recording and composition, and I agree to MusicBat’s Direct Licensing Agreement.' };
export function seedTestAgreement(sqlite) {
 sqlite.prepare('INSERT OR IGNORE INTO direct_license_versions VALUES (?,?,?,?,?)').run(testAgreement.version,testAgreement.body,testAgreement.acceptanceText,'test-only-reviewer',1);
 sqlite.prepare('INSERT OR IGNORE INTO direct_license_current VALUES (1,?)').run(testAgreement.version);
}
