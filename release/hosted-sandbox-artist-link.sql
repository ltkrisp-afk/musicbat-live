-- PREPARED ONLY. Requires explicit hosted sandbox approval and fresh Stripe account verification.
-- Original owner remains unchanged. Existing identical association is a no-op; conflicts abort on unique constraints.
INSERT INTO artist_accounts (artist_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
SELECT 'yY7U7NYKoZEsc3qxYJzEh8nNB3jXrRUopGya1R7e3cu74CgXcTSFil', 'acct_1UQrXtLKJHXYfqXB', 0, 0, 0
WHERE EXISTS (SELECT 1 FROM tracks WHERE id=5 AND artist_id='yY7U7NYKoZEsc3qxYJzEh8nNB3jXrRUopGya1R7e3cu74CgXcTSFil' AND audio_url='/api/musicbat/audio/048ea870-7924-40a2-9e18-c945a3a9b4b3.mp3')
AND NOT EXISTS (SELECT 1 FROM artist_accounts WHERE artist_id='yY7U7NYKoZEsc3qxYJzEh8nNB3jXrRUopGya1R7e3cu74CgXcTSFil' AND stripe_account_id='acct_1UQrXtLKJHXYfqXB');
-- Require exactly one matching row below; zero means STOP. Refresh readiness through authenticated Connect GET.
SELECT artist_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted FROM artist_accounts WHERE artist_id='yY7U7NYKoZEsc3qxYJzEh8nNB3jXrRUopGya1R7e3cu74CgXcTSFil';
