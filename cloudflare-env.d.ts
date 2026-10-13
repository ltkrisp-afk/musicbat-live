declare namespace Cloudflare {
  interface Env {
    RADIO_SERVICE?: Fetcher;
    RADIO_RUNTIME_ORIGIN?: string;
    RADIO_RUNTIME_TOKEN?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MUSICBAT_RELEASE_PAUSED?: string;
    MUSICBAT_STRIPE_MODE?: string;
    MUSICBAT_RADIO_PLUS_ENABLED?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_RADIO_PLUS_WEBHOOK_SECRET?: string;
    MUSICBAT_BASE_URL?: string;
    MUSICBAT_PROCESSING_BPS?: string;
    MUSICBAT_PROCESSING_FIXED_CENTS?: string;
  }
}
