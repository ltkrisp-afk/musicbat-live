# Repository exposure audit — 2026-10-18

Audited authoritative HEAD: `9795cc30562fec2ca8ddfc09e70964c3640b1d8f`.
No deployment, payment, credential rotation, source deletion or history rewrite occurred during this assessment.

## Results

| Requirement | Result | Evidence |
| --- | --- | --- |
| Public access | PASS | Logged-out GitHub browser read and downloaded a historical archive; anonymous `git ls-remote` subsequently succeeded. Earlier connected API visibility metadata was stale. |
| Advertised Git history | PASS | All 13 advertised refs: 11 branches and 2 pull-request heads, no tags. 124 distinct reachable commits and 111 complete recursive trees; no truncated tree or failed text read. |
| Deleted historical revision | PASS | Also inspected `61fc95f7e36e4f796a41d97093bb8003b16c993c`: one additional commit/tree and one additional text blob. |
| Credential-pattern scan | PASS | 648 distinct remote text blob versions, all 125 commit messages, local working source and all 497 available local Git objects, including unreachable objects. No actual credential identified. |
| Binary and compressed evidence | PASS | Four top-level recovery bundles, the recovery ZIP, its nested ZIPs, five embedded bundles, five source tarballs, and the one repository screenshot were inspected. No credential identified. |
| Tracked environment/secrets | PASS | Current 281-file tree contains only `.env.example` in the environment/credential/database/private-key filename check. Its two historical versions contain replacement placeholders. No actual `.env`, private key, database dump or credential store was found in reachable file paths or expanded archives. |
| Source/document inventory | PASS | Current tree is application/build-support/vendor source, dependency manifests, migrations, tests, documentation, hosting declarations and one reviewed support screenshot. Recovery binaries exist on historical refs; they were inspected, not deleted. |
| Rotation required by findings | PASS | None indicated. No real Stripe secret/webhook secret, Cloudflare token, database credential, private key, GitHub/AWS/Google/Slack token, payment client secret or embedded URL credential was identified. No provider credentials were exercised to test validity. |

## Method and redacted findings

Independent pattern passes covered Stripe secret/restricted keys and webhook signing secrets,
PEM/OpenSSH/PGP private keys, GitHub tokens, AWS access keys, Google keys/OAuth secrets,
Slack tokens, JWTs, database connection URIs, quoted and unquoted secret assignments,
literal Basic/Bearer credentials, payment client secrets and credential-bearing URLs.
Only rule names, paths, line numbers, lengths and classifications were recorded in outputs.
No secret value was printed in the audit report.

Matches were explicit replacement examples and short test fixtures. Examples of reviewed
locations: `.env.example` lines 2–3; purchase, webhook, Connect, Radio HTTP and ingress test
fixtures. Short credentials embedded in negative-test URLs were test values, not provider keys.
Public Stripe object IDs and hosting project IDs in acceptance evidence are identifiers,
not authentication credentials. Test financial evidence contains no real customer payment data.

The 2,980,423-byte recovery ZIP initially exceeded the file connector's content limit.
It was downloaded through the logged-out browser and verified against Git blob
`f8aeb34c6bc02b5770590dff37d3c48eb7c6f7dc` before recursive inspection.
Recursive expansion inspected 13,246,806 bytes across nested containers with depth/size
bounds; no archive remained unread or failed. Bundles were read as bare repositories,
never checked out or executed. Screenshot OCR was reviewed with long strings, URLs and
email addresses redacted; it depicts an OpenAI support escalation, not a key-entry screen.

`.gitignore` excludes `.env*` except `.env.example`, PEM files, dependency/build caches,
Wrangler state and checkout-local execution/tool directories. `.npmrc` contains only
package-manager settings. `.openai/hosting.json` declares resource binding names and a
project identifier, with no secret values. Live environment bindings were not exported.

## Limits and corrective actions

PASS means no credential was identified in this recorded scope; pattern-based scanning
cannot prove the absence of every deliberately obfuscated or unknown credential format.
GitHub-only inaccessible dangling objects, external forks/caches, Actions secrets and
other providers' secret stores are outside a repository-content audit. The known deleted
revision and all advertised refs were included. No revocation, rotation or history purge
is warranted solely for the placeholder matches found here.

Preserve this evidence. If a real credential is discovered later, revoke/rotate it with its
provider first, determine which test/live service uses it, and coordinate any production
binding change separately. History cleanup requires owner approval and does not replace
revocation. No corrective service change was required or performed by this audit.
