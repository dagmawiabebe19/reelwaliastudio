import "server-only";

/**
 * Co-pilot entity resolution — prefer human-stable keys (@ref_tag, name, ordinal)
 * over raw UUIDs so the model never has to transcribe UUIDs.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function normalizeRefKey(value: string): string {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

export type ResolveFailure = {
  error: string;
  valid_options: string[];
};

export type ResolveSuccess<T> = {
  entity: T;
  matched_by: "uuid" | "ref_tag" | "name" | "ordinal" | "title";
};

export function resolveAmong<T>(
  key: string,
  candidates: T[],
  accessors: {
    id: (item: T) => string;
    refTag?: (item: T) => string | null | undefined;
    name?: (item: T) => string | null | undefined;
    ordinal?: (item: T) => number | null | undefined;
    title?: (item: T) => string | null | undefined;
    label: (item: T) => string;
  },
  entityLabel: string,
): ResolveSuccess<T> | ResolveFailure {
  const raw = key.trim();
  if (!raw) {
    return {
      error: `${entityLabel} key is empty.`,
      valid_options: candidates.map(accessors.label),
    };
  }

  const options = candidates.map(accessors.label);

  if (looksLikeUuid(raw)) {
    const byId = candidates.find((item) => accessors.id(item) === raw);
    if (byId) return { entity: byId, matched_by: "uuid" };
    return {
      error: `No ${entityLabel} matches UUID "${raw}". Use @ref_tag, name, or scene_number instead.`,
      valid_options: options,
    };
  }

  const norm = normalizeRefKey(raw);

  if (accessors.refTag) {
    const byRef = candidates.filter((item) => {
      const tag = accessors.refTag!(item);
      return tag ? normalizeRefKey(tag) === norm || normalizeRefKey(`@${tag}`) === norm : false;
    });
    if (byRef.length === 1) return { entity: byRef[0], matched_by: "ref_tag" };
    if (byRef.length > 1) {
      return {
        error: `Ambiguous ${entityLabel} ref "${raw}" — ${byRef.length} matches.`,
        valid_options: byRef.map(accessors.label),
      };
    }
  }

  const ordinalMatch = norm.match(/^(?:scene[#_\s-]*)?(\d+)$/i);
  if (ordinalMatch && accessors.ordinal) {
    const n = Number(ordinalMatch[1]);
    // Accept 1-based scene_number (preferred) and 0-based sort_order.
    const byOrd = candidates.filter((item) => {
      const ord = accessors.ordinal!(item);
      return ord === n || ord === n - 1;
    });
    if (byOrd.length === 1) return { entity: byOrd[0], matched_by: "ordinal" };
    if (byOrd.length > 1) {
      return {
        error: `Ambiguous ${entityLabel} number "${raw}" — ${byOrd.length} matches.`,
        valid_options: byOrd.map(accessors.label),
      };
    }
  }

  if (accessors.name) {
    const byName = candidates.filter((item) => {
      const name = accessors.name!(item);
      return name ? normalizeRefKey(name) === norm : false;
    });
    if (byName.length === 1) return { entity: byName[0], matched_by: "name" };
    if (byName.length > 1) {
      return {
        error: `Ambiguous ${entityLabel} name "${raw}" — ${byName.length} matches.`,
        valid_options: byName.map(accessors.label),
      };
    }
  }

  if (accessors.title) {
    const byTitle = candidates.filter((item) => {
      const title = accessors.title!(item);
      return title ? normalizeRefKey(title) === norm : false;
    });
    if (byTitle.length === 1) return { entity: byTitle[0], matched_by: "title" };
    if (byTitle.length > 1) {
      return {
        error: `Ambiguous ${entityLabel} title "${raw}" — ${byTitle.length} matches.`,
        valid_options: byTitle.map(accessors.label),
      };
    }
  }

  return {
    error: `No ${entityLabel} matches "${raw}". Use @ref_tag, name, or scene_number — never invent UUIDs.`,
    valid_options: options,
  };
}
