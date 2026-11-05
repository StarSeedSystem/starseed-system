// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda del 2026-11-04 (Ola 1104 · cinco repos de Alex)
// ------------------------------------------------------------------------------
// Alex (2026-11-04) pidió añadir a la Librería e instalar «en el funcionamiento
// predeterminado natal» de StarSeed OS: google/elephant-goldfish-model (aprendizaje de
// agentes con las memorias de sus cerebros), thesysdev/openui (respuestas con
// interfaz viva), daveebbelaar/bama (apps nativas), Motionsites-AI/claude-skill
// (páginas en publicaciones) y HKUDS/DeepTutor (agentes y bots educativos).
//
// Este módulo convierte `config/repos-libreria-1104.json` en fichas con el mismo
// contrato que las tandas 1025–1101: instalar SOLO registra el enlace
// (`payload.externalUrl` sin `route` ni `skillId`); nada se descarga, se ejecuta ni
// pide una clave. Dónde trabaja cada una por defecto en el OS lo fija
// `architecture/repos-libreria-1104.md` y lo cablea la Ola 1104R.
//
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación estática;
// NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1104.json";
import type { FichaTanda1026 } from "./repos-1026";
import { autorDe, resumenRequisitos, tipoDeFicha, versionCorta } from "./repos-1025";

/** Una ficha tal y como la deja `config/repos-libreria-1104.json`: la de la tanda 1026, sin cambios de forma. */
export type FichaTanda1104 = FichaTanda1026;

interface Tanda1104 {
    paquetes: FichaTanda1104[];
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
}

const TANDA = datos as unknown as Tanda1104;

/** Contrato de la tanda: dónde trabaja cada repo por defecto en el OS y qué no se hace. */
export const CONTRATO_1104 = "architecture/repos-libreria-1104.md";

/** Los cinco grupos de la tanda apuntan al mismo contrato, cada uno a su sección. */
export const CONTRATOS_1104: Readonly<Record<string, string>> = {
    agentes: CONTRATO_1104,
    respuestas: CONTRATO_1104,
    "apps-nativas": CONTRATO_1104,
    diseno: CONTRATO_1104,
    educacion: CONTRATO_1104,
};

/** Las fichas del JSON, tal cual. */
export const TANDA_1104_FICHAS: readonly FichaTanda1104[] = TANDA.paquetes;

/** Lo que Alex debe saber o decidir (EGM no entrena, Xcode para BAMA, © de MotionSites…). */
export const DECISIONES_1104: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y versión, y qué se leyó para comprobarla el 2026-11-04. */
export const LICENCIAS_VERIFICADAS_1104: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

/** El contrato que le toca a una ficha según su grupo. */
export function contratoDe1104(f: FichaTanda1104): string {
    return CONTRATOS_1104[f.grupo] ?? CONTRATO_1104;
}

function payloadDe(f: FichaTanda1104): Record<string, unknown> {
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
        contrato: contratoDe1104(f),
        corre_aqui: f.corre_aqui,
    };
}

function paqueteDe(f: FichaTanda1104): LibraryPackage {
    return {
        id: f.id,
        // `tool` no es un tipo de la Biblioteca: `tipoDeFicha` lo pinta como `app`
        // (un kind fuera de VALID_KINDS tumbó la Biblioteca el 31-10).
        kind: tipoDeFicha(f.kind),
        name: `${f.nombre} · ${f.titulo}`,
        description: `${f.que_es} En StarSeed OS: ${f.nota}`,
        icon: f.icono,
        tags: [...f.area, f.grupo, "ola-1104"],
        version: versionCorta(f.canal, f.version_actual),
        author: autorDe(f.repo),
        sourceRepoId: "starseed-labs",
        free: f.gratis,
        payload: payloadDe(f),
    };
}

/**
 * Las fichas del catálogo. Sin `comingSoon`: instalar registra el enlace y la siembra las incluye.
 * Lo que corre ya aquí (OpenUI como dependencia, EGM y MotionSites como habilidades) se dice en
 * `payload.corre_aqui`; BAMA (Xcode) y DeepTutor (servidor) declaran `false` y su aviso explica por qué.
 */
export const FICHAS_REPOS_1104: LibraryPackage[] = TANDA.paquetes.map(paqueteDe);

/** Ids que la siembra instala por defecto (`preinstalar: "siempre"`): instalar solo registra el enlace. */
export const IDS_SIEMBRA_1104: string[] = TANDA.paquetes
    .filter((f) => f.preinstalar === "siempre")
    .map((f) => f.id);
