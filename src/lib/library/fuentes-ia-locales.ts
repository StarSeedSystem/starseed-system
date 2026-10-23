// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Fuentes de IA locales que se descargan (2026-10-23)
// ------------------------------------------------------------------------------
// Fichas `ai-source` de modelos que viven en una neurona y que el panel «Recursos
// de IA» comprueba neurona por neurona antes de descargarlos (SOP
// `architecture/recursos-ia-neurona.md` §5). Van al repo «StarSeed Labs» de
// `packages.ts`.
//
// Módulo PURO y SIN "use client" a propósito: `packages.ts` es de cliente y una
// ruta de servidor que lo importara recibiría referencias de cliente, no los
// datos. `/api/library/actualizaciones` importa ESTE archivo para comprobar la
// versión de sus upstream (regla de Alex 2026-09-20: todo repo integrado entra
// en la Biblioteca con comprobación automática de versión).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";

/** Ruta del panel que decide dónde cabe cada modelo (lo que hace «instalar» con estas fichas). */
export const RUTA_RECURSOS_IA = "/agent?tab=recursos-ia";

export const FICHAS_IA_LOCALES: LibraryPackage[] = [
    {
        id: "ai-turbo-fieldfare",
        kind: "ai-source",
        name: "TurboFieldfare · Gemma 4 26B-A4B",
        description:
            "Runtime propio en Swift + Metal 4 que corre Gemma 4 26B-A4B (MoE, 4-bit) en un Mac Apple Silicon de 8 GB: " +
            "deja en memoria el núcleo y la caché (~2 GB) y lee del SSD solo los expertos de cada token. Medido por su " +
            "autor: 5,1–6,3 tok/s en un M2 Air de 8 GB y 31–35 tok/s en un M5 Pro. Servidor OpenAI-compatible experimental " +
            "solo en este equipo (127.0.0.1:8080). Instalar abre Recursos de IA, que comprueba en qué neurona cabe y te " +
            "pide confirmar tamaño y destino antes de descargar nada.",
        icon: "HardDrive",
        tags: ["ia", "local", "apple-silicon", "moe", "gemma", "ssd"],
        version: "1.0.0",
        author: "drumih",
        sourceRepoId: "starseed-labs",
        free: true,
        payload: {
            upstream: "https://github.com/drumih/turbo-fieldfare",
            // Sin releases publicadas: la versión se sigue por commits (canal por defecto).
            canal: "commits",
            licencia: "Apache-2.0 (código); los pesos de Gemma 4 conservan su licencia de origen",
            requisitos:
                "Mac con Apple Silicon (arm64), macOS 26 o superior, Metal 4, Xcode 26 / Swift 6.2; " +
                "~15 GB de descarga (~14,3 GB instalados) en el SSD interno o en uno externo rápido " +
                "(USB-C 10 Gb/s o Thunderbolt) de la misma neurona, nunca en la nube ni por red; " +
                "~2 GB de RAM para el modelo (equipo de 8 GB o más); solo texto; un proceso dueño del modelo a la vez",
            // El id del catálogo de Recursos de IA (`src/lib/recursos-ia/catalogo.ts`).
            modeloRecursosIa: "turbo-fieldfare-gemma4-26b-a4b",
            route: RUTA_RECURSOS_IA,
            corre_aqui: false,
        },
    },
];

const RE_GITHUB = /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+/;

/** Fichas cuyo `payload.upstream` es un repo de GitHub (entran en la comprobación de versión). */
export function fichasIaConUpstreamGitHub(paquetes: LibraryPackage[]): LibraryPackage[] {
    return paquetes.filter(
        // Modelos, repos y funciones integradas (Hono…): la regla es «todo repo integrado con
        // comprobación automática de versión», no solo los modelos. Las apps del OS no.
        (p) =>
            (p.kind === "ai-source" || p.kind === "repo" || p.kind === "function") &&
            typeof p.payload?.upstream === "string" &&
            RE_GITHUB.test(p.payload.upstream),
    );
}
