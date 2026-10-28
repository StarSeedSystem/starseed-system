// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda del 2026-10-28 (Ola 1028 · LEANN, recuerdo semántico)
// ------------------------------------------------------------------------------
// Alex (2026-10-28) pidió LEANN (StarTrail-org/LEANN, MIT) «para todo lo de Astraura
// multicapas con los demás sistemas; todos deben ser fusionados». Este módulo convierte
// `config/repos-libreria-1028.json` en fichas con el mismo contrato que las tandas
// 1025–1027b: instalar SOLO registra su enlace (`payload.externalUrl` sin `route` ni
// `skillId`); nada se descarga, se ejecuta ni pide una clave. LEANN corre SOLO en el A1
// (127.0.0.1:4495 con token) y no en la Mac: se dice en `aviso` y en `corre_aqui`.
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación estática;
// NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1028.json";
import type { FichaTanda1026 } from "./repos-1026";
import { autorDe, resumenRequisitos, versionCorta } from "./repos-1025";

/** Una ficha tal y como la deja `config/repos-libreria-1028.json`: la de la tanda 1026, sin cambios de forma. */
export type FichaTanda1028 = FichaTanda1026;

interface Tanda1028 {
    paquetes: FichaTanda1028[];
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
}

const TANDA = datos as unknown as Tanda1028;

/** Contrato de la tanda: LEANN es la búsqueda por significado de la capa memoria, fundida con Memvid. */
export const CONTRATO_1028 = "architecture/leann-recuerdo-semantico.md";

/** El grupo `memorias` es el que trae LEANN esta tanda: apunta a su contrato. */
export const CONTRATOS_1028: Readonly<Record<string, string>> = {
    memorias: CONTRATO_1028,
};

/** La ficha del JSON, tal cual. */
export const TANDA_1028_FICHAS: readonly FichaTanda1028[] = TANDA.paquetes;

/** Lo que Alex debe decidir (y el JSON explica: hoy no hay ninguna pendiente). */
export const DECISIONES_1028: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y versión, y qué se leyó para comprobarla el 2026-10-28. */
export const LICENCIAS_VERIFICADAS_1028: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

/** `Search` no está en el mapa de la tienda: cae al icono de `ai-source`. */
const ICONOS_QUE_FALTAN: Readonly<Record<string, string>> = {
    Search: "BrainCircuit",
};

/** El icono que la tienda puede pintar: el del JSON o, si no existe, el de `ai-source`. */
export function iconoDeLaBiblioteca1028(icono: string): string {
    return ICONOS_QUE_FALTAN[icono] ?? icono;
}

/** El contrato que le toca a una ficha según su grupo. */
export function contratoDe1028(f: FichaTanda1028): string {
    return CONTRATOS_1028[f.grupo] ?? CONTRATO_1028;
}

function payloadDe(f: FichaTanda1028): Record<string, unknown> {
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
        contrato: contratoDe1028(f),
        corre_aqui: f.corre_aqui,
    };
}

function paqueteDe(f: FichaTanda1028): LibraryPackage {
    return {
        id: f.id,
        // El tipo lo declara la ficha: LEANN es `ai-source` (motor de IA).
        kind: f.kind as LibraryPackage["kind"],
        name: `${f.nombre} · ${f.titulo}`,
        description: `${f.que_es} En StarSeed OS: ${f.nota}`,
        icon: iconoDeLaBiblioteca1028(f.icono),
        tags: [...f.area, f.grupo, "ola-1028"],
        version: versionCorta(f.canal, f.version_actual),
        author: autorDe(f.repo),
        sourceRepoId: "starseed-labs",
        free: f.gratis,
        payload: payloadDe(f),
    };
}

/**
 * Las fichas nuevas del catálogo. Sin `comingSoon`: instalar registra el enlace y la siembra las incluye.
 * Que no corran aquí se dice en `payload.corre_aqui` (siempre `false`), en la descripción y en `payload.aviso`.
 */
export const FICHAS_REPOS_1028: LibraryPackage[] = TANDA.paquetes.map(paqueteDe);

/** Ids que la siembra instala por defecto (`preinstalar: "siempre"`): instalar solo registra el enlace. */
export const IDS_SIEMBRA_1028: string[] = TANDA.paquetes
    .filter((f) => f.preinstalar === "siempre")
    .map((f) => f.id);
