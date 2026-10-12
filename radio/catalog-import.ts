import type { RadioRuntime, ReviewedAsset } from './runtime';
import type { ScheduledTrack } from '../lib/shared-radio-engine';
import type { Permission } from '../lib/playback-authorization';
/** Reviewed bridge from an exported/upload catalog to the existing private
 * authority. The caller supplies downloaded immutable bytes and actual review
 * evidence. Neither account authentication nor upload consent creates a grant. */
export function publishCatalogRecording(runtime: RadioRuntime, row: {
 id:number;artist_id:string;status:string;radio_enabled:number;rights_attested:number;
 primary_genre:string;subgenre:string|null;style:string|null;
}, permission: Permission, review: {
 artistIds:string[];albumId:string;compilationIds:string[];durationMs:number;
 directRestrictions:ScheduledTrack['directRestrictions'];metadataReviewed:true;
}, asset: ReviewedAsset) {
 if (!Number.isSafeInteger(row.id) || row.id<1 || !row.artist_id?.trim() || row.status!=='active' || row.radio_enabled!==1 || row.rights_attested!==1)
  throw new Error('catalog-consent-required');
 const category={genre:row.primary_genre,...(row.subgenre?{subgenre:row.subgenre}:{}),...(row.style?{style:row.style}:{})};
 runtime.publishSource({id:String(row.id),category,...review,eligible:true,permission,statutoryEligibility:null},asset);
}
