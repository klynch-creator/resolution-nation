// Avatar model shared across student + teacher/parent views.
//
// profiles.avatar_url stores one of:
//   • null / ""        → no avatar chosen → show colored initial
//   • "preset:<id>"    → one of the built-in emoji avatars below (no storage)
//   • "<uid>/<file>"   → a path in the private `avatars` storage bucket
//                        (uploaded + AI-moderated); displayed via a signed URL
//                        minted by /api/avatar/[userId]

export interface PresetAvatar {
  id: string;
  emoji: string;
  bg: string; // background color
  label: string;
}

// Fun, friendly, school-safe preset avatars. Emoji-based so there are no assets
// to host and nothing to moderate — the default, COPPA-safe path.
export const PRESET_AVATARS: PresetAvatar[] = [
  { id: "fox", emoji: "🦊", bg: "#FB923C", label: "Fox" },
  { id: "panda", emoji: "🐼", bg: "#94A3B8", label: "Panda" },
  { id: "owl", emoji: "🦉", bg: "#A78BFA", label: "Owl" },
  { id: "frog", emoji: "🐸", bg: "#34D399", label: "Frog" },
  { id: "cat", emoji: "🐱", bg: "#FBBF24", label: "Cat" },
  { id: "dog", emoji: "🐶", bg: "#F59E0B", label: "Dog" },
  { id: "penguin", emoji: "🐧", bg: "#38BDF8", label: "Penguin" },
  { id: "unicorn", emoji: "🦄", bg: "#F472B6", label: "Unicorn" },
  { id: "dragon", emoji: "🐉", bg: "#22C55E", label: "Dragon" },
  { id: "robot", emoji: "🤖", bg: "#60A5FA", label: "Robot" },
  { id: "rocket", emoji: "🚀", bg: "#818CF8", label: "Rocket" },
  { id: "star", emoji: "⭐", bg: "#FACC15", label: "Star" },
  { id: "rainbow", emoji: "🌈", bg: "#2DD4BF", label: "Rainbow" },
  { id: "lion", emoji: "🦁", bg: "#FB923C", label: "Lion" },
  { id: "turtle", emoji: "🐢", bg: "#4ADE80", label: "Turtle" },
  { id: "narwhal", emoji: "🦭", bg: "#7DD3FC", label: "Narwhal" },
];

const PRESET_MAP = new Map(PRESET_AVATARS.map((a) => [a.id, a]));

export type ResolvedAvatar =
  | { kind: "preset"; preset: PresetAvatar }
  | { kind: "upload"; path: string }
  | { kind: "initial" };

// Classify a stored avatar_url WITHOUT any network call. Uploads still need a
// signed URL (fetch separately); presets + initials render immediately.
export function resolveAvatar(avatarUrl: string | null | undefined): ResolvedAvatar {
  if (!avatarUrl) return { kind: "initial" };
  if (avatarUrl.startsWith("preset:")) {
    const preset = PRESET_MAP.get(avatarUrl.slice("preset:".length));
    return preset ? { kind: "preset", preset } : { kind: "initial" };
  }
  // Anything else is treated as a storage path in the avatars bucket.
  return { kind: "upload", path: avatarUrl };
}

export function presetValue(id: string): string {
  return `preset:${id}`;
}

export function isUploadedAvatar(avatarUrl: string | null | undefined): boolean {
  return resolveAvatar(avatarUrl).kind === "upload";
}

// Deterministic color for the fallback initial, derived from the name so a
// student's blank avatar is at least consistently colored.
const INITIAL_COLORS = [
  "#028090", "#7C3AED", "#D97706", "#DB2777", "#0EA5E9", "#16A34A", "#F43F5E",
];
export function initialColor(name: string | null | undefined): string {
  const s = name ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return INITIAL_COLORS[h % INITIAL_COLORS.length];
}
