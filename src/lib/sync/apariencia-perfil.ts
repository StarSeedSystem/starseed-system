"use client";

/*
 * apariencia-perfil — Sincronía de la apariencia entre las neuronas del perfil
 * y la cuenta (Ola 304 · Astraura viste el perfil).
 * ═══════════════════════════════════════════════════════════════════════════
 * Cada neurona (dispositivo) puede tener una apariencia distinta sin pisarse:
 * la config se PARTE en tres cestas seg├║n la ruta de AppearanceConfig:
 *
 *   · perfil   → la identidad visual viaja con el perfil a todas sus neuronas.
 *   · neurona  → rendimiento y comodidad f├¡sica: cada aparato la suya (queda).
 *   · cuenta   → lo del due├▒o (p. ej. fuentes personalizadas instaladas).
 *
 * M├│dulo PURO (sin I/O, sin cliente): solo importa TIPOS de
 * appearance-context → se puede probar en vitest sin Supabase.
 */

export type AlcanceApariencia = "cuenta" | "perfil" | "neurona";

export const ALCANCE_DEFECTO: AlcanceApariencia = "perfil";

export const POLITICA_APARIENCIA: Record<string, AlcanceApariencia> = {
    // ── Identidad visual → perfil (viaja con el perfil a todas sus neuronas) ──
    "styling.radius": "perfil", // redondeo de cristal: identidad, no rendimiento del aparato
    "styling.glassIntensity": "perfil",
    "styling.opacity": "perfil",
    "styling.borderWidth": "perfil",
    "styling.refraction": "perfil",
    "styling.chromaticAberration": "perfil",
    "styling.noiseOpacity": "perfil",
    "styling.glowIntensity": "perfil",
    "styling.hardShadows": "perfil",
    "styling.uppercase": "perfil",
    "styling.neonTicker": "perfil",
    "styling.fluidity": "perfil",
    "styling.surfaceTension": "perfil",
    "styling.frostOpacity": "perfil",
    "styling.glassNoise": "perfil",
    "styling.crystalPreset": "perfil", // preset de cristal: estilo del perfil, no del aparato
    "typography.fontFamily": "perfil", // la familia elegida es identidad del perfil
    "background.living.colors": "perfil", // la paleta del fondo vivo es identidad del perfil
    // ── Rendimiento y comodidad f├¡sica → neurona (cada aparato la suya) ──
    "background.type": "neurona", // un fondo WebGL pesado funde el m├│vil: lo decide cada aparato
    "background.webglVariant": "neurona",
    "background.webglZoom": "neurona",
    "background.webglSpeed": "neurona",
    "background.living.intensity": "neurona", // densidad de part├¡culas: cuesta seg├║n el aparato
    "typography.scale": "neurona", // el tama├▒o que vale en 13" no vale en el televisor
    "layout.menuPosition": "neurona", // d├│nde est├í el men├║ es costumbre de cada aparato
    // ── Del due├▒o, no del perfil → cuenta ──
    "typography.customFonts": "cuenta", // las fuentes personalizadas instaladas son de la cuenta
};

/* ── Tipos de entrada/salida ──────────────────────────────────────────────── */
export type FusibleApariencia = import("@/context/appearance-context").DeepPartial<
    import("@/context/appearance-context").AppearanceConfig
>;

export interface FusionEntrada {
    remota: FusibleApariencia;
    remotaAt: number;
    local: FusibleApariencia;
    localAt: number;
    deviceId: string;
    remotaDeviceId?: string;
}

export interface FusionSalida {
    resultado: FusibleApariencia;
    cambios: string[];
}

/* ── Internos (recorrido de rutas) ─────────────────────────────────────────── */

type Ruta = string;

/** ¿Es una hoja (primitivo o array)? Los arrays se tratan como hoja, no se desciende. */
function esHoja(v: unknown): boolean {
    return v === null || v === undefined || typeof v !== "object" || Array.isArray(v);
}

/**
 * Recorre una config parcial y devuelve TODAS las rutas-hoja presentes.
 * Cada hoja devuelta existe en `config` y no se repite → `repartir` no pierde
 * ni duplica ninguna ruta (cada hoja cae en exactamente una cesta).
 */
function rutasDe(config: FusibleApariencia): Ruta[] {
    const out: Ruta[] = [];
    const camina = (obj: Record<string, unknown>, prefijo: string): void => {
        for (const [k, v] of Object.entries(obj)) {
            if (v === undefined || v === null) continue;
            const ruta = prefijo ? `${prefijo}.${k}` : k;
            if (esHoja(v)) out.push(ruta);
            else camina(v as Record<string, unknown>, ruta);
        }
    };
    camina(config as Record<string, unknown>, "");
    return out;
}

/** Valor en la ruta (punto-separada), o `undefined` si no existe. */
function valorEn(config: FusibleApariencia, ruta: Ruta): unknown {
    let cur: unknown = config;
    for (const seg of ruta.split(".")) {
        if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
}

/** Fija `v` en la ruta de `dest`, creando/uniendo los objetos intermedios. */
function ponEn(dest: Record<string, unknown>, partes: string[], v: unknown): void {
    if (partes.length === 1) { dest[partes[0]] = v; return; }
    const [head, ...rest] = partes;
    let nxt = dest[head] as Record<string, unknown> | undefined;
    if (!nxt || typeof nxt !== "object" || Array.isArray(nxt)) nxt = dest[head] = {};
    ponEn(nxt, rest, v);
}

/** ¿Profunda e iguales? (arrays y objetos pueden venir de distintos orígenes). */
function iguales(a: unknown, b: unknown): boolean {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return a === b; }
}

/* ── API p├║blica ──────────────────────────────────────────────────────────── */

/**
 * Parte una config de apariencia en las tres cestas. Cada ruta-hoja cae en la
 * cesta que le asigna `POLITICA_APARIENCIA` (por defecto `perfil`).
 *
 * ⚠️ Respeto de `settings-sync.ts`: la apariencia completa viaja bajo la clave
 * `appearance-config-v2` (en `SYNCED_KEYS`, NUNCA en `NEVER_SYNCED_KEYS`), así que
 * ninguna ruta de la config está prohibida en la nube por ese módulo. Las cestas
 * aquí van de la mano de esa clave: `perfil` (identidad) y `cuenta` (del dueño,
 * p. ej. fuentes instaladas) viajan; `neurona` (rendimiento/comodidad física)
 * se queda en el aparato aunque la clave sí viaje — lo decide la fusión, que
 * jamás pisa una ruta `neurona` con lo remoto.
 */
export function repartir(config: FusibleApariencia): Record<AlcanceApariencia, FusibleApariencia> {
    const cestas: Record<AlcanceApariencia, Record<string, unknown>> = { cuenta: {}, perfil: {}, neurona: {} };
    for (const ruta of rutasDe(config)) {
        const alcance = POLITICA_APARIENCIA[ruta] ?? ALCANCE_DEFECTO;
        ponEn(cestas[alcance], ruta.split("."), valorEn(config, ruta));
    }
    return cestas as Record<AlcanceApariencia, FusibleApariencia>;
}

/**
 * Fusiona la apariencia local con la remota:
 *   · anti-eco: si `remotaDeviceId === deviceId` es nuestro propio cambio
 *     volviendo → se ignora entera (devolvemos lo local intacto), como ya hace
 *     `realtime-sync.ts` (payload.deviceId === deviceId() → return).
 *   · las rutas de alcance `neurona` NUNCA se pisan con lo remoto (cada aparato
 *     la suya).
 *   · el resto (`cuenta`/`perfil`) gana por marca de tiempo más nueva.
 * `cambios` lista las rutas que el remoto sobrescribió de verdad.
 */
export function fusionarApariencia(e: FusionEntrada): FusionSalida {
    if (typeof e.remotaDeviceId === "string" && e.remotaDeviceId === e.deviceId) {
        return { resultado: e.local, cambios: [] };
    }

    const resultado: Record<string, unknown> = JSON.parse(JSON.stringify(e.local ?? {}));
    const cambios: string[] = [];

    for (const ruta of rutasDe(e.remota)) {
        const alcance = POLITICA_APARIENCIA[ruta] ?? ALCANCE_DEFECTO;
        if (alcance === "neurona") continue; // cada aparato decide su rendimiento/comodidad
        const valRemoto = valorEn(e.remota, ruta);
        if (valRemoto === undefined) continue;
        const valLocal = valorEn(resultado, ruta);
        const remotaManda = e.remotaAt > e.localAt;
        if (remotaManda && !iguales(valRemoto, valLocal)) {
            ponEn(resultado, ruta.split("."), valRemoto);
            cambios.push(ruta);
        }
    }
    return { resultado: resultado as FusibleApariencia, cambios };
}