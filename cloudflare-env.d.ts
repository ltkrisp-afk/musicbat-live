declare namespace Cloudflare {
  interface Env {
    RADIO_SERVICE?: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    MUSICBAT_BASE_URL?: string;
    MUSICBAT_PROCESSING_BPS?: string;
    MUSICBAT_PROCESSING_FIXED_CENTS?: string;
  }
}
