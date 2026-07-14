import { CHARACTER_HEADSHOT_PREFIX } from "@/lib/production/prompts";
import { appendReferenceStyle } from "@/lib/production/reference-style";

/**
 * Deterministic sanitization for character headshot prompts.
 * Keeps identity cues (age, face, hair, eyes, build, expression) and strips
 * story-context wardrobe / situation details that trip image safety filters.
 * Does not mutate the stored ingredient description — only the generation prompt.
 */

const STORY_CONTEXT_PATTERNS: RegExp[] = [
  /\b(strip(?:per|ping)?|dancer|dancewear|stage makeup|pole|club|brothel|escort)\b/gi,
  /\b(cash|money|bills?)\s+(tucked|stuffed|hidden)\s+(in|into|under)\s+(her|his|their)\s+\w+/gi,
  /\b(tucked|stuffed)\s+in\s+(her|his|their)\s+(bra|underwear|panties|cleavage)\b/gi,
  /\b(lingerie|bra|panties|thong|g-string|bikini|revealing|skimpy|sexy|seductive|provocative)\b/gi,
  /\b(nude|naked|topless|bottomless|undressed|disheveled after)\b/gi,
  /\b(first successful night|after (?:her|his|their) (?:first )?night)\b/gi,
  /\b(elaborate dancewear|polished stage makeup)\b/gi,
  /\b(handles? a makeup brush[^.!]*)/gi,
  /\b(with cash[^.!]*)/gi,
  /\b(nervous body language after[^.!]*)/gi,
];

const OCCUPATION_SITUATION_PATTERNS: RegExp[] = [
  /\b(mentor figure in the strip club|newcomer dancer|performance|on stage|backstage)\b/gi,
  /\b(in the (?:strip )?club|at the club|on the dance floor)\b/gi,
];

/** Pull age / demographic phrases that are safe identity signals. */
function extractIdentityFragments(description: string): string[] {
  const fragments: string[] = [];
  const age = description.match(/\b\d{1,2}[- ]year[- ]old\b/i);
  if (age) fragments.push(age[0]);

  const ethnicity = description.match(
    /\b(Ethiopian|Eritrean|Amhara|Oromo|African(?:-American)?|Black|White|Asian|Latina|Latino|Hispanic|Middle Eastern|mixed[- ]race)\b/gi,
  );
  if (ethnicity) fragments.push(...ethnicity);

  const gender = description.match(
    /\b(woman|man|girl|boy|female|male|non[- ]binary)\b/i,
  );
  if (gender) fragments.push(gender[0]);

  const hair = description.match(
    /\b(?:short|long|shoulder[- ]length|curly|straight|wavy|braided|afro|bald)?\s*(?:black|brown|blonde|red|gray|grey|dark|light)?\s*hair\b/gi,
  );
  if (hair) fragments.push(...hair);

  const eyes = description.match(
    /\b(?:dark|brown|hazel|green|blue|innocent|warm|sharp)?\s*eyes?\b/gi,
  );
  if (eyes) fragments.push(...eyes);

  const build = description.match(
    /\b(?:slim|athletic|stocky|petite|tall|short|lean|muscular|curvy)?\s*(?:build|frame|stature)\b/gi,
  );
  if (build) fragments.push(...build);

  const expression = description.match(
    /\b(?:neutral|warm|confident|nervous|soft|stern|maternal|innocent)\s+(?:expression|energy|demeanor|look)\b/gi,
  );
  if (expression) fragments.push(...expression);

  const face = description.match(
    /\b(?:fresh[- ]faced|youthful|mature|angular|round|oval)\s*(?:face|features)?\b/gi,
  );
  if (face) fragments.push(...face);

  return [...new Set(fragments.map((f) => f.trim()).filter(Boolean))];
}

function stripStoryContext(description: string): string {
  let cleaned = description;
  for (const pattern of [...STORY_CONTEXT_PATTERNS, ...OCCUPATION_SITUATION_PATTERNS]) {
    cleaned = cleaned.replace(pattern, " ");
  }
  return cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/^[.,;:\s]+|[.,;:\s]+$/g, "")
    .trim();
}

/**
 * Build an identity-only description suitable for a neutral studio headshot.
 * Falls back to stripped text + neutral clothing if structured extraction is thin.
 */
export function sanitizeCharacterHeadshotDescription(description: string): string {
  const raw = description.trim();
  if (!raw) return "Adult person, neutral expression, plain casual clothing.";

  const identity = extractIdentityFragments(raw);
  const stripped = stripStoryContext(raw);

  const identityLine =
    identity.length >= 2
      ? identity.join(", ")
      : stripped || raw.slice(0, 180);

  return (
    `${identityLine}. ` +
    "Fictional person, not resembling any real individual. " +
    "Neutral everyday clothing (plain crew-neck shirt), shoulders visible, " +
    "no costumes, no props, no suggestive wardrobe."
  )
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildCharacterHeadshotPrompt(
  description: string,
  options?: { referenceStyle?: string | null },
): string {
  const base = `${CHARACTER_HEADSHOT_PREFIX}${sanitizeCharacterHeadshotDescription(description)}`;
  return appendReferenceStyle(base, options?.referenceStyle);
}
