"use client";

import { useEffect } from "react";

const FONTSHARE_SATOSHI_URL =
  "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap";
const GOOGLE_QUICKSAND_URL =
  "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap";

const FONT_VARIABLES = {
  display: "--ss-font-display",
  titular: "--ss-font-titular",
  organica: "--ss-font-organica",
} as const;

type FontRole = keyof typeof FONT_VARIABLES;

interface FontDefinition {
  name: string;
  fallbacks: string[];
  cssUrl: string;
}

const FONT_DEFINITIONS: Record<FontRole, FontDefinition> = {
  display: {
    name: "Satoshi",
    fallbacks: ["Rajdhani", "Inter", "system-ui", "sans-serif"],
    cssUrl: FONTSHARE_SATOSHI_URL,
  },
  titular: {
    name: "Rajdhani",
    fallbacks: ["Inter", "system-ui", "sans-serif"],
    cssUrl: "",
  },
  organica: {
    name: "Quicksand",
    fallbacks: ["Inter", "system-ui", "sans-serif"],
    cssUrl: GOOGLE_QUICKSAND_URL,
  },
};

let loadedFonts = new Set<string>();

function buildFontStack(role: FontRole): string {
  const def = FONT_DEFINITIONS[role];
  return `'${def.name}', ${def.fallbacks.map((f) => `'${f}'`).join(", ")}`;
}

function applyFontVariables(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  (Object.keys(FONT_VARIABLES) as FontRole[]).forEach((role) => {
    root.style.setProperty(FONT_VARIABLES[role], buildFontStack(role));
  });
}

function loadFontCss(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (loadedFonts.has(url)) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => {
      loadedFonts.add(url);
      resolve();
    };
    link.onerror = () => reject(new Error(`Failed to load font: ${url}`));
    document.head.appendChild(link);
  });
}

export function FuentesMarca({
  roles = ["display", "titular", "organica"],
}: {
  roles?: FontRole[];
}): null {
  useEffect(() => {
    applyFontVariables();

    const urlsToLoad = roles
      .map((r) => FONT_DEFINITIONS[r].cssUrl)
      .filter((u): u is string => u.length > 0);

    let cancelled = false;

    Promise.all(urlsToLoad.map(loadFontCss))
      .then(() => {
        if (!cancelled) applyFontVariables();
      })
      .catch((err) => {
        if (!cancelled) console.warn("[FuentesMarca] Font load warning:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [roles.join(",")]);

  return null;
}

export { buildFontStack, applyFontVariables, loadFontCss, FONT_DEFINITIONS, FONT_VARIABLES };