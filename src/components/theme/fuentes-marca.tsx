"use client";

import { useEffect } from "react";

/** Hoja real de Satoshi: solo por su CSS de Fontshare (licencia ITF, sin archivos en el repo). */
export const HOJA_SATOSHI =
  "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap";

/** Hoja de Quicksand para el tema Natural: papel orgánico servido por Google Fonts. */
export const HOJA_QUICKSAND =
  "https://fonts.googleapis.com/css2?family=Quicksand:wght@400..700&display=swap";

export type IdHoja = "satoshi" | "quicksand";

export type Hoja = { id: IdHoja; href: string };

export const HOJAS: Record<IdHoja, Hoja> = {
  satoshi: { id: "satoshi", href: HOJA_SATOSHI },
  quicksand: { id: "quicksand", href: HOJA_QUICKSAND },
};

/** Variables de la marca con respaldo en las familias ya instaladas del OS. */
export const VARIABLES_MARCA = {
  "--ss-font-display": "'Satoshi', 'Rajdhani', 'Inter', system-ui, sans-serif",
  "--ss-font-titular": "'Rajdhani', 'Inter', system-ui, sans-serif",
  "--ss-font-organica": "'Quicksand', 'Inter', system-ui, sans-serif",
} as const;

const PIEZAS_CON_DISPLAY = new Set([
  "editorial",
  "manifiesto",
  "cartel",
  "portada",
  "conferencia",
  "presentacion",
  "titulo-video",
  "premium",
]);

/** Normaliza un nombre de registro o pieza para compararlo sin acentos ni mayúsculas. */
export function normalizarPapel(valor?: string): string {
  return (valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** ¿El registro o la pieza piden el papel «display editorial»? */
export function usaDisplayEditorial(registro?: string, pieza?: string): boolean {
  return (
    PIEZAS_CON_DISPLAY.has(normalizarPapel(registro)) ||
    PIEZAS_CON_DISPLAY.has(normalizarPapel(pieza))
  );
}

export type NecesidadHojas = {
  displayEditorial?: boolean;
  temaNatural?: boolean;
  yaCargadas?: readonly string[];
};

/** Hojas que faltan por cargar: nunca repite una que ya está en el documento. */
export function hojasPendientes(necesidad: NecesidadHojas): Hoja[] {
  const cargadas = new Set(necesidad.yaCargadas ?? []);
  const pedidas: Hoja[] = [];
  if (necesidad.displayEditorial) pedidas.push(HOJAS.satoshi);
  if (necesidad.temaNatural) pedidas.push(HOJAS.quicksand);
  return pedidas.filter((hoja) => !cargadas.has(hoja.id));
}

/** Variables con respaldo que expone la marca, listas para aplicar al documento. */
export function variablesDeMarca(): Record<string, string> {
  return { ...VARIABLES_MARCA };
}

export type FuentesMarcaProps = {
  registro?: string;
  pieza?: string;
  tema?: string;
};

/** Carga bajo demanda (una sola vez) las hojas de los papeles que usa la pieza. */
export function FuentesMarca({ registro, pieza, tema }: FuentesMarcaProps) {
  const displayEditorial = usaDisplayEditorial(registro, pieza);
  const temaNatural = normalizarPapel(tema) === "natural";

  useEffect(() => {
    if (typeof document === "undefined") return;
    const raiz = document.documentElement;
    for (const [nombre, valor] of Object.entries(variablesDeMarca())) {
      raiz.style.setProperty(nombre, valor);
    }
    const yaCargadas = Array.from(
      document.querySelectorAll<HTMLLinkElement>("link[data-ss-fuente]"),
    ).map((enlace) => enlace.dataset.ssFuente ?? "");
    for (const hoja of hojasPendientes({ displayEditorial, temaNatural, yaCargadas })) {
      const enlace = document.createElement("link");
      enlace.id = `ss-fuente-${hoja.id}`;
      enlace.rel = "stylesheet";
      enlace.href = hoja.href;
      enlace.dataset.ssFuente = hoja.id;
      document.head.appendChild(enlace);
    }
  }, [displayEditorial, temaNatural]);

  return null;
}
