"use client";

import { useEffect } from "react";

/**
 * Fuentes de la marca por papel (decisión de Alex, 2026-10-19).
 *
 * Satoshi es ITF Free Font License: sus archivos NUNCA viajan en el repo; se
 * carga solo su CSS alojado de Fontshare. Rajdhani, Inter, Quicksand y
 * JetBrains Mono son SIL OFL. Como mucho tres familias por pieza.
 */
export type PapelTipografico =
    | "display-editorial"
    | "titular-tecnico"
    | "cuerpo"
    | "organico"
    | "codigo";

export const HOJA_SATOSHI =
    "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap";
export const HOJA_QUICKSAND =
    "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap";

/** Pilas con respaldo: si la hoja aún no llegó, la lectura no se rompe. */
export const FUENTES_MARCA = {
    display: "'Satoshi', 'Rajdhani', 'Inter', system-ui, sans-serif",
    titular: "'Rajdhani', 'Inter', system-ui, sans-serif",
    organica: "'Quicksand', 'Inter', system-ui, sans-serif",
} as const;

/** Variables que consume el resto del OS; ninguna familia se cablea a mano. */
export const VARIABLES_MARCA = {
    "--ss-font-display": FUENTES_MARCA.display,
    "--ss-font-titular": FUENTES_MARCA.titular,
    "--ss-font-organica": FUENTES_MARCA.organica,
} as const;

/** Hojas necesarias para un papel y, si toca, para el tema Natural. */
export function hojasParaPapel(
    papel: PapelTipografico,
    tema?: string,
): string[] {
    const hojas: string[] = [];
    if (papel === "display-editorial") hojas.push(HOJA_SATOSHI);
    const normalizado = (tema ?? "").trim().toLowerCase();
    const esNatural =
        normalizado === "natural" || normalizado === "materia-viva";
    if (papel === "organico" || esNatural) hojas.push(HOJA_QUICKSAND);
    return hojas;
}

/** De lo solicitado, solo lo que aún no está en la página (sin repetir). */
export function enlacesPendientes(
    solicitadas: readonly string[],
    existentes: readonly string[],
): string[] {
    const vistas = new Set(existentes);
    const pendientes: string[] = [];
    for (const url of solicitadas) {
        if (vistas.has(url)) continue;
        vistas.add(url);
        pendientes.push(url);
    }
    return pendientes;
}

/** CSS de las variables con sus respaldos, listo para una etiqueta <style>. */
export function construirVariablesCss(
    variables: Readonly<Record<string, string>> = VARIABLES_MARCA,
): string {
    const cuerpo = Object.entries(variables)
        .map(([nombre, valor]) => `  ${nombre}: ${valor};`)
        .join("\n");
    return `:root {\n${cuerpo}\n}`;
}

export function FuentesMarca({
    papel = "cuerpo",
    tema,
    variables = VARIABLES_MARCA,
}: {
    papel?: PapelTipografico;
    tema?: string;
    variables?: Readonly<Record<string, string>>;
}): React.JSX.Element {
    useEffect(() => {
        const existentes = Array.from(
            document.querySelectorAll<HTMLLinkElement>("link[data-ss-fuente]"),
        ).map((enlace) => enlace.getAttribute("data-ss-fuente") ?? "");
        for (const url of enlacesPendientes(
            hojasParaPapel(papel, tema),
            existentes,
        )) {
            const enlace = document.createElement("link");
            enlace.rel = "stylesheet";
            enlace.href = url;
            enlace.setAttribute("data-ss-fuente", url);
            document.head.appendChild(enlace);
        }
    }, [papel, tema]);

    useEffect(() => {
        const css = construirVariablesCss(variables);
        const existente = document.getElementById("ss-fuentes-marca");
        if (existente) {
            if (existente.textContent !== css) existente.textContent = css;
            return;
        }
        const estilo = document.createElement("style");
        estilo.id = "ss-fuentes-marca";
        estilo.textContent = css;
        document.head.appendChild(estilo);
    }, [variables]);

    return <></>;
}
