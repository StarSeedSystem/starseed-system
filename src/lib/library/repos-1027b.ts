// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda de repos del 2026-10-27 (Ola 1027b · MTN1027 y MVD1027)
// ------------------------------------------------------------------------------
// Alex (2026-10-27) pidió dos repos: minnesotanlp/meta-n (automejora recursiva de las
// capas de conciencia mesh automejorables de Astraura) y memvid/memvid (cápsulas
// de memoria en un solo archivo que se puede rebobinar). Este módulo convierte
// `config/repos-libreria-1027b.json` en fichas de la Biblioteca con el mismo
// contrato que las tandas 1025, 1026 y 1027: instalarlas SOLO registra su enlace
// (`payload.externalUrl` sin `route` ni `skillId`); nada se descarga, se ejecuta
// ni pide una clave. Lo que exige permisos del sistema queda como activación
// manual, explicada en `aviso`.
// 
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación estática;
// NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1027b.json";
import type { FichaTanda1027 } from "./repos-1027";
import { autorDe, resumenRequisitos, versionCorta } from "./repos-1025";

/** Una ficha tal y como la deja `config/repos-libreria-1027b.json`: la de la tanda 1027, sin cambios de forma. */
export type FichaTanda1027B = FichaTanda1027;

interface Tanda1027B {
    fecha: string;
    fusionadas: Record<string, string>;
    duplicadas: Record<string, string>;
    paquetes: FichaTanda1027B[];
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
}

const TANDA = datos as unknown as Tanda1027B;

/** Contrato final de la tanda (se lee antes de tocar cualquiera de estas fichas). */
export const CONTRATO_1027B = "architecture/automejora-meta-n.md";

/** Las 2 fichas del JSON, tal cual. */
export const TANDA_1027B_FICHAS: readonly FichaTanda1027B[] = TANDA.paquetes;

/** Lo que Alex debe decidir (franja nocturna en el A1 y binario Memvid sin Rust en la Mac). */
export const DECISIONES_1027B: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y versión, y qué se leyó para comprobarla el 2026-10-27. */
export const LICENCIAS_VERIFICADAS_1027B: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

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
        contrato: CONTRATO_1027B,
        corre_aqui: f.corre_aqui,
    };
}

/** Lo que la tienda enseña de una ficha: qué es y, pegado, lo que hay que saber antes de fiarse. */
function descripcionDe(f: FichaTanda1027B): string {
    return `${f.que_es} En StarSeed OS: ${f.nota}`;
}

function nombreDe(f: FichaTanda1027B): string {
    return `${f.nombre} · ${f.titulo}`;
}

function paqueteDe(f: FichaTanda1027B): LibraryPackage {
    return {
        id: f.id,
        kind: f.kind as LibraryPackage["kind"],
        name: nombreDe(f),
        description: descripcionDe(f),
        icon: f.icono,
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

/**
 * Ids que la siembra (`defaults-seed.ts`) instala por defecto: todas las fichas con `preinstalar: "siempre"`.
 * Instalar = registrar el enlace; la activación real la hace la persona y está explicada en `aviso`.
 */
export const IDS_SIEMBRA_1027B: string[] = TANDA.paquetes
    .filter((f) => f.preinstalar === "siempre")
    .map((f) => f.id);