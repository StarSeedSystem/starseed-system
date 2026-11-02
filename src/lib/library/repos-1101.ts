// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda del 2026-11-01 (Ola 1101 · KAL1101F: keepalive)
// ------------------------------------------------------------------------------
// Alex (2026-11-01): «que funcionen los procesos en segundo plano aun con las
// pantallas cerradas» — trajo keepalive v2 (Go, MIT, stigoleg/keep-alive).
// Mismo contrato que las tandas 1025–1028: instalar SOLO registra el enlace
// (cero descarga, cero ejecución, cero clave). keepalive corre POR DISPOSITIVO:
// la ficha declara los comandos de instalación de cada sistema (`instalacion`)
// y los flags, no los ejecuta. Módulo PURO y SIN "use client": lo importan
// `packages.ts` y `/api/library/actualizaciones`. NADA de `node:fs` (trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1101.json";
import type { FichaTanda1026 } from "./repos-1026";
import { autorDe, resumenRequisitos, tipoDeFicha, versionCorta } from "./repos-1025";

/** La ficha de la 1026 más lo que la tanda 1101 declara: instalación por SO y flags. */
export interface FichaTanda1101 extends FichaTanda1026 {
    /** Comando de instalación por sistema: `macos`, `windows`, `linux` y `go` (cualquier sistema). */
    instalacion: Record<string, string>;
    /** Los flags/órdenes que el binario entiende, tal y como los declara su README. */
    flags?: string[];
}

interface Tanda1101 {
    fecha: string;
    fusionadas: Record<string, string>;
    duplicadas: Record<string, string>;
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
    paquetes: FichaTanda1101[];
}

const TANDA = datos as unknown as Tanda1101;

/** La única ficha de la tanda, tal cual sale del JSON. */
export const TANDA_1101_FICHAS: readonly FichaTanda1101[] = TANDA.paquetes;

/** Lo que Alex debe decidir (y el JSON explica). */
export const DECISIONES_1101: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y versión, y qué se comprobó el 2026-11-01. */
export const LICENCIAS_VERIFICADAS_1101: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

/** El contrato de la tanda es el propio JSON: su «principio» y sus «decisiones» son el acuerdo. */
export const CONTRATO_1101 = "config/repos-libreria-1101.json";

/** El comando de instalación de keepalive para un sistema (`macos`, `windows`, `linux`) o, fuera de ellos, el de `go`. */
export function comandoInstalacionDe(instalacion: Record<string, string>, so: string): string {
    const limpio = (so ?? "").trim().toLowerCase();
    let clave = limpio;
    if (["macos", "darwin", "mac", "osx", "unix"].includes(limpio)) clave = "macos";
    else if (["windows", "win32", "win"].includes(limpio)) clave = "windows";
    else if (["linux", "deb", "rpm", "apk"].includes(limpio)) clave = "linux";
    return instalacion[clave] ?? instalacion.go ?? "";
}

/** La verdad del portátil: ¿sigue el sistema despierto con la TAPA CERRADA? Solo clamshell (corriente + pantalla externa) o `pmset -a disablesleep 1`; una aserción no basta. */
export function despiertaConTapaCerrada(corriente: boolean, pantallaExterna: boolean, disablesleep: boolean): boolean {
    if (disablesleep) return true;
    return corriente && pantallaExterna;
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
        contrato: CONTRATO_1101,
        corre_aqui: f.corre_aqui,
        ...(f.flags ? { flags: f.flags } : {}),
        instalacion: f.instalacion,
    };
}

function paqueteDe(f: FichaTanda1101): LibraryPackage {
    return {
        id: f.id,
        // El tipo lo declara la ficha: keepalive es `app`. Un kind fuera de los conocidos
        // tumbó la Biblioteca el 31-10; `tipoDeFicha` lo devuelve tal cual o cae a `app`.
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
 * Las fichas nuevas del catálogo. Sin `comingSoon`: instalar registra el enlace y la siembra las incluye.
 * Lo que ejecuta código (instalar el binario en la máquina) queda como orden manual, en `payload.instalacion`.
 */
export const FICHAS_REPOS_1101: LibraryPackage[] = TANDA.paquetes.map(paqueteDe);

/** Ids que la siembra instala por defecto (`preinstalar: "siempre"`): instalar solo registra el enlace. */
export const IDS_SIEMBRA_1101: string[] = TANDA.paquetes
    .filter((f) => f.preinstalar === "siempre")
    .map((f) => f.id);
