export const declarationVersion = 'rights-2026-10-29.1';
export type ArtistRightsDeclaration = {
  version: string; creationClassification?: 'Human'|'Human + AI'|'AI'; legalName: string; capacity: string; rightsBasis: string;
  masterOwners: string; compositionOwners: string; proStatus: string;
  proDetails: string; ipiCae: string; restrictions: string;
  evidenceReference: string; paymentAuthority: string;
};
export function parseRightsDeclaration(value: unknown): { declaration: ArtistRightsDeclaration; reviewRequired: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Complete the artist rights declarations.');
  const input = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['version','legalName','capacity','rightsBasis','masterOwners','compositionOwners','proStatus','proDetails','ipiCae','restrictions','evidenceReference','paymentAuthority']) {
    if (typeof input[key] !== 'string' || input[key].length > 4000) throw new Error('Check the artist rights declarations.');
    result[key] = input[key].trim();
  }
  if (result.version !== declarationVersion || !['sole','shared','external','uncertain'].includes(result.rightsBasis) || !['none','affiliated','unknown'].includes(result.proStatus)) throw new Error('Choose the rights-control and PRO declarations.');
  for (const key of ['legalName','capacity','masterOwners','compositionOwners','restrictions','paymentAuthority']) if (!result[key]) throw new Error('Complete the legal identity, ownership, restrictions and payment-authority declarations.');
  if (result.proStatus === 'affiliated' && (!result.proDetails || !result.ipiCae)) throw new Error('Provide the PRO organization and IPI/CAE information, or explicitly state that an identifier is unknown.');
  if (input.creationClassification !== undefined) {
    if (!['Human','Human + AI','AI'].includes(String(input.creationClassification))) throw new Error('Choose Human, Human + AI, or AI for this recording.');
    result.creationClassification = String(input.creationClassification);
  }
  const reviewRequired = result.rightsBasis !== 'sole' || result.proStatus !== 'none' || result.restrictions.toLowerCase() !== 'none';
  if (reviewRequired && !result.evidenceReference) throw new Error('Supply a private authorization document reference or describe the missing authorization. Affected uses stay on review hold.');
  return { declaration: result as ArtistRightsDeclaration, reviewRequired };
}
