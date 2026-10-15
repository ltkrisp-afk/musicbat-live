declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    MUSICBAT_BASE_URL?: string;
    MUSICBAT_STRIPE_MODE?: string;
    MUSICBAT_PROCESSING_BPS?: string;
    MUSICBAT_PROCESSING_FIXED_CENTS?: string;
    MUSICBAT_RELEASE_PAUSED?: string;
    MUSICBAT_CHECKOUT_PAUSED?: string;
    MUSICBAT_SANDBOX_LINK_APPROVED?: string;
  }
}
