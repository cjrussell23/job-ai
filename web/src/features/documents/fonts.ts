/**
 * The fonts a resume can use. Each is bundled (open licences, from Fontsource), so the
 * live preview, the PDF and the page count all use the same letterforms. Word files name
 * the closest common font instead, since Word uses the fonts installed on the reader's
 * computer; most are metric-compatible stand-ins for exactly those fonts.
 */

export const fontKeys = ["arimo", "carlito", "lato", "tinos", "gelasio", "garamond"] as const;
export type FontKey = (typeof fontKeys)[number];

export type FontInfo = {
  label: string;
  family: string;
  fallback: "sans-serif" | "serif";
  /** The Fontsource package and file prefix. */
  pkg: string;
  /** The font Word should use. */
  docx: string;
};

export const fonts: Record<FontKey, FontInfo> = {
  arimo: {
    label: "Arial style (Arimo)",
    family: "Arimo",
    fallback: "sans-serif",
    pkg: "arimo",
    docx: "Arial",
  },
  carlito: {
    label: "Calibri style (Carlito)",
    family: "Carlito",
    fallback: "sans-serif",
    pkg: "carlito",
    docx: "Calibri",
  },
  lato: { label: "Lato", family: "Lato", fallback: "sans-serif", pkg: "lato", docx: "Lato" },
  tinos: {
    label: "Times New Roman style (Tinos)",
    family: "Tinos",
    fallback: "serif",
    pkg: "tinos",
    docx: "Times New Roman",
  },
  gelasio: {
    label: "Georgia style (Gelasio)",
    family: "Gelasio",
    fallback: "serif",
    pkg: "gelasio",
    docx: "Georgia",
  },
  garamond: {
    label: "Garamond (EB Garamond)",
    family: "EB Garamond",
    fallback: "serif",
    pkg: "eb-garamond",
    docx: "Garamond",
  },
};

const variants = [
  { weight: 400, style: "normal" },
  { weight: 400, style: "italic" },
  { weight: 700, style: "normal" },
  { weight: 700, style: "italic" },
] as const;

/** The font files a resume may load, by file name, for the font route and the PDF renderer. */
export function fontFile(file: string): { pkg: string; file: string } | null {
  for (const info of Object.values(fonts)) {
    for (const v of variants) {
      const name = `${info.pkg}-latin-${v.weight}-${v.style}.woff2`;
      if (name === file) return { pkg: info.pkg, file: name };
    }
  }
  return null;
}

/** Where resume fonts are served from; the PDF renderer answers the same paths itself. */
export const fontPath = "/resume-fonts/";

/** @font-face rules for one font, loaded from the app (or from data URIs when given). */
export function fontFaceCss(key: FontKey, source?: (file: string) => string): string {
  const info = fonts[key];
  return variants
    .map((v) => {
      const file = `${info.pkg}-latin-${v.weight}-${v.style}.woff2`;
      const src = source ? source(file) : `${fontPath}${file}`;
      return `@font-face{font-family:"${info.family}";font-style:${v.style};font-weight:${v.weight};font-display:block;src:url("${src}") format("woff2");}`;
    })
    .join("");
}

export const fontStack = (key: FontKey) => `"${fonts[key].family}", ${fonts[key].fallback}`;
