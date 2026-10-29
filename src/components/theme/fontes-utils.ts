export const FONT_SHARE_URL =
  "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap";

export const GOOGLE_FONTS_QUICKSAND_URL =
  "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap";

export const FONT_VARIANTS = {
  display: "Satoshi",
  titular: "Rajdhani",
  organica: "Quicksand",
} as const;

export type FontVariant = keyof typeof FONT_VARIANTS;

export const FONT_FALLBACKS = {
  display: "Rajdhani, Inter, system-ui, sans-serif",
  titular: "Inter, system-ui, sans-serif",
  organica: "Inter, system-ui, sans-serif",
} as const;

export const getFontVariant = (variant: FontVariant): string => FONT_VARIANTS[variant];

export const getFontFallback = (variant: FontVariant): string =>
  FONT_FALLBACKS[variant];

export const getFontCssVariables = (): Record<string, string> => ({
  "--ss-font-display": FONT_VARIANTS.display,
  "--ss-font-titular": FONT_VARIANTS.titular,
  "--ss-font-organica": FONT_VARIANTS.organica,
  "--ss-font-display-fallback": FONT_FALLBACKS.display,
  "--ss-font-titular-fallback": FONT_FALLBACKS.titular,
  "--ss-font-organica-fallback": FONT_FALLBACKS.organica,
});

export const validateNoDuplicateLinks = (
  links: ReadonlyArray<HTMLLinkElement> | HTMLCollectionOf<HTMLLinkElement>,
): string[] => {
  const elements =
    "item" in links &&
    typeof (links as HTMLCollectionOf<HTMLLinkElement>).item === "function"
      ? Array.from(links as HTMLCollectionOf<HTMLLinkElement>)
      : links as ReadonlyArray<HTMLLinkElement>;
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const link of elements) {
    const href = link.href;
    if (seen.has(href)) {
      duplicates.push(href);
    } else {
      seen.add(href);
    }
  }
  return duplicates;
};