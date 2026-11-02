// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda del 2026-11-01 (Ola 1101 · KAL1101F: keepalive)
// ------------------------------------------------------------------------------
// Alex (2026-11-01) pidió una ficha de keepalive (stigoleg/keep-alive, MIT)
// para que las neuronas sigan despiertas con la pantalla cerrada o desconectada
// mientras StarSeed OS esté abierto. Este módulo convierte
// `config/repos-libreria-1101.json` en fichas con el mismo contrato que las
// tandas 1025–1028: instalar SOLO registra el enlace (`payload.externalUrl` sin
// `route` ni `skillId`); nada se descarga, se ejecuta ni pide una clave. Lo que
// toca energía del sistema queda como activación manual, explicada en `aviso`.
// En un Mac portátil, cerrar la tapa duerme el sistema aunque haya aserciones:
// keepalive no lo vence salvo clamshell o `pmset -a disablesleep 1` (requiere
// admin). Si la neurona va a dormir igual, sus tareas pasan al A1 (colmena).
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación
// estática; NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1101.json";
import type { FichaTanda1026 } from "./repos-1026";
import { autorDe, resumenRequisitos, tipoDeFicha, versionCorta } from "./repos-1025";

/** Una ficha tal y como la deja `config/repos-libreria-1101.json`: la de la tanda 1026, sin cambios de forma. */
export type FichaTanda1101 = FichaTanda1026 & {
    instalacion?: Record<string, string>;
};

interface Tanda1101 {
    ola: string;
    fecha: string;
    principio: string;
    fusionadas: Record<string, string>;
    duplicadas: Record<string, string>;
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
    paquetes: FichaTanda1101[];
}

const TANDA = datos as unknown as Tanda1101;

/** Contrato final de la tanda. */
export const CONTRATO_1101 = "memory/orquestacion-economica.md";

/** Las fichas del JSON, tal cual. */
export const TANDA_1101_FICHAS: readonly FichaTanda1101[] = TANDA.paquetes;

/** Lo que Alex debe decidir. */
export const DECISIONES_1101: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y versión, y qué se leyó para comprobarla. */
export const LICENCIAS_VERIFICADAS_1101: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

/** El icono que la tienda puede pintar. */
export function iconoDeLaBiblioteca1101(icono: string): string {
    return icono;
}

/** El contrato que le toca a una ficha según su grupo. */
export function contratoDe1101(f: FichaTanda1101): string {
    return CONTRATO_1101;
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
        instalacion: f.instalacion,
    };
}

function paqueteDe(f: FichaTanda1101): LibraryPackage {
    return {
        id: f.id,
        // kind puede ser app según la ficha; el mapa de la tienda lo valida
        kind: tipoDeFicha(f.kind),
        name: `${f.nombre} · ${f.titulo}`,
        description: `${f.que_es} En StarSeed OS: ${f.nota}`,
        icon: iconoDeLaBiblioteca1101(f.icono),
        tags: [...f.area, f.grupo, "ola-1101"],
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
export const FICHAS_REPOS_1101: LibraryPackage[] = TANDA.paquetes.map(paqueteDe);

/** Ids que la siembra instala por defecto (`preinstalar: "siempre"`): instalar solo registra el enlace. */
export const IDS_SIEMBRA_1101: string[] = TANDA.paquetes
    .filter((f) => f.preinstalar === "siempre")
    .map((f) => f.id);
