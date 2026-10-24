"use client";

import { useEffect } from "react";

/** Hojas remotas de la marca. Satoshi solo por su CSS de Fontshare (licencia ITF):
 *  sus archivos nunca se empaquetan en el repositorio. */
export const HOJA_SATOSHI =
  "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap";
export const HOJA_QUICKSAND =
  "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap";

export interface HojaFuente {
  id: string;
  href: string;
}

export interface ContextoFuentes {
  /** Registro de identidad de la pieza (`display-editorial`, `manifiesto`, …). */
  registro?: string;
  /** Tema activo del OS; `natural` pide la familia orgánica. */
  tema?: string;
  /** Fuerza la hoja editorial en una pieza concreta. */
  displayEditorial?: boolean;
  /** Fuerza la familia orgánica en una pieza concreta. */
  organica?: boolean;
}

export type FuentesMarcaProps = ContextoFuentes;

export const VARIABLES_MARCA = {
  "--ss-font-display": "'Satoshi', 'Rajdhani', 'Inter', ui-sans-serif, system-ui, sans-serif",
  "--ss-font-titular": "'Rajdhani', 'Inter', ui-sans-serif, system-ui, sans-serif",
  "--ss-font-organica": "'Quicksand', 'Inter', ui-sans-serif, system-ui, sans-serif",
} as const;

const REGISTROS_EDITORIALES = new Set([
  "display-editorial",
  "editorial",
  "manifiesto",
  "cartel",
  "portada",
  "conferencia",
  "video-de-marca",
]);

const REGISTROS_ORGANICOS = new Set(["natural", "materia-viva", "fundacion", "ecologia"]);

function normalizar(valor?: string): string {
  if (!valor) return "";
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-");
}

/** Hojas que pide un contexto: Satoshi para lo editorial y Quicksand para lo orgánico.
 *  Sin papel editorial ni registro orgánico no se descarga ninguna fuente. */
export function hojasNecesarias(contexto: ContextoFuentes): HojaFuente[] {
  const registro = normalizar(contexto.registro);
  const tema = normalizar(contexto.tema);
  const hojas: HojaFuente[] = [];
  if (contexto.displayEditorial || REGISTROS_EDITORIALES.has(registro)) {
    hojas.push({ id: "ss-fuente-satoshi", href: HOJA_SATOSHI });
  }
  if (contexto.organica || REGISTROS_ORGANICOS.has(tema) || REGISTROS_ORGANICOS.has(registro)) {
    hojas.push({ id: "ss-fuente-quicksand", href: HOJA_QUICKSAND });
  }
  return hojas;
}

/** Filtra las hojas que aún no están en el documento y elimina repetidas por `id`:
 *  así dos piezas del mismo registro no duplican enlaces. */
export function hojasPendientes(
  hojas: readonly HojaFuente[],
  idsPresentes: Iterable<string>,
): HojaFuente[] {
  const presentes = new Set(idsPresentes);
  const vistas = new Set<string>();
  return hojas.filter((hoja) => {
    if (presentes.has(hoja.id) || vistas.has(hoja.id)) return false;
    vistas.add(hoja.id);
    return true;
  });
}

function insertarHoja(hoja: HojaFuente): void {
  if (document.getElementById(hoja.id)) return;
  const enlace = document.createElement("link");
  enlace.id = hoja.id;
  enlace.rel = "stylesheet";
  enlace.href = hoja.href;
  document.head.appendChild(enlace);
}

/** Carga bajo demanda, una sola vez, las hojas de la marca y publica las variables
 *  tipográficas con sus respaldos. No pinta nada en el árbol. */
export function FuentesMarca({ registro, tema, displayEditorial, organica }: FuentesMarcaProps) {
  useEffect(() => {
    const raiz = document.documentElement;
    for (const [nombre, valor] of Object.entries(VARIABLES_MARCA)) {
      if (!raiz.style.getPropertyValue(nombre)) raiz.style.setProperty(nombre, valor);
    }
  }, []);

  useEffect(() => {
    const hojas = hojasNecesarias({ registro, tema, displayEditorial, organica });
    const presentes = Array.from(
      document.querySelectorAll<HTMLLinkElement>("link[id^='ss-fuente-']"),
      (enlace) => enlace.id,
    );
    for (const hoja of hojasPendientes(hojas, presentes)) insertarHoja(hoja);
  }, [registro, tema, displayEditorial, organica]);

  return null;
}

export default FuentesMarca;
