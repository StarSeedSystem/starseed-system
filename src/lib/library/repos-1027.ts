// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda de repos del 2026-10-27 (Ola 1027 · MBT/INS/CLB)
// ------------------------------------------------------------------------------
// Alex (2026-10-27) pidió integrar tres repos: milind-soni/OpenMausBot (agentes con
// cara de cursor que usan tu ordenador, origen del Mausbot de Astraura),
// krishhgg/Insomnia (sesiones con la Mac despierta a tapa cerrada) y
// JustVugg/colibri (modelos MoE enormes leyendo expertos del disco). Este módulo
// convierte `config/repos-libreria-1027.json` en fichas de la Biblioteca con el
// mismo contrato que las tandas 1025/1026:
//
//   · Instalar una ficha SOLO registra su enlace (`payload.externalUrl` sin `route`
//     ni `skillId`): cero descarga, cero ejecución, cero clave. Lo que pide
//     permisos, disco o cuenta queda como activación manual en `payload.aviso`.
//   · El `kind` del paquete es el de la ficha («tool» o «ai-source»), no «project».
//   · `lib-openmausbot` es la ficha de Biblioteca de la ola MBT1027: el Mausbot
//     DENTRO del OS vive en `CONTRATO_1027`, y la app de Electron aquí no se instala.
//
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación
// estática; NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage, PackageKind } from "./packages";
import datos from "../../../config/repos-libreria-1027.json";
import { autorDe, resumenRequisitos, versionCorta } from "./repos-1025";
import type { FichaTanda1026 } from "./repos-1026";

/** Una ficha tal y como queda en `config/repos-libreria-1027.json`: la de la tanda 1026 con lo que esta declara. */
export type FichaTanda1027 = FichaTanda1026;

interface Tanda1027 {
    fecha: string;
    paquetes: FichaTanda1027[];
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
}

const TANDA = datos as unknown as Tanda1027;

/** Contrato final de la tanda (se lee entero antes de tocar cualquiera de estas fichas). */
export const CONTRATO_1027 = "architecture/mausbot-astraura.md";

/** Las 3 fichas del JSON, tal cual (sin fusionadas ni duplicadas: esta tanda no hay). */
export const TANDA_1027_FICHAS: readonly FichaTanda1027[] = TANDA.paquetes;

/** Lo que Alex debe decidir (sudoers de Insomnia, Colibri en el A1, la app de OpenMausBot aparte). */
export const DECISIONES_1027: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y qué se leyó para comprobarla (nada se ejecutó ni se descargó). */
export const LICENCIAS_VERIFICADAS_1027: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

/** Lo que la tienda enseña de una ficha: qué es y, pegado, lo que hay que saber antes de fiarse. */
function descripcionDe(f: FichaTanda1027): string {
    return `${f.que_es} En StarSeed OS: ${f.nota}`;
}

function nombreDe(f: FichaTanda1027): string {
    return `${f.nombre} · ${f.titulo}`;
}

function payloadDe(f: FichaTanda1027): Record<string, unknown> {
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
        contrato: CONTRATO_1027,
        corre_aqui: f.corre_aqui,
    };
}

function paqueteDe(f: FichaTanda1027): LibraryPackage {
    return {
        id: f.id,
        // El kind de la ficha («tool» o «ai-source»), no «project». «tool» no está en
        // PackageKind ni en KIND_META del cliente: la tienda la calza con un meta
        // genérico (metaDeKind en package-store.tsx) y el efecto real es igual al de
        // cualquier ficha con externalUrl y sin route: guardar el enlace.
        kind: f.kind as PackageKind,
        name: nombreDe(f),
        description: descripcionDe(f),
        icon: f.icono,
        tags: [...f.area, f.grupo, "ola-1027"],
        version: versionCorta(f.canal, f.version_actual),
        author: autorDe(f.repo),
        sourceRepoId: "starseed-labs",
        free: f.gratis,
        payload: payloadDe(f),
    };
}

/** Las fichas del catálogo: las 3 del JSON, cada una con el kind de su ficha. */
export const FICHAS_REPOS_1027: LibraryPackage[] = TANDA.paquetes.map(paqueteDe);

/** Ids que la siembra instala por defecto: todas las fichas (`preinstalar: "siempre"`). Instalar = registrar el enlace. */
export const IDS_SIEMBRA_1027: string[] = TANDA.paquetes
    .filter((f) => f.preinstalar === "siempre")
    .map((f) => f.id);
