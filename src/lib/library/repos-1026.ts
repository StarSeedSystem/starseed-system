// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda de repos del 2026-10-26 (Ola 1025U · REP1026)
// ------------------------------------------------------------------------------
// Alex (2026-10-26) pidió integrar cuatro repos: Autom8AI/Open-Higgsfield-AI (contenido audiovisual),
// Tencent/WeKnora (conocimiento), opf/openproject (proyectos) y capsoftware/cap (grabación de pantalla).
// Este módulo convierte `config/repos-libreria-1026.json` en fichas de la Biblioteca con comprobación de
// versión y siembra por defecto, con el mismo contrato que la tanda de ayer (`repos-1025.ts`):
//
//   · Instalar una ficha SOLO registra su enlace (`payload.externalUrl` sin `route` ni `skillId`): cero
//     descarga, cero ejecución, cero clave. Lo que pide servidor, GPU o cuenta queda como activación
//     manual, explicada en `payload.aviso` y, para que la tienda la enseñe, en la descripción.
//   · Una ficha que YA existía (Open Generative AI, `iatool-open-generative-ai`) se actualiza en su sitio:
//     versión real, canal, licencia, requisitos y un texto corregido. No se crea un duplicado.
//
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación estática; NADA de `node:fs`
// (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1026.json";
import {
    autorDe,
    resumenRequisitos,
    versionCorta,
    type FichaTanda1025,
    type SeguimientoFichaVieja,
} from "./repos-1025";

/** Una ficha tal y como queda en `config/repos-libreria-1026.json`: la de la tanda 1025 más lo que esta tanda declara. */
export interface FichaTanda1026 extends FichaTanda1025 {
    /** ¿Se puede usar sin pagar nada? (el código puede ser libre y el servicio que necesita, no). */
    gratis: boolean;
    /** Por qué es gratis o por qué no, en una frase. */
    gratis_motivo: string;
    /** ¿Corre en esta máquina o en el OS tal como está hoy? Ninguna de la tanda: se declara igualmente. */
    corre_aqui: boolean;
    /** Cuánto se mueve el repo (commits, etiquetas, última fecha), medido el día de la ficha. */
    actividad: string;
    /** En una fusión: sustituir también el nombre y el texto de la ficha vieja (la antigua era inexacta). */
    actualiza_descripcion?: boolean;
}

interface Tanda1026 {
    fecha: string;
    fusionadas: Record<string, string>;
    duplicadas: Record<string, string>;
    paquetes: FichaTanda1026[];
    decisiones: string[];
    licencias_verificadas: Record<string, string>;
}

const TANDA = datos as unknown as Tanda1026;

/** Contrato final de la tanda (se lee antes de tocar cualquiera de estas fichas). */
export const CONTRATO_1026 = "architecture/repos-libreria-1026.md";

/** Las 5 fichas del JSON, tal cual (incluida la que se fusiona con una ficha vieja). */
export const TANDA_1026_FICHAS: readonly FichaTanda1026[] = TANDA.paquetes;

/** `lib-…` del JSON → id de la ficha vieja de `packages.ts` que se actualiza en su lugar. */
export const FUSIONADAS_1026: Readonly<Record<string, string>> = TANDA.fusionadas;

/** Qué repo pedido era qué y por qué no se creó una ficha más (Autom8AI, Anil-matcha, Cap…). */
export const DUPLICADAS_1026: Readonly<Record<string, string>> = TANDA.duplicadas;

/** Lo que Alex debe decidir (alojamiento, licencia comercial de Cap, motores locales…). */
export const DECISIONES_1026: readonly string[] = TANDA.decisiones;

/** De dónde sale cada licencia y versión, y qué se leyó para comprobarla. */
export const LICENCIAS_VERIFICADAS_1026: Readonly<Record<string, string>> = TANDA.licencias_verificadas;

function payloadDe(f: FichaTanda1026): Record<string, unknown> {
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
        contrato: CONTRATO_1026,
        corre_aqui: f.corre_aqui,
    };
}

/** Lo que la tienda enseña de una ficha: qué es y, pegado, lo que hay que saber antes de fiarse. */
function descripcionDe(f: FichaTanda1026): string {
    return `${f.que_es} En StarSeed OS: ${f.nota}`;
}

function nombreDe(f: FichaTanda1026): string {
    return `${f.nombre} · ${f.titulo}`;
}

/** ¿Esta ficha se crea como paquete nuevo del catálogo? (no la fusionada con una ficha vieja) */
export function esFichaNueva1026(f: FichaTanda1026): boolean {
    return f.fusionar_en === undefined;
}

function paqueteDe(f: FichaTanda1026): LibraryPackage {
    return {
        id: f.id,
        kind: "project",
        name: nombreDe(f),
        description: descripcionDe(f),
        icon: f.icono,
        tags: [...f.area, f.grupo, "ola-1025u"],
        version: versionCorta(f.canal, f.version_actual),
        author: autorDe(f.repo),
        sourceRepoId: "starseed-labs",
        free: f.gratis,
        payload: payloadDe(f),
    };
}

/**
 * Las fichas nuevas del catálogo: 4 (las 5 del JSON menos Open Generative AI, que se fusiona con su ficha vieja).
 * Sin `comingSoon`: instalar registra el enlace y la siembra las incluye. Que no corran aquí se dice en
 * `payload.corre_aqui` (siempre `false`), en la descripción y en `payload.aviso`.
 */
export const FICHAS_REPOS_1026: LibraryPackage[] = TANDA.paquetes.filter(esFichaNueva1026).map(paqueteDe);

/** Seguimiento de una ficha vieja: lo de la tanda 1025 más el texto corregido cuando la antigua era inexacta. */
export interface SeguimientoFichaVieja1026 extends SeguimientoFichaVieja {
    name?: string;
    description?: string;
    free?: boolean;
}

/** Id de la ficha vieja → versión real, payload de seguimiento y, si procede, nombre y texto nuevos. */
export const SEGUIMIENTO_FICHAS_VIEJAS_1026: Readonly<Record<string, SeguimientoFichaVieja1026>> = Object.fromEntries(
    TANDA.paquetes
        .filter((f): f is FichaTanda1026 & { fusionar_en: string } => f.fusionar_en !== undefined)
        .map((f) => {
            const p = payloadDe(f);
            const seguimiento: SeguimientoFichaVieja1026 = {
                version: versionCorta(f.canal, f.version_actual),
                payload: {
                    upstream: p.upstream,
                    canal: p.canal,
                    ...(p.patronTag ? { patronTag: p.patronTag } : {}),
                    licencia: p.licencia,
                    estado: p.estado,
                    versionPublicada: p.versionPublicada,
                    fechaVersion: p.fechaVersion,
                    actividad: p.actividad,
                    gratis: p.gratis,
                    gratisMotivo: p.gratisMotivo,
                    requisitos: p.requisitos,
                    aviso: p.aviso,
                    contrato: p.contrato,
                    corre_aqui: p.corre_aqui,
                    // El enlace conserva el id de la ficha, pero con el nombre canónico del repo.
                    externalUrl: p.externalUrl,
                    ...(f.actualiza_descripcion ? { note: p.note } : {}),
                },
                ...(f.actualiza_descripcion ? { name: nombreDe(f), description: descripcionDe(f), free: f.gratis } : {}),
            };
            return [f.fusionar_en, seguimiento];
        }),
);

/** Aplica el seguimiento 1026 a una ficha vieja (misma ficha, versión real y upstream). Sin entrada, la devuelve igual. */
export function conSeguimiento1026(pkg: LibraryPackage): LibraryPackage {
    const s = SEGUIMIENTO_FICHAS_VIEJAS_1026[pkg.id];
    if (!s) return pkg;
    return {
        ...pkg,
        version: s.version,
        ...(s.name !== undefined ? { name: s.name } : {}),
        ...(s.description !== undefined ? { description: s.description } : {}),
        ...(s.free !== undefined ? { free: s.free } : {}),
        payload: { ...pkg.payload, ...s.payload },
    };
}

/**
 * Fichas mínimas de las viejas con seguimiento, para la ruta de actualizaciones (que no puede importar `packages.ts`,
 * un módulo de cliente). Mismo id, versión y payload que `conSeguimiento1026` deja en el catálogo.
 */
export const FICHAS_VIEJAS_SEGUIMIENTO_1026: LibraryPackage[] = Object.entries(SEGUIMIENTO_FICHAS_VIEJAS_1026).map(
    ([id, s]) => ({
        id,
        kind: "repo",
        name: s.name ?? id,
        description: s.description ?? "",
        icon: "Package",
        tags: [],
        version: s.version,
        author: "",
        sourceRepoId: "starseed-ia-tools",
        free: s.free ?? true,
        payload: s.payload,
    }),
);

/**
 * Ids que la siembra (`defaults-seed.ts`, SEED_VERSION 18) instala por defecto: todas las nuevas con
 * `preinstalar: "siempre"` más la vieja fusionada si aún no estaba. Instalar = registrar el enlace.
 */
export const IDS_SIEMBRA_1026: string[] = [
    ...TANDA.paquetes.filter((f) => esFichaNueva1026(f) && f.preinstalar === "siempre").map((f) => f.id),
    ...TANDA.paquetes.filter((f) => f.fusionar_en !== undefined && f.preinstalar === "siempre").map((f) => f.fusionar_en as string),
];
