// ════════════════════════════════════════════════════════════════
// StarSeed OS — «Archivo de símbolo» del escritorio (ESC1110B)
// ----------------------------------------------------------------
// Formato abierto y versionado (JSON) con todo lo que antes estaba fijo en
// el código: la forma (el oficial o una referencia a un modelo), el
// material, las luces, la pose de reposo y los comportamientos. El símbolo
// oficial es el archivo por defecto y el componente pinta el archivo que
// reciba. Contrato: architecture/simbolo-escritorio.md.
//
// Seguridad (validación estricta, sin excepciones):
//   · solo `data:` incrustados — ninguna URL remota ni relativa;
//   · topes de tamaño por recurso y para el archivo entero;
//   · SVG sin scripts, sin manejadores `on…`, sin `foreignObject`, sin
//     imágenes, sin estilos con `url(…)` externos ni referencias fuera de `#…`;
//   · glTF/GLB solo con búferes e imágenes incrustados;
//   · números acotados a su rango; campos desconocidos, descartados.
// Un archivo malo cae al oficial con un motivo claro.
//
// Regla de marca: el símbolo OFICIAL nunca se deforma ni se recolorea; en
// él se ignoran forma y material. Uno propio es de la entidad y se rotula así.
// PURO: sin three, sin React, sin DOM.
// ════════════════════════════════════════════════════════════════

export const FORMATO_SIMBOLO = "starseed-simbolo" as const;
export const VERSION_SIMBOLO = 1 as const;
/** Tipo MIME propio del archivo (para exportar e importar). */
export const MIME_SIMBOLO = "application/vnd.starseed.simbolo+json";
export const EXTENSION_SIMBOLO = ".simbolo.json";

/** Topes (bytes). */
export const TOPES_SIMBOLO = {
    archivo: 1024 * 1024, // JSON entero, recursos incluidos
    modelo: 768 * 1024, // glTF/GLB decodificado
    svg: 128 * 1024,
    imagen: 512 * 1024, // decodificada
    nombre: 60,
} as const;

export type FuenteSimbolo =
    | { tipo: "oficial" }
    /** glTF 2.0: `data:model/gltf-binary;base64,…` o `data:model/gltf+json;base64,…`. */
    | { tipo: "gltf"; datos: string }
    /** SVG en texto plano; se extruye con `profundidad` (unidades del modelo). */
    | { tipo: "svg"; datos: string; profundidad: number }
    /** Imagen `data:image/(png|jpeg|webp);base64,…` como relieve iluminado. */
    | { tipo: "imagen"; datos: string; relieve: number };

export interface LuzSimbolo {
    intensidad: number;
    color: string;
}

export interface ArchivoSimbolo {
    formato: typeof FORMATO_SIMBOLO;
    version: typeof VERSION_SIMBOLO;
    nombre: string;
    fuente: FuenteSimbolo;
    /** Solo para símbolos propios: el oficial conserva sus materiales de marca. */
    material: { color: string; rugosidad: number; metalico: number; laca: number };
    luces: { clave: LuzSimbolo; relleno: LuzSimbolo; contra: LuzSimbolo; entorno: number };
    /** Pose de reposo: grados y escala uniforme (nunca deforma). */
    pose: { guinada: number; cabeceo: number; escala: number; flotacion: number };
    comportamientos: {
        seguirCursor: boolean;
        parpadeo: boolean;
        parpadeoOcioso: boolean;
        rotacionFlor: boolean;
        fusionFlor: boolean;
        /** 0 = sin giro automático … 3 = el triple de rápido. */
        velocidadFlor: number;
        /** Segundos de pausa en cada posición de reposo. */
        pausaFlor: number;
    };
}

/** Rangos de los números (min, max). */
export const RANGOS = {
    profundidad: [0.01, 0.4],
    relieve: [0, 0.3],
    rugosidad: [0, 1],
    metalico: [0, 1],
    laca: [0, 1],
    intensidadClave: [0, 6],
    intensidadRelleno: [0, 3],
    intensidadContra: [0, 6],
    entorno: [0, 2],
    guinada: [-45, 45],
    cabeceo: [-30, 30],
    escala: [0.5, 1.5],
    flotacion: [0, 1],
    velocidadFlor: [0, 3],
    pausaFlor: [1, 30],
} as const satisfies Record<string, readonly [number, number]>;

/** En el oficial la luz solo se matiza: la marca se ve con sus colores. */
export const RANGO_LUZ_OFICIAL = [0.6, 1.4] as const;

/** El archivo del símbolo oficial: lo que ESC1110A tenía fijo en el código. */
export const SIMBOLO_OFICIAL: ArchivoSimbolo = Object.freeze({
    formato: FORMATO_SIMBOLO,
    version: VERSION_SIMBOLO,
    nombre: "Símbolo oficial StarSeed",
    fuente: { tipo: "oficial" },
    material: { color: "#EAEAEA", rugosidad: 0.4, metalico: 0, laca: 0.4 },
    luces: {
        clave: { intensidad: 3.2, color: "#FFF4E6" },
        relleno: { intensidad: 0.4, color: "#CFE0FF" },
        contra: { intensidad: 3.0, color: "#BFE8FF" },
        entorno: 0.4,
    },
    pose: { guinada: 16, cabeceo: 6, escala: 1, flotacion: 1 },
    comportamientos: {
        seguirCursor: true,
        parpadeo: true,
        parpadeoOcioso: true,
        rotacionFlor: true,
        fusionFlor: true,
        velocidadFlor: 1,
        pausaFlor: 7,
    },
}) as ArchivoSimbolo;

export function esOficial(a: ArchivoSimbolo): boolean {
    return a.fuente.tipo === "oficial";
}

export type ResultadoSimbolo =
    | { ok: true; archivo: ArchivoSimbolo; avisos: string[] }
    /** `archivo` es siempre el oficial: quien llama puede pintarlo sin más. */
    | { ok: false; motivo: string; archivo: ArchivoSimbolo; avisos: string[] };

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const DATA_GLTF_RE = /^data:model\/(gltf-binary|gltf\+json);base64,([a-z0-9+/=\s]+)$/i;
const DATA_IMAGEN_RE = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=\s]+)$/i;

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Bytes que ocupa una cadena en UTF-8 (sin TextEncoder: vale en cualquier entorno). */
export function bytesUtf8(s: string): number {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
        else n += 3;
    }
    return n;
}

/** Bytes decodificados de un base64 (sin decodificarlo). */
export function bytesBase64(b64: string): number {
    const limpio = b64.replace(/\s+/g, "");
    const relleno = limpio.endsWith("==") ? 2 : limpio.endsWith("=") ? 1 : 0;
    return Math.floor((limpio.length * 3) / 4) - relleno;
}

function decodificarBase64(b64: string): Uint8Array | null {
    try {
        const bin = atob(b64.replace(/\s+/g, ""));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

function texto(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch { return s; }
}

/** Todas las `uri` de búferes e imágenes de un glTF deben ser `data:` incrustados. */
function revisarJsonGltf(json: unknown): string | null {
    if (!esObjeto(json)) return "el glTF no es un objeto JSON";
    const asset = json.asset;
    if (!esObjeto(asset) || typeof asset.version !== "string" || !asset.version.startsWith("2")) return "solo se admite glTF 2.0";
    for (const lista of ["buffers", "images"] as const) {
        const arr = json[lista];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) return `«${lista}» no es una lista`;
        for (const it of arr) {
            if (!esObjeto(it)) return `«${lista}» trae una entrada rara`;
            if (it.uri !== undefined && (typeof it.uri !== "string" || !it.uri.startsWith("data:"))) {
                return "el modelo referencia archivos externos (solo se admiten recursos incrustados)";
            }
        }
    }
    return null;
}

/** Revisa un glTF/GLB incrustado. Devuelve el motivo del rechazo o null. */
export function revisarModelo(datos: string): string | null {
    const m = DATA_GLTF_RE.exec(datos);
    if (!m) return "el modelo debe ser un glTF/GLB incrustado (data:model/gltf-binary o gltf+json en base64)";
    if (bytesBase64(m[2]) > TOPES_SIMBOLO.modelo) return `el modelo pesa más de ${TOPES_SIMBOLO.modelo / 1024} KB`;
    const bytes = decodificarBase64(m[2]);
    if (!bytes) return "el base64 del modelo está roto";
    if (m[1].toLowerCase() === "gltf+json") {
        try { return revisarJsonGltf(JSON.parse(texto(bytes))); } catch { return "el glTF no es JSON válido"; }
    }
    // GLB: cabecera «glTF», versión 2, longitud coherente, primer trozo JSON.
    if (bytes.length < 20) return "el GLB está vacío";
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, true) !== 0x46546c67) return "no es un GLB (falta la firma glTF)";
    if (dv.getUint32(4, true) !== 2) return "solo se admite GLB versión 2";
    if (dv.getUint32(8, true) !== bytes.length) return "la longitud del GLB no cuadra";
    const largoJson = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + largoJson > bytes.length) return "el GLB no empieza por su trozo JSON";
    try {
        return revisarJsonGltf(JSON.parse(texto(bytes.subarray(20, 20 + largoJson))));
    } catch {
        return "el JSON del GLB está roto";
    }
}

/** Revisa un SVG. Devuelve el motivo del rechazo o null. */
export function revisarSvg(svg: string): string | null {
    if (bytesUtf8(svg) > TOPES_SIMBOLO.svg) return `el SVG pesa más de ${TOPES_SIMBOLO.svg / 1024} KB`;
    const s = svg.toLowerCase();
    const cuerpo = s.replace(/^﻿?\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*/, "");
    if (!cuerpo.startsWith("<svg")) return "no es un SVG";
    if (/<!doctype|<!entity/.test(s)) return "el SVG declara entidades o DOCTYPE";
    if (/<script|<foreignobject|<iframe|<embed|<object|<image|<use[\s>][^>]*href\s*=\s*["'](?!#)|<audio|<video|<animate[^>]*href/.test(s)) {
        return "el SVG trae scripts, contenido incrustado o imágenes";
    }
    if (/\son[a-z]+\s*=/.test(s)) return "el SVG trae manejadores de eventos (on…)";
    if (/javascript:|vbscript:|data:text\/html/.test(s)) return "el SVG trae enlaces ejecutables";
    if (/@import/.test(s)) return "el SVG importa estilos externos";
    // Toda referencia (href, xlink:href, url(…)) debe ser interna (#id).
    for (const r of s.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/g)) if (!r[1].trim().startsWith("#")) return "el SVG referencia algo fuera de sí mismo";
    for (const r of s.matchAll(/url\(\s*["']?([^"')]*)/g)) if (!r[1].trim().startsWith("#")) return "el SVG referencia algo fuera de sí mismo";
    return null;
}

/** Revisa una imagen incrustada. Devuelve el motivo del rechazo o null. */
export function revisarImagen(datos: string): string | null {
    const m = DATA_IMAGEN_RE.exec(datos);
    if (!m) return "la imagen debe ir incrustada como data:image/png, jpeg o webp en base64";
    if (bytesBase64(m[2]) > TOPES_SIMBOLO.imagen) return `la imagen pesa más de ${TOPES_SIMBOLO.imagen / 1024} KB`;
    return null;
}

function numero(v: unknown, [min, max]: readonly [number, number], defecto: number, nombre: string, avisos: string[]): number {
    if (v === undefined) return defecto;
    if (typeof v !== "number" || !Number.isFinite(v)) {
        avisos.push(`«${nombre}» no es un número: se usa ${defecto}`);
        return defecto;
    }
    if (v < min || v > max) {
        const acotado = Math.min(max, Math.max(min, v));
        avisos.push(`«${nombre}» fuera de rango (${min}…${max}): se acota a ${acotado}`);
        return acotado;
    }
    return v;
}

function color(v: unknown, defecto: string, nombre: string, avisos: string[]): string {
    if (v === undefined) return defecto;
    if (typeof v === "string" && COLOR_RE.test(v)) return v.toUpperCase();
    avisos.push(`«${nombre}» no es un color #RRGGBB: se usa ${defecto}`);
    return defecto;
}

function booleano(v: unknown, defecto: boolean): boolean {
    return typeof v === "boolean" ? v : defecto;
}

function nombreLimpio(v: unknown, defecto: string): string {
    if (typeof v !== "string") return defecto;
    const limpio = v.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, TOPES_SIMBOLO.nombre);
    return limpio || defecto;
}

function fallo(motivo: string, avisos: string[] = []): ResultadoSimbolo {
    return { ok: false, motivo, archivo: SIMBOLO_OFICIAL, avisos };
}

/**
 * Valida un archivo de símbolo (objeto o texto JSON). Siempre devuelve un
 * archivo usable: el validado o, si algo es inaceptable, el oficial.
 */
export function validarArchivoSimbolo(bruto: unknown): ResultadoSimbolo {
    let obj: unknown = bruto;
    if (typeof bruto === "string") {
        if (bytesUtf8(bruto) > TOPES_SIMBOLO.archivo) return fallo(`el archivo pesa más de ${TOPES_SIMBOLO.archivo / 1024} KB`);
        try { obj = JSON.parse(bruto); } catch { return fallo("el archivo no es JSON válido"); }
    } else {
        try {
            if (bytesUtf8(JSON.stringify(bruto) ?? "") > TOPES_SIMBOLO.archivo) return fallo(`el archivo pesa más de ${TOPES_SIMBOLO.archivo / 1024} KB`);
        } catch {
            return fallo("el archivo no se puede leer como JSON");
        }
    }
    if (!esObjeto(obj)) return fallo("el archivo no es un objeto");
    if (obj.formato !== FORMATO_SIMBOLO) return fallo("no es un archivo de símbolo StarSeed (falta «formato»: «starseed-simbolo»)");
    if (obj.version !== VERSION_SIMBOLO) return fallo(`versión no admitida (${String(obj.version)}); esta app lee la ${VERSION_SIMBOLO}`);

    const avisos: string[] = [];
    const o = SIMBOLO_OFICIAL;

    // Fuente.
    let fuente: FuenteSimbolo;
    const f = obj.fuente;
    if (f === undefined || (esObjeto(f) && f.tipo === "oficial")) fuente = { tipo: "oficial" };
    else if (!esObjeto(f)) return fallo("«fuente» no es un objeto");
    else if (f.tipo === "gltf") {
        if (typeof f.datos !== "string") return fallo("el modelo no trae «datos»");
        const m = revisarModelo(f.datos);
        if (m) return fallo(m);
        fuente = { tipo: "gltf", datos: f.datos };
    } else if (f.tipo === "svg") {
        if (typeof f.datos !== "string") return fallo("el SVG no trae «datos»");
        const m = revisarSvg(f.datos);
        if (m) return fallo(m);
        fuente = { tipo: "svg", datos: f.datos, profundidad: numero(f.profundidad, RANGOS.profundidad, 0.08, "fuente.profundidad", avisos) };
    } else if (f.tipo === "imagen") {
        if (typeof f.datos !== "string") return fallo("la imagen no trae «datos»");
        const m = revisarImagen(f.datos);
        if (m) return fallo(m);
        fuente = { tipo: "imagen", datos: f.datos, relieve: numero(f.relieve, RANGOS.relieve, 0.06, "fuente.relieve", avisos) };
    } else {
        return fallo(`tipo de fuente desconocido: ${String(f.tipo)}`);
    }
    const oficial = fuente.tipo === "oficial";

    const mat = esObjeto(obj.material) ? obj.material : {};
    const material = oficial
        ? { ...o.material }
        : {
            color: color(mat.color, "#EAEAEA", "material.color", avisos),
            rugosidad: numero(mat.rugosidad, RANGOS.rugosidad, o.material.rugosidad, "material.rugosidad", avisos),
            metalico: numero(mat.metalico, RANGOS.metalico, o.material.metalico, "material.metalico", avisos),
            laca: numero(mat.laca, RANGOS.laca, o.material.laca, "material.laca", avisos),
        };
    if (oficial && obj.material !== undefined && JSON.stringify(obj.material) !== JSON.stringify(o.material)) {
        avisos.push("el símbolo oficial conserva sus materiales de marca: se ignora «material»");
    }

    const lu = esObjeto(obj.luces) ? obj.luces : {};
    const luz = (clave: "clave" | "relleno" | "contra", rango: readonly [number, number]): LuzSimbolo => {
        const l = esObjeto(lu[clave]) ? (lu[clave] as Record<string, unknown>) : {};
        const base = o.luces[clave];
        // En el oficial la luz se matiza dentro de ±40 % y conserva su color: nunca recolorea la marca.
        const r: readonly [number, number] = oficial ? [base.intensidad * RANGO_LUZ_OFICIAL[0], base.intensidad * RANGO_LUZ_OFICIAL[1]] : rango;
        return {
            intensidad: numero(l.intensidad, r, base.intensidad, `luces.${clave}.intensidad`, avisos),
            color: oficial ? base.color : color(l.color, base.color, `luces.${clave}.color`, avisos),
        };
    };
    const luces = {
        clave: luz("clave", RANGOS.intensidadClave),
        relleno: luz("relleno", RANGOS.intensidadRelleno),
        contra: luz("contra", RANGOS.intensidadContra),
        entorno: numero(lu.entorno, oficial ? [o.luces.entorno * RANGO_LUZ_OFICIAL[0], o.luces.entorno * RANGO_LUZ_OFICIAL[1]] : RANGOS.entorno, o.luces.entorno, "luces.entorno", avisos),
    };

    const po = esObjeto(obj.pose) ? obj.pose : {};
    const pose = {
        guinada: numero(po.guinada, RANGOS.guinada, o.pose.guinada, "pose.guinada", avisos),
        cabeceo: numero(po.cabeceo, RANGOS.cabeceo, o.pose.cabeceo, "pose.cabeceo", avisos),
        escala: numero(po.escala, RANGOS.escala, o.pose.escala, "pose.escala", avisos),
        flotacion: numero(po.flotacion, RANGOS.flotacion, o.pose.flotacion, "pose.flotacion", avisos),
    };

    const co = esObjeto(obj.comportamientos) ? obj.comportamientos : {};
    const oc = o.comportamientos;
    const comportamientos = {
        seguirCursor: booleano(co.seguirCursor, oc.seguirCursor),
        parpadeo: booleano(co.parpadeo, oc.parpadeo),
        parpadeoOcioso: booleano(co.parpadeoOcioso, oc.parpadeoOcioso),
        rotacionFlor: booleano(co.rotacionFlor, oc.rotacionFlor),
        fusionFlor: booleano(co.fusionFlor, oc.fusionFlor),
        velocidadFlor: numero(co.velocidadFlor, RANGOS.velocidadFlor, oc.velocidadFlor, "comportamientos.velocidadFlor", avisos),
        pausaFlor: numero(co.pausaFlor, RANGOS.pausaFlor, oc.pausaFlor, "comportamientos.pausaFlor", avisos),
    };

    const archivo: ArchivoSimbolo = {
        formato: FORMATO_SIMBOLO,
        version: VERSION_SIMBOLO,
        nombre: nombreLimpio(obj.nombre, oficial ? o.nombre : "Símbolo propio"),
        fuente,
        material,
        luces,
        pose,
        comportamientos,
    };
    return { ok: true, archivo, avisos };
}

/** Texto JSON del archivo, listo para exportar. */
export function exportarArchivoSimbolo(a: ArchivoSimbolo): string {
    return JSON.stringify(a, null, 2);
}

/** Envuelve un recurso suelto (GLB, glTF, SVG o imagen) en un archivo de símbolo propio. */
export function archivoDesdeRecurso(tipo: "gltf" | "svg" | "imagen", datos: string, nombre: string): ResultadoSimbolo {
    const fuente =
        tipo === "svg" ? { tipo, datos, profundidad: 0.08 }
        : tipo === "imagen" ? { tipo, datos, relieve: 0.06 }
        : { tipo, datos };
    return validarArchivoSimbolo({ ...SIMBOLO_OFICIAL, nombre, fuente, material: { color: "#EAEAEA", rugosidad: 0.4, metalico: 0, laca: 0.4 } });
}

/** Clasifica un archivo elegido por su nombre y tipo MIME. */
export function tipoDeArchivoElegido(nombre: string, mime = ""): "simbolo" | "gltf" | "svg" | "imagen" | null {
    const n = nombre.toLowerCase();
    if (n.endsWith(".json") || mime === MIME_SIMBOLO || mime === "application/json") return "simbolo";
    if (n.endsWith(".glb") || n.endsWith(".gltf") || mime.startsWith("model/gltf")) return "gltf";
    if (n.endsWith(".svg") || mime === "image/svg+xml") return "svg";
    if (/\.(png|jpe?g|webp)$/.test(n) || /^image\/(png|jpeg|webp)$/.test(mime)) return "imagen";
    return null;
}
