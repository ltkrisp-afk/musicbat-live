# Operating costs and margin evidence — October 29, 2026

Actual invoices, account-specific Cloudflare usage and processor settlement costs
were not established. A billing-email lookup stalled and was interrupted. No
zero-cost or profitable-operation claim follows from the absence of invoices.

Source inspection: the current shared player polls once per second while visible.
100,000 visible listener-hours would therefore generate about 360 million channel
polls, excluding media, page requests and retries. This is a workload estimate,
not measured production usage or capacity. The current private radio runtime is
also unconfigured in the production environment inspected in this run.

Official direct Cloudflare list prices checked October 29 (not a verified Sites
hosting bill or proof of the owner's subscribed plan):
- Workers Standard: $5 monthly minimum, 10 million requests included, then $0.30
  per million; 30 million CPU-ms included, then $0.02 per million CPU-ms.
- R2 Standard: 10 GB-month, 1 million Class A and 10 million Class B operations
  included; excess storage $0.015/GB-month, A $4.50/million, B $0.36/million.
  R2 egress is free; operations/storage still count. Billing units round upward.
- D1 Paid: 25 billion reads and 50 million writes included monthly; excess reads
  $0.001/million and writes $1/million; first 5 GB storage included, then $0.75/GB-month.

At that hypothetical 360-million-poll workload, direct Workers request charges
would be $110 including the minimum, before CPU, D1, storage, media requests,
sidecar hosting, taxes and any managed-hosting charges. D1 writes, CPU and actual
media request counts are unmeasured. No new services or recurring expenses were
provisioned. New indexed recording/version and per-use lookups avoid added
unindexed clearance scans; no polling/authority timing was weakened.

Illustrative business arithmetic only: 1,000 memberships at $5 yield $5,000 gross.
If taxes, actual membership fees, refunds and chargebacks total F, QCMR is
max(0,5000-F), subject to prior deficits; the new rights pool is floor(25% QCMR
in cents). The platform retains the remainder before operating costs. 700
$3 downloads add $315 platform allocation and $1,785 artist allocation; buyer
processing is separate. These are assumptions, not sales or profit forecasts.
Actual margin remains unknown until usage and settlement evidence are available.

Sources:
https://developers.cloudflare.com/workers/platform/pricing/
https://developers.cloudflare.com/r2/pricing/
https://developers.cloudflare.com/d1/platform/pricing/

## Newly obtained billing evidence

Read the owner-connected Cloudflare invoice notification received October 28:
amount due $0.00. This verifies that notification's stated amount only. No
itemized service usage, billing period, paid-plan status or credit breakdown was
available in that email. It does not establish that every MusicBat service is
free or forecast future workload costs. Only a sandbox Stripe account was exposed
by the connected account inventory. Its sampled 237-cent charges / 37-cent fees
are simulated evidence and are excluded from actual costs and QCMR.
