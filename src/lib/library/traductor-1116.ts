// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Traductor Universal (TRA1116-APP-F1)
// ------------------------------------------------------------------------------
// Ficha de la app Traductor con ruta real /traductor. Instalar = abrir su ruta.
// ═══════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";

/** Paquete instalable: app-traductor (kind app con payload.route). */
export const PAQUETE_TRADUCTOR: LibraryPackage = {
    id: "app-traductor",
    kind: "app",
    name: "Traductor",
    description: "Traduce texto, mantén conversaciones y descarga paquetes de idioma para usar sin internet.",
    icon: "Languages",
    tags: ["app", "traducción", "idiomas"],
    version: "1.0.0",
    author: "StarSeed Core",
    sourceRepoId: "starseed-core",
    free: true,
    featured: true,
    payload: {
        route: "/traductor",
        herramienta: "traductor-universal",
        sinInternet: "con descarga de idiomas",
    },
};

/** Ids que la siembra instala por defecto. */
export const IDS_SIEMBRA_TRADUCTOR: string[] = ["app-traductor"];