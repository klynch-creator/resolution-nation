// Student dashboard themes. Stored as profiles.theme. Each theme drives the
// welcome banner gradient + accent used across the student dashboard. Kept
// deliberately cheerful and high-contrast for readability.

export interface Theme {
  id: string;
  label: string;
  emoji: string;
  // Banner gradient stops.
  from: string;
  to: string;
  // Accent for highlights/badges on a light background.
  accent: string;
  // App page background.
  pageBg: string;
}

export const THEMES: Theme[] = [
  { id: "ocean", label: "Ocean", emoji: "🌊", from: "#028090", to: "#02C39A", accent: "#028090", pageBg: "#F7F9FC" },
  { id: "sunset", label: "Sunset", emoji: "🌅", from: "#F97316", to: "#DB2777", accent: "#DB2777", pageBg: "#FFF7F3" },
  { id: "galaxy", label: "Galaxy", emoji: "🌌", from: "#4F46E5", to: "#9333EA", accent: "#7C3AED", pageBg: "#F8F7FF" },
  { id: "forest", label: "Forest", emoji: "🌳", from: "#16A34A", to: "#65A30D", accent: "#16A34A", pageBg: "#F5FBF4" },
  { id: "bubblegum", label: "Bubblegum", emoji: "🍬", from: "#EC4899", to: "#F472B6", accent: "#DB2777", pageBg: "#FFF5FA" },
  { id: "midnight", label: "Midnight", emoji: "🌙", from: "#0F172A", to: "#334155", accent: "#0EA5E9", pageBg: "#F1F5F9" },
  { id: "lava", label: "Lava", emoji: "🌋", from: "#DC2626", to: "#F59E0B", accent: "#DC2626", pageBg: "#FFF7ED" },
  { id: "mint", label: "Mint", emoji: "🌿", from: "#0D9488", to: "#34D399", accent: "#0D9488", pageBg: "#F2FBF8" },
];

const THEME_MAP = new Map(THEMES.map((t) => [t.id, t]));
export const DEFAULT_THEME = THEMES[0];

export function getTheme(id: string | null | undefined): Theme {
  if (!id) return DEFAULT_THEME;
  return THEME_MAP.get(id) ?? DEFAULT_THEME;
}
