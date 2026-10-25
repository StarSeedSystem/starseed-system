"use client";

// Fuentes de la marca por papel (identidades.md §«Decisiones de Alex 2026-10-19»).
// Satoshi se carga SOLO por su CSS de Fontshare: licencia ITF, nunca sus archivos en el repo.
// El módulo separa el cálculo puro (qué hojas y qué pilas hacen falta) del efecto que las
// inserta, para poder probarlo sin red.

import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";

export type PapelMarca = "display" | "titular" | "organica";

export type HojaFuente = {
  id: "satoshi" | "quicksand";
  href: string;
};

export const HOJAS: Record<HojaFuente["id"], HojaFuente> = {
  satoshi: { id: "satoshi", href: "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap" },
  quicksand: { id: "quicksand", href: "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" },
};

const FAMILIAS: Record<PapelMarca, { familia: string; respaldo: string }> = {
  display: { familia: "Satoshi", respaldo: "'Rajdhani', 'Inter', system-ui, sans-serif" },
  titular: { familia: "Rajdhani", respaldo: "'Inter', system-ui, sans-serif" },
  organica: { familia: "Quicksand", respaldo: "'Inter', system-ui, sans-serif" },
};

/** Pila completa con respaldo: si la fuente no carga, el papel sigue leyéndose. */
export function variableDePapel(papel: PapelMarca): string {
  const { familia, respaldo } = FAMILIAS[papel];
  return `'${familia}', ${respaldo}`;
}

export function variablesDeMarca(): Record<string, string> {
  return {
    "--ss-font-display": variableDePapel("display"),
    "--ss-font-titular": variableDePapel("titular"),
    "--ss-font-organica": variableDePapel("organica"),
  };
}

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export type ContextoFuentes = {
  papeles?: readonly PapelMarca[];
  registro?: string | null;
  tema?: string | null;
};

/** Hojas necesarias según el papel, el registro o el tema de la pieza. */
export function hojasRequeridas({ papeles = [], registro, tema }: ContextoFuentes): HojaFuente[] {
  const pedidos = new Set<PapelMarca>(papeles);
  const registroNormal = normalizar(registro);
  if (registroNormal.includes("editorial") || registroNormal.includes("premium")) {
    pedidos.add("display");
  }
  if (normalizar(tema).includes("natural")) pedidos.add("organica");
  const hojas: HojaFuente[] = [];
  if (pedidos.has("display")) hojas.push(HOJAS.satoshi);
  if (pedidos.has("organica")) hojas.push(HOJAS.quicksand);
  return hojas;
}

/** Enlaces que faltan de verdad: ni repiten familia ni vuelven a pedir una hoja ya puesta. */
export function planHojas(
  existentes: readonly string[],
  requeridas: readonly HojaFuente[],
): HojaFuente[] {
  const puestas = new Set(existentes);
  const vistas = new Set<string>();
  return requeridas.filter((hoja) => {
    if (puestas.has(hoja.href) || vistas.has(hoja.href)) return false;
    vistas.add(hoja.href);
    return true;
  });
}

export type FuentesMarcaProps = ContextoFuentes & {
  children?: ReactNode;
  className?: string;
};

/** Pide una sola vez las hojas que necesita la pieza y publica las variables de papel. */
export function FuentesMarca({ children, className, papeles, registro, tema }: FuentesMarcaProps) {
  const clave = (papeles ?? []).join(",");
  useEffect(() => {
    if (typeof document === "undefined") return;
    const puestas = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      (enlace) => enlace.href,
    );
    const faltan = planHojas(
      puestas,
      hojasRequeridas({
        papeles: clave ? (clave.split(",") as PapelMarca[]) : [],
        registro,
        tema,
      }),
    );
    for (const hoja of faltan) {
      const enlace = document.createElement("link");
      enlace.rel = "stylesheet";
      enlace.href = hoja.href;
      enlace.dataset.ssFuente = hoja.id;
      document.head.appendChild(enlace);
    }
  }, [clave, registro, tema]);
  return (
    <div className={className} data-ss-fuentes style={variablesDeMarca() as CSSProperties}>
      {children}
    </div>
  );
}
