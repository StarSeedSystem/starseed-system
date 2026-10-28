// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda del 2026-10-27 (Ola 1027b · Meta^n y Memvid)
// ------------------------------------------------------------------------------
// Alex (2026-10-27) pidió Meta^n (automejora recursiva de las capas de conciencia)
// y Memvid (cápsulas de memoria en un solo archivo). Este módulo convierte
// `config/repos-libreria-1027b.json` en fichas con el mismo contrato que las
// tandas 1025, 1026 y 1027: instalar SOLO registra su enlace (`payload.externalUrl`
// sin `route` ni `skillId`); nada se descarga, se ejecuta ni pide una clave. Lo que
// exige Docker o permisos queda como activación manual, explicada en `aviso`.
// Meta^n propone en una caja Docker sin red ni claves y el juez de StarSeed decide
// fuera (automejora-meta-n.md §3); las cápsulas de Memvid se reparten por sujeto.
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación estática;
// NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1027b.json";
import type { FichaTanda1026 } from "./repos-1026";
import { autorDe, resumenRequisitos, versionCorta } from "./repos-1025";

/** Una ficha tal y como la deja `config/repos-libreria-1027b.json`: la de la tanda 1026, sin cambios de forma. */
export type FichaTanda1027B = FichaTanda1026;

interface Tanda1027B {
    paquetes: FichaTanda1027B[];
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
}

const TANDA = datos as unknown as Tanda1027B;

/** Contrato de la tanda: Meta^n propone en una caja y el juez de StarSeed decide fuera (§3). */
export const CONTRATO_1027B = "architecture/automejora-meta-n.md";

/** Cada grupo con su contrato: Meta^n la automejora de las capas, Memvid las cápsulas de memoria. */
export const CONTRATOS_1027B: Readonly<Record<string, string>> = {
    automejora: CONTRATO_1027B,
    memorias: "architecture/memvid-capsulas.md",
};

/** Las 2 fichas del JSON, tal cual. */
export const TANDA_1027B_FICHAS: readonly FichaTanda1027B[] = TANDA.paquetes;

/** Lo que Alex debe decidir (franja nocturna del A1 y binario de Memvid compilado). */
export const DECISIONES_1027B: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y versión, y qué se leyó para comprobarla el 2026-10-27. */
export const LICENCIAS_VERIFICADAS_1027B: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

/** `Repeat` (Meta^n) y `Film` (Memvid) no están en el mapa de la tienda: caen al icono de `ai-source`. */
const ICONOS_QUE_FALTAN: Readonly<Record<string, string>> = {
    Repeat: "BrainCircuit",
    Film: "BrainCircuit",
};

/** El icono que la tienda puede pintar: el del JSON o, si no existe, el de `ai-source`. */
export function iconoDeLaBiblioteca1027B(icono: string): string {
    return ICONOS_QUE_FALTAN[icono] ?? icono;
}

/** El contrato que le toca a una ficha según su grupo. */
export function contratoDe1027B(f: FichaTanda1027B): string {
    return CONTRATOS_1027B[f.grupo] ?? CONTRATO_1027B;
}

function payloadDe(f: FichaTanda1027B): Record<string, unknown> {
    const url = `https://github.com/${f.repo}`;
    return {
        upstream: url,
        externalUrl: url,
        canal: f.canal,
        ...(f.patron_tag ? { patronTag: f.patron_tag } : {}),
        licencia: f.licencia,
        estado: f.estado,
        efecto: f.efecto,
        preinstalar: f.preinstalar,
        claude: f.claude,
        grupo: f.grupo,
        versionPublicada: f.version_actual,
        fechaVersion: f.fecha_version,
        actividad: f.actividad,
        gratis: f.gratis,
        gratisMotivo: f.gratis_motivo,
        requisitos: resumenRequisitos(f.requisitos),
        note: f.nota,
        aviso: f.aviso,
        contrato: contratoDe1027B(f),
        corre_aqui: f.corre_aqui,
    };
}

function paqueteDe(f: FichaTanda1027B): LibraryPackage {
    return {
        id: f.id,
        // El tipo lo declara la ficha: las dos son `ai-source` (motores de IA).
        kind: f.kind as LibraryPackage["kind"],
        name: `${f.nombre} · ${f.titulo}`,
        // Lo que la tienda enseña: qué es y, pegado, lo que hay que saber antes de fiarse.
        description: `${f.que_es} En StarSeed OS: ${f.nota}`,
        icon: iconoDeLaBiblioteca1027B(f.icono),
        tags: [...f.area, f.grupo, "ola-1027b"],
        version: versionCorta(f.canal, f.version_actual),
        author: autorDe(f.repo),
        sourceRepoId: "starseed-labs",
        free: f.gratis,
        payload: payloadDe(f),
    };
}

/**
 * Las 2 fichas nuevas del catálogo. Sin `comingSoon`: instalar registra el enlace y la siembra las incluye.
 * Que no corran aquí se dice en `payload.corre_aqui` (siempre `false`), en la descripción y en `payload.aviso`.
 */
export const FICHAS_REPOS_1027B: LibraryPackage[] = TANDA.paquetes.map(paqueteDe);

/** Ids que la siembra instala por defecto (`preinstalar: "siempre"`): instalar solo registra el enlace. */
export const IDS_SIEMBRA_1027B: string[] = TANDA.paquetes
    .filter((f) => f.preinstalar === "siempre")
    .map((f) => f.id);
