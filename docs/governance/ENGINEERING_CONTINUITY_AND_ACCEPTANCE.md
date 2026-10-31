# MusicBat engineering continuity and hosted acceptance

Status: Engineering operating protocol. This document does not change business terms, legal authority, or release authorization.

## Governing standard

Every confirmed correction must improve future reliability, not merely close the immediate symptom. Resume from verified evidence; never equate a commit, passing tests, or a local preview with a working hosted release.

## Pre-execution record

Before changing code or configuration:
1. Identify the requested outcome, approved scope, affected systems, and prohibited actions.
2. Read current branch/PR revision, relevant Golden Foundation and legal execution guidance, prior decisions, acceptance evidence, and known open defects.
3. Check whether the requirement is already implemented. Preserve verified work; do not create parallel implementations or duplicate branches without a documented constraint and owner approval.
4. Verify access to each service actually needed for the task. Record the GitHub repo/branch/PR; selected Cloudflare account/project/deployment revision and bindings; Stripe account and test/live mode; database migration state; browser identity/role; and any missing authorization. These are separate sessions: a dashboard selection on a phone does not establish Work's environment. Do not print credentials or claim an unobserved connection.
5. State the expected verification evidence and the rollback/preservation boundary.

If preflight is incomplete, mark dependent work BLOCKED with the exact missing evidence. Continue independent authorized work where safe.

## Corrective-action register

Record confirmed defects in a dated evidence document with:
- ID, observed behavior, environment and revision, and reproduction evidence.
- Intended behavior and authoritative requirement.
- Root cause: VERIFIED with supporting evidence, or UNKNOWN; distinguish suspected causes.
- Scope, affected dependencies and regression risks.
- Fix revision and tests actually executed.
- Hosted deployment revision, browser outcome, and evidence references when available.
- Status: OPEN, BLOCKED, IMPLEMENTED, VALIDATED, DEPLOYED, ACCEPTED or REOPENED.
- Remaining limits, accountable next action and prior checkpoint.

Do not reconstruct missing history as fact. A new failure should trigger a check for related classes of failures and a targeted regression where appropriate. A governance-only edit need not invent a behavior test.

## Evidence and completion gates

- IMPLEMENTED: code or documentation committed at an identified revision.
- VALIDATED: specified automated checks actually executed and passed; include counts and failures.
- DEPLOYED: the intended hosted environment is verified to run the identified revision and required migrations/configuration.
- ACCEPTED: hosted browser and relevant integration/visual behavior match approved requirements with evidence.
- BLOCKED / NOT RUN / FAIL: identify the missing prerequisite or observed failure; do not convert these into PASS.

Local fixtures, simulated checkout, GitHub checks, Cloudflare deployment, real Stripe test-mode transactions, rights clearance, mobile-device checks and production are separate evidence classes. No one class proves another. Include current screen/browser verification when visual or user-facing behavior changes.

## Session handoff

At every pause or completion, record the current PR and revision, verified passing checkpoints, unresolved failures, environment access status, and the next exact action. The next session must read that checkpoint before proceeding. Never repeat a completed repair merely because the session changed.

## Preservation and authorization

Preserve PR #5, historical entitlements, accounting, rights and consent evidence, approved 85/15 digital purchase allocation, separate approved membership accounting, and the Golden Foundation. No production deployment, merge, DNS, live Stripe mutation, legal agreement activation, or real payment without explicit owner authorization. Sandbox deployment also requires the applicable authorization and verified environment identity.

## Demonstration criteria

For a governance change, show the exact committed files and revisions and inspect the stored contents. For future engineering work, demonstrate an account/environment mismatch is surfaced as BLOCKED before dependent execution; demonstrate a passing test suite without hosted evidence remains VALIDATED, not ACCEPTED; and demonstrate incomplete work can resume from a durable checkpoint. Record actual observations rather than declaring these demonstrations passed in advance.
