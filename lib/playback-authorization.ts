/** No rights are inferred from an upload checkbox, subscription, or statutory registration. */
export type PlaybackMode = "free-radio" | "radio-plus";
export type Permission = {
  recording_basis: string; recording_evidence: string; composition_evidence: string;
  reviewed_by: string; reviewed_at: number; artist_authorized: number;
  free_allowed: number; plus_allowed: number; starts_at: number; expires_at: number;
  withdrawn_at: number | null; territory: string;
};
export function authorizePlayback(permission: Permission | null, mode: PlaybackMode, now: number, territory: string) {
  if (!permission) return { allowed: false, reason: "missing-permission" };
  if (!permission.artist_authorized) return { allowed: false, reason: "artist-authorization-missing" };
  if (!permission.recording_evidence?.trim() || !permission.composition_evidence?.trim() ||
      !permission.reviewed_by?.trim() || !Number.isFinite(permission.reviewed_at) || permission.reviewed_at > now)
    return { allowed: false, reason: "rights-review-incomplete" };
  if (!Number.isFinite(permission.starts_at) || !Number.isFinite(permission.expires_at) ||
      permission.starts_at > now || permission.expires_at <= now || permission.withdrawn_at !== null)
    return { allowed: false, reason: "permission-inactive" };
  if (permission.territory !== "worldwide" && permission.territory !== territory)
    return { allowed: false, reason: "territory-not-covered" };
  if (!(mode === "free-radio" ? permission.free_allowed : permission.plus_allowed))
    return { allowed: false, reason: "mode-not-covered" };
  // Existing track-request/seek endpoint cannot establish a statutory noninteractive channel.
  if (permission.recording_basis !== "direct")
    return { allowed: false, reason: "statutory-channel-not-established" };
  return { allowed: true, reason: "reviewed-direct-permissions" };
}
