/** Core take columns used by studio render — excludes provider_* (migration 017). */
export const TAKE_CORE_COLUMNS =
  "id, scene_id, take_number, media_type, status, starred, error_message, model, resolution, duration_seconds, has_audio, asset_id, created_at, updated_at" as const;

export const TAKE_PROVIDER_COLUMNS =
  "provider_request_id, provider_endpoint, provider_submitted_at" as const;

export const TAKE_ASSET_RELATION =
  "assets:asset_id(id, bucket, storage_path, media_type, width, height, duration_ms)" as const;

export const TAKE_SELECT_WITH_PROVIDER = `${TAKE_CORE_COLUMNS}, ${TAKE_PROVIDER_COLUMNS}, ${TAKE_ASSET_RELATION}`;

export const TAKE_SELECT_CORE = `${TAKE_CORE_COLUMNS}, ${TAKE_ASSET_RELATION}`;
