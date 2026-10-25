// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda de repos del 2026-10-25 (Ola 1025R · REP1025A)
// ------------------------------------------------------------------------------
// Regla de Alex (2026-10-25): «absolutamente todas las repos y habilidades deben ser
// integradas en la librería preinstaladas y autoactualizadas». Este módulo convierte
// `config/repos-libreria-1025.json` (la fuente de datos de la tanda) en fichas de la
// Biblioteca con comprobación de versión y siembra por defecto.
//
// Instalar una ficha SOLO registra su enlace: `payload.externalUrl` sin `route` ni
// `skillId` cae en la rama «enlace externo» de `install()` (guardar el enlace + marcar
// instalada). Cero descarga, cero ejecución, cero clave. Lo que ejecuta código o pide
// servidor queda como activación manual, explicada en `payload.aviso`.
//
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta
// `/api/library/actualizaciones` (servidor). El JSON entra por importación estática,
// igual que `config/capas-astraura.json`; NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";
import datos from "../../../config/repos-libreria-1025.json";

/** Una ficha tal y como la dejan los grupos en `config/repos-libreria-1025.json`. */
export interface FichaTanda1025 {
    id: string;
    repo: string;
    nombre: string;
    titulo: string;
    icono: string;
    grupo: string;
    kind: string;
    canal: "releases" | "tags" | "commits";
    patron_tag?: string;
    licencia: string;
    version_actual: string;
    fecha_version: string | null;
    estado: "activo" | "alfa" | "archivado";
    area: string[];
    efecto: string;
    preinstalar: "siempre" | "manual";
    claude: string | boolean;
    que_es: string;
    nota: string;
    aviso: string;
    requisitos?: {
        ram_gb?: number | null;
        vram_gb?: number | null;
        gpu?: string;
        docker?: string;
        arquitecturas?: string[];
        so?: string[];
        fuente?: string;
    };
    /** Id de una ficha que YA existía en `packages.ts`: se actualiza esa, no se crea otra. */
    fusionar_en?: string;
    /** Id con el que la herramienta ya vive en el catálogo de la Protomolécula (`proto-*`). */
    id_en_catalogo?: string;
}

interface Tanda1025 {
    fecha: string;
    duplicadas: Record<string, string>;
    fusionadas: Record<string, string>;
    ya_integradas: Record<string, string>;
    paquetes: FichaTanda1025[];
}

const TANDA = datos as unknown as Tanda1025;

/** Contrato final de la tanda (se lee antes de tocar cualquiera de estas fichas). */
export const CONTRATO_1025 = "architecture/repos-libreria-1025.md";

/** Las 33 fichas del JSON, tal cual (incluidas las fusionadas y las que ya viven en la Protomolécula). */
export const TANDA_1025_FICHAS: readonly FichaTanda1025[] = TANDA.paquetes;

/** `lib-…` nuevo → id de la ficha vieja de `packages.ts` que se actualiza en su lugar. */
export const FUSIONADAS_1025: Readonly<Record<string, string>> = TANDA.fusionadas;

/** `lib-…` → id `proto-*` de la Protomolécula (ya en la Biblioteca y con su comprobación de versión). */
export const YA_EN_PROTOMOLECULA_1025: Readonly<Record<string, string>> = TANDA.ya_integradas;

const RE_SHA_EN_TEXTO = /(?:@|HEAD |commit )([0-9a-f]{7,40})\b/i;
const RE_SHA_SOLO = /^[0-9a-f]{7,40}$/i;

/**
 * Lo que va en `version` de la ficha. En el canal `commits` es el SHA corto (7 caracteres): así
 * `compararVersiones` de la ruta de actualizaciones puede decir «igual» o «hay actualización».
 * En releases y etiquetas es la etiqueta limpia («v0.9.5», no «v0.9.5 (main avanza…)»).
 */
export function versionCorta(canal: string, texto: string): string {
    const limpio = (texto ?? "").trim();
    if (canal === "commits") {
        const enTexto = RE_SHA_EN_TEXTO.exec(limpio);
        if (enTexto) return enTexto[1].slice(0, 7).toLowerCase();
        if (RE_SHA_SOLO.test(limpio)) return limpio.slice(0, 7).toLowerCase();
    }
    return limpio.split(/\s+/)[0] ?? limpio;
}

function resumenRequisitos(r: FichaTanda1025["requisitos"]): string {
    if (!r) return "";
    const partes: string[] = [];
    if (typeof r.ram_gb === "number") partes.push(`RAM ${r.ram_gb} GB`);
    if (typeof r.vram_gb === "number") partes.push(`VRAM ${r.vram_gb} GB`);
    if (r.gpu) partes.push(`GPU: ${r.gpu}`);
    if (r.docker) partes.push(`Docker: ${r.docker}`);
    if (r.arquitecturas?.length) partes.push(`arquitecturas: ${r.arquitecturas.join(", ")}`);
    if (r.so?.length) partes.push(`sistemas: ${r.so.join(", ")}`);
    if (r.fuente) partes.push(`fuente: ${r.fuente}`);
    return partes.join(" · ");
}

function autorDe(repo: string): string {
    return repo.split("/")[0] ?? repo;
}

function payloadDe(f: FichaTanda1025): Record<string, unknown> {
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
        requisitos: resumenRequisitos(f.requisitos),
        note: f.nota,
        aviso: f.aviso,
        contrato: CONTRATO_1025,
        corre_aqui: false,
    };
}

/** ¿Esta ficha se crea como paquete nuevo del catálogo? (no las fusionadas ni las de la Protomolécula) */
export function esFichaNueva1025(f: FichaTanda1025): boolean {
    return f.fusionar_en === undefined && f.id_en_catalogo === undefined;
}

function paqueteDe(f: FichaTanda1025): LibraryPackage {
    return {
        id: f.id,
        kind: "project",
        name: `${f.nombre} · ${f.titulo}`,
        description: `${f.que_es} En StarSeed OS: ${f.nota}`,
        icon: f.icono,
        tags: [...f.area, f.grupo, "ola-1025r"],
        version: versionCorta(f.canal, f.version_actual),
        author: autorDe(f.repo),
        sourceRepoId: "starseed-labs",
        free: true,
        payload: payloadDe(f),
    };
}

/**
 * Las fichas nuevas del catálogo: 26 (las 33 del JSON menos 3 fusionadas con fichas viejas y 4 que ya viven en la
 * Protomolécula). Sin `comingSoon`: instalar registra el enlace y la siembra las incluye. La activación real (servidor,
 * código, cuenta) es manual y está a la vista en `payload.aviso`.
 */
export const FICHAS_REPOS_1025: LibraryPackage[] = TANDA.paquetes.filter(esFichaNueva1025).map(paqueteDe);

/** Datos de seguimiento que reciben las fichas VIEJAS (`iatool-*`) en lugar de duplicarse. */
export interface SeguimientoFichaVieja {
    version: string;
    payload: Record<string, unknown>;
}

/** Id de la ficha vieja → versión real y payload de seguimiento (upstream, canal, patrón de etiqueta, licencia). */
export const SEGUIMIENTO_FICHAS_VIEJAS_1025: Readonly<Record<string, SeguimientoFichaVieja>> = Object.fromEntries(
    TANDA.paquetes
        .filter((f): f is FichaTanda1025 & { fusionar_en: string } => f.fusionar_en !== undefined)
        .map((f) => {
            const { upstream, canal, patronTag, licencia, estado, versionPublicada, fechaVersion, aviso, contrato } = payloadDe(f);
            return [
                f.fusionar_en,
                {
                    version: versionCorta(f.canal, f.version_actual),
                    payload: { upstream, canal, ...(patronTag ? { patronTag } : {}), licencia, estado, versionPublicada, fechaVersion, aviso, contrato },
                },
            ];
        }),
);

/** Aplica el seguimiento 1025 a una ficha vieja (misma ficha, versión real y upstream). Sin entrada, la devuelve igual. */
export function conSeguimiento1025(pkg: LibraryPackage): LibraryPackage {
    const s = SEGUIMIENTO_FICHAS_VIEJAS_1025[pkg.id];
    if (!s) return pkg;
    return { ...pkg, version: s.version, payload: { ...pkg.payload, ...s.payload } };
}

/**
 * Fichas mínimas de las viejas con seguimiento, para la ruta de actualizaciones (que no puede importar `packages.ts`,
 * un módulo de cliente). Mismo id, versión y payload que `conSeguimiento1025` deja en el catálogo.
 */
export const FICHAS_VIEJAS_SEGUIMIENTO_1025: LibraryPackage[] = Object.entries(SEGUIMIENTO_FICHAS_VIEJAS_1025).map(
    ([id, s]) => ({
        id,
        kind: id === "iatool-crewai" ? "repo" : "function",
        name: id,
        description: "",
        icon: "Package",
        tags: [],
        version: s.version,
        author: "",
        sourceRepoId: "starseed-ia-tools",
        free: true,
        payload: s.payload,
    }),
);

/**
 * Ids que la siembra (`defaults-seed.ts`, SEED_VERSION 17) instala por defecto: todas las nuevas con
 * `preinstalar: "siempre"` más las viejas fusionadas que aún no estaban en la lista. Instalar = registrar el enlace.
 */
export const IDS_SIEMBRA_1025: string[] = [
    ...TANDA.paquetes.filter((f) => esFichaNueva1025(f) && f.preinstalar === "siempre").map((f) => f.id),
    ...TANDA.paquetes.filter((f) => f.fusionar_en !== undefined && f.preinstalar === "siempre").map((f) => f.fusionar_en as string),
];
