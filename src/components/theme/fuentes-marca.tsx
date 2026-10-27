"use client";

import { useEffect } from "react";

const FONTSHARE_SATOSHI_URL =
  "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap";
const GOOGLE_QUICKSAND_URL =
  "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap";

const FONT_LINK_IDS = {
  satoshi: "ss-font-satoshi",
  quicksand: "ss-font-quicksand",
} as const;

type FontRole = "display-editorial" | "titular-tecnico" | "organico";

const FONT_VARIABLES: Record<FontRole, string> = {
  "display-editorial": "--ss-font-display",
  "titular-tecnico": "--ss-font-titular",
  organico: "--ss-font-organica",
} as const;

const FONT_FALLBACKS: Record<FontRole, string> = {
  "display-editorial": "'Rajdhani', 'Inter', system-ui, sans-serif",
  "titular-tecnico": "'Rajdhani', 'Inter', system-ui, sans-serif",
  organico: "'Inter', system-ui, sans-serif",
} as const;

let satoshiLoaded = false;
let quicksandLoaded = false;

function injectFontLink(id: string, href: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  link.media = "print";
  link.onload = () => {
    link.media = "all";
  };
  document.head.appendChild(link);
}

function setFontVariables(role: FontRole): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const variable = FONT_VARIABLES[role];
  const fallback = FONT_FALLBACKS[role];
  const current = root.style.getPropertyValue(variable).trim();
  if (!current) {
    root.style.setProperty(variable, fallback);
  }
}

export function cargarFuenteDisplayEditorial(): void {
  if (satoshiLoaded) return;
  injectFontLink(FONT_LINK_IDS.satoshi, FONTSHARE_SATOSHI_URL);
  setFontVariables("display-editorial");
  satoshiLoaded = true;
}

export function cargarFuenteTitularTecnico(): void {
  setFontVariables("titular-tecnico");
}

export function cargarFuenteOrganica(): void {
  if (quicksandLoaded) return;
  injectFontLink(FONT_LINK_IDS.quicksand, GOOGLE_QUICKSAND_URL);
  setFontVariables("organico");
  quicksandLoaded = true;
}

export function cargarFuentesParaRegistro(registro: string): void {
  switch (registro) {
    case "nexus":
    case "trinity":
    case "monaco-noir":
    case "aurora-borealis":
      cargarFuenteDisplayEditorial();
      break;
    case "astraura":
    case "genesis":
    case "democracia-directa":
    case "malla-cristalina":
      cargarFuenteTitularTecnico();
      break;
    case "economia-ecologica":
    case "cafe-comunidad":
    case "materia-viva":
    case "natural":
      cargarFuenteOrganica();
      break;
    default:
      break;
  }
}

export function usarFuentesMarca(registro?: string): void {
  useEffect(() => {
    if (registro) {
      cargarFuentesParaRegistro(registro);
    }
  }, [registro]);
}

export function obtenerVariableFuente(role: FontRole): string {
  return `var(${FONT_VARIABLES[role]}, ${FONT_FALLBACKS[role]})`;
}

export function obtenerFuentesCSS(): Record<string, string> {
  return {
    "--ss-font-display": `'Satoshi', ${FONT_FALLBACKS["display-editorial"]}`,
    "--ss-font-titular": `'Rajdhani', ${FONT_FALLBACKS["titular-tecnico"]}`,
    "--ss-font-organica": `'Quicksand', ${FONT_FALLBACKS.organico}`,
  };
}

export {
  FONT_VARIABLES,
  FONT_FALLBACKS,
  FONT_LINK_IDS,
  FONTSHARE_SATOSHI_URL,
  GOOGLE_QUICKSAND_URL,
};
export type { FontRole };