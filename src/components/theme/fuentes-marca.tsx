"use client";

import { useEffect } from "react";

// Fuentes de la marca (ADN 2026-10-19, §4 de memory/diseno/estudio-audiovisual/
// references/adn-y-tokens.md): cada papel con su familia y su respaldo. Satoshi y
// Quicksand NO viven en el repo (licencias de su autor): Satoshi entra por su CSS de
// Fontshare (licencia ITF) y Quicksand por Google Fonts; el propio componente carga
// bajo demanda una sola vez la hoja que su pieza pida y expone las variables con
// respaldos, así que sin red la interfaz sigue legible con lo ya instalado.

export type RolPapel = "display-editorial" | "organico";

export type EnlaceFuente = {
  id: string;
  papel: RolPapel;
  href: string;
};

export const URL_SATOSHI =
  "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap";

export const URL_QUICKSAND =
  "https://fonts.googleapis.com/css2?family=Quicksand:wght@400..700&display=swap";

// Una hoja por papel; el id permite comprobar sin red si ya está en el documento.
export const ENLACES_FUENTES: readonly EnlaceFuente[] = [
  { id: "ss-fuente-satoshi", papel: "display-editorial", href: URL_SATOSHI },
  { id: "ss-fuente-quicksand", papel: "organico", href: URL_QUICKSAND },
];

// Variables con respaldo: si la red falla, la pila cae a la familia del OS
// (--font-body, next/font de Inter) antes de caer al sistema.
export const PILA_DISPLAY = "'Satoshi', 'Rajdhani', var(--font-body), sans-serif";
export const PILA_TITULAR = "'Rajdhani', var(--font-body), sans-serif";
export const PILA_ORGANICA = "'Quicksand', var(--font-body), sans-serif";

export const VARIABLES_FUENTE: Readonly<Record<string, string>> = {
  "--ss-font-display": PILA_DISPLAY,
  "--ss-font-titular": PILA_TITULAR,
  "--ss-font-organica": PILA_ORGANICA,
};

/** Pura: de los enlaces pedidos, solo los del papel que la pieza delegó. */
export function enlacesParaPapeles(
  papeles: readonly RolPapel[],
  enlaces: readonly EnlaceFuente[] = ENLACES_FUENTES,
): EnlaceFuente[] {
  return enlaces.filter((enlace) => papeles.includes(enlace.papel));
}

/** Pura: de los enlaces pedidos, los que el documento aún no tiene. */
export function enlacesFaltantes(
  presentes: readonly string[],
  enlaces: readonly EnlaceFuente[] = ENLACES_FUENTES,
): EnlaceFuente[] {
  const yaEstan = new Set(presentes);
  return enlaces.filter((enlace) => !yaEstan.has(enlace.href));
}

/** Escribe las variables de la marca en el elemento raíz una sola vez. */
export function fijarVariablesFuente(raiz: { style: CSSStyleDeclaration }): void {
  for (const [nombre, valor] of Object.entries(VARIABLES_FUENTE)) {
    if (raiz.style.getPropertyValue(nombre) === "") {
      raiz.style.setProperty(nombre, valor);
    }
  }
}

export function FuentesMarca({ papeles }: { papeles?: readonly RolPapel[] }) {
  const clave = papeles ? papeles.join(",") : "*";
  useEffect(() => {
    const pedidos = papeles ? enlacesParaPapeles(papeles) : ENLACES_FUENTES;
    const presentes = Array.from(
      document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]"),
    ).map((link) => link.getAttribute("href") ?? "");
    for (const enlace of enlacesFaltantes(presentes, pedidos)) {
      const tag = document.createElement("link");
      tag.id = enlace.id;
      tag.rel = "stylesheet";
      tag.href = enlace.href;
      document.head.appendChild(tag);
    }
    fijarVariablesFuente(document.documentElement);
    // `papeles` se compone por quien llama; `clave` es su forma estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return null;
}
