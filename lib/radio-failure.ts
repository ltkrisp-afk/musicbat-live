/** Server-only diagnostics: never log identity, request headers, SQL or bindings. */
export function recordRadioFailure(dependency: string, error: unknown) {
 const message=error instanceof Error?error.message:'';
 const reason=message.match(/server-clock-regressed|malformed JSON|radio-d1-[a-z-]+|channel-ledger-[a-z-]+|unknown-shared-channel|listener-session-missing|Too many subrequests|too many SQL variables|database is locked|Network connection lost|exceeded.*(?:limit|duration)/i)?.[0]??'unclassified-dependency-failure';
 const stack=error instanceof Error?(error.stack??'').split('\n').slice(1).filter(line=>/^\s+at /.test(line)).slice(0,10).map(line=>line.replace(/\?[^ )]*/g,'?[redacted]').slice(0,240)):[];
 console.error('musicbat_radio_failure',JSON.stringify({dependency,name:error instanceof Error?error.name:'UnknownError',reason,stack}));
}
