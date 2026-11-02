// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda del 2026-11-02 (Ola 1101 · keepalive: neurona despierta)
// ------------------------------------------------------------------------------
// Alex (2026-11-01) pidió «que funcionen los procesos en segundo plano de los
// dispositivos aun con las pantallas cerradas o desconectadas», con stigoleg/keep-alive
// (keepalive v2, Go, MIT). Este módulo convierte `config/repos-libreria-1101.json` en
// ficha con el mismo contrato que las tandas 1025–1028: instalar SOLO registra su
// enlace (`payload.externalUrl` sin `route` ni `skillId`); nada se descarga, se
// ejecuta ni pide una clave. keepalive usa las aserciones de energía del PROPIO
// sistema (IOKit en macOS, peticiones de energía en Windows, inhibidor de
// systemd-logind en Linux) y en la Mac de Alex ya está instalado (v2.0.1).
//
// Módulo PURO y SIN "use client": lo importarían `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación estática;
// NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1101.json";
import type { FichaTanda1026 } from "./repos-1026";
import { autorDe, resumenRequisitos, tipoDeFicha, versionCorta } from "./repos-1025";

/** Una ficha tal y como la deja `config/repos-libreria-1101.json`: la de la tanda 1026, sin cambios de forma. */
export type FichaTanda1101 = FichaTanda1026;

interface Tanda1101 {
    paquetes: FichaTanda1101[];
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
}

const TANDA = datos as unknown as Tanda1101;

/** Contrato de la tanda: §11 de la colmena (tapa cerrada, relevo al A1 y permiso del dueño). */
export const CONTRATO_1101 = "architecture/colmena-relevo-contenedores.md";

/** El grupo `neuronas` es el que trae keepalive esta tanda: apunta al contrato de la colmena. */
export const CONTRATOS_1101: Readonly<Record<string, string>> = {
    neuronas: CONTRATO_1101,
};

/** La ficha del JSON, tal cual. */
export const TANDA_1101_FICHAS: readonly FichaTanda1101[] = TANDA.paquetes;

/** Lo que Alex debe decidir (el cambio de caffeinate a keepalive y la verdad de la tapa cerrada). */
export const DECISIONES_1101: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y versión, y qué se leyó para comprobarla el 2026-11-02. */
export const LICENCIAS_VERIFICADAS_1101: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

/** El contrato que le toca a una ficha según su grupo. */
export function contratoDe1101(f: FichaTanda1101): string {
    return CONTRATOS_1101[f.grupo] ?? CONTRATO_1101;
}

function payloadDe(f: FichaTanda1101): Record<string, unknown> {
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
        contrato: contratoDe1101(f),
        corre_aqui: f.corre_aqui,
    };
}

function paqueteDe(f: FichaTanda1101): LibraryPackage {
    return {
        id: f.id,
        // El tipo lo declara la ficha: keepalive es `app` (un kind fuera de VALID_KINDS
        // tumbó la Biblioteca el 31-10; `tipoDeFicha` mapea lo desconocido a `app`).
        kind: tipoDeFicha(f.kind),
        name: `${f.nombre} · ${f.titulo}`,
        description: `${f.que_es} En StarSeed OS: ${f.nota}`,
        icon: f.icono,
        tags: [...f.area, f.grupo, "ola-1101"],
        version: versionCorta(f.canal, f.version_actual),
        author: autorDe(f.repo),
        sourceRepoId: "starseed-labs",
        free: f.gratis,
        payload: payloadDe(f),
    };
}

/**
 * Las fichas del catálogo. Sin `comingSoon`: instalar registra el enlace y la siembra las incluye.
 * Que ya esté instalado en la Mac se dice en `payload.corre_aqui` (`true`), en la descripción y en `payload.aviso`.
 */
export const FICHAS_REPOS_1101: LibraryPackage[] = TANDA.paquetes.map(paqueteDe);

/** Ids que la siembra instala por defecto (`preinstalar: "siempre"`): instalar solo registra el enlace. */
export const IDS_SIEMBRA_1101: string[] = TANDA.paquetes
    .filter((f) => f.preinstalar === "siempre")
    .map((f) => f.id);
