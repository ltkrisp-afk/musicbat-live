declare namespace Cloudflare {
  interface Env {
    RADIO_SERVICE?: Fetcher;
    RADIO_RUNTIME_ORIGIN?: string;
    RADIO_RUNTIME_TOKEN?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    MUSICBAT_BASE_URL?: string;
    MUSICBAT_PROCESSING_BPS?: string;
    MUSICBAT_PROCESSING_FIXED_CENTS?: string;
  }
}
