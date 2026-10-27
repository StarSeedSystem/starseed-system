// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión · carpetas vigiladas de la Biblioteca (módulo PURO)
// ----------------------------------------------------------------------------
// Alex (2026-10-23): reglas «carpeta de la Biblioteca → formato» (p. ej. todo lo
// que entra en «Fotos del móvil» pasa a JPG). Cada regla vive con la persona en
// la clave `starseed.conversion.vigiladas.v1`; el vigilante (`filee watch`, en
// otra tarea) pregunta aquí qué archivos nuevos convertir. Sin red, sin disco,
// sin `node:*`. Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { esFormatoValido, formatoDe, nombreDeSalida } from "./formatos";

/** Clave de almacenamiento con la persona (localStorage / user_settings.prefs). */
export const CLAVE_VIGILADAS = "starseed.conversion.vigiladas.v1";

/** Una regla «carpeta → formato». Solo UNA por carpeta (evita dobles conversiones). */
export interface ReglaVigilada {
    id: string;
    carpeta: string;
    destino: string;
    activa: boolean;
    creada: number;
}

/** Resultado de una conversión ya hecha, para no repetirla nunca. */
export interface MarcaHecha {
    regla: string;
    salida: string;
    cuando: number;
}

export interface EstadoVigiladas {
    version: 1;
    reglas: ReglaVigilada[];
    hechas: MarcaHecha[];
}

/** Lo que el vigilante debe convertir ahora. */
export interface Pendiente {
    regla: string;
    origen: string;
    destino: string;
    salida: string;
}

export function estadoInicial(): EstadoVigiladas {
    return { version: 1, reglas: [], hechas: [] };
}

/** Dos rutas de carpeta son la misma si coinciden al limpiar barras y espacios. */
function mismaCarpeta(a: string, b: string): boolean {
    return a.replace(/\/+$/, "").trim() === b.replace(/\/+$/, "").trim();
}

function idDe(carpeta: string): string {
    const trozo = carpeta.split(/[\\/]/).filter(Boolean).pop() ?? "carpeta";
    const limpio = trozo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return limpio.slice(0, 40) || "carpeta";
}

/** Lee el JSON guardado; lo que no vale se tira (nunca lanza). */
export function leerEstado(texto: string): EstadoVigiladas {
    const sin: EstadoVigiladas = estadoInicial();
    let bruto: unknown;
    try {
        bruto = JSON.parse(String(texto ?? ""));
    } catch {
        return sin;
    }
    if (!bruto || typeof bruto !== "object") return sin;
    const o = bruto as Record<string, unknown>;
    const reglas = Array.isArray(o.reglas) ? o.reglas : [];
    const hechas = Array.isArray(o.hechas) ? o.hechas : [];
    const out = estadoInicial();
    const vistas = new Set<string>();
    for (const r of reglas) {
        if (!r || typeof r !== "object") continue;
        const c = r as Record<string, unknown>;
        const carpeta = typeof c.carpeta === "string" ? c.carpeta.replace(/\/+$/, "").trim() : "";
        const destino = typeof c.destino === "string" ? formatoDe(c.destino) : "";
        if (!carpeta || !esFormatoValido(destino) || vistas.has(carpeta.toLowerCase())) continue;
        vistas.add(carpeta.toLowerCase());
        out.reglas.push({
            id: typeof c.id === "string" && c.id.trim() ? c.id.trim() : idDe(carpeta),
            carpeta,
            destino,
            activa: c.activa !== false,
            creada: typeof c.creada === "number" && c.creada > 0 ? c.creada : 0,
        });
    }
    const vistasSalida = new Set<string>();
    for (const h of hechas) {
        if (!h || typeof h !== "object") continue;
        const m = h as Record<string, unknown>;
        const regla = typeof m.regla === "string" ? m.regla : "";
        const salida = typeof m.salida === "string" ? m.salida.trim() : "";
        if (!regla || !salida) continue;
        const clave = `${regla}|${salida.toLowerCase()}`;
        if (vistasSalida.has(clave)) continue;
        vistasSalida.add(clave);
        out.hechas.push({ regla, salida, cuando: typeof m.cuando === "number" && m.cuando > 0 ? m.cuando : 0 });
    }
    if (out.hechas.length > TOPE_HECHAS) out.hechas = out.hechas.slice(-TOPE_HECHAS);
    return out;
}

/** Tope de registro de conversiones hechas para no crecer sin fin. */
export const TOPE_HECHAS = 500;

/** Serializa (leerEstado(escribirEstado(e)) === saneado de e). */
export function escribirEstado(e: EstadoVigiladas): string {
    return JSON.stringify({ version: 1, reglas: e.reglas, hechas: e.hechas });
}

/**
 * Añade (o sustituye) la regla de una carpeta. Solo una por carpeta: si ya había
 * una distinta, sus conversiones hechas se borran con ella. Formato inválido
 * lanza, como el resto de argumentos de conversión en el OS.
 */
export function agregarRegla(e: EstadoVigiladas, carpeta: string, destino: string, cuando = 0): EstadoVigiladas {
    const c = String(carpeta ?? "").replace(/\/+$/, "").trim();
    const d = formatoDe(destino);
    if (!c) throw new Error("Falta la carpeta a vigilar");
    if (!esFormatoValido(d)) throw new Error(`Formato de destino no válido: ${destino}`);
    const previa = e.reglas.find((r) => mismaCarpeta(r.carpeta, c)) ?? null;
    const hechas = previa ? e.hechas.filter((h) => h.regla !== previa.id) : e.hechas;
    const resto = e.reglas.filter((r) => !mismaCarpeta(r.carpeta, c));
    const nueva: ReglaVigilada = { id: idDe(c), carpeta: c, destino: d, activa: true, creada: cuando > 0 ? cuando : Date.now() };
    while (resto.some((r) => r.id === nueva.id)) nueva.id = `${nueva.id}-2`;
    return { version: 1, reglas: [...resto, nueva], hechas };
}

/** Quita la regla y sus marcas de conversiones hechas. */
export function quitarRegla(e: EstadoVigiladas, id: string): EstadoVigiladas {
    return { version: 1, reglas: e.reglas.filter((r) => r.id !== id), hechas: e.hechas.filter((h) => h.regla !== id) };
}

/** Activa o desactiva (sin perder la regla ni su registro). */
export function alternarRegla(e: EstadoVigiladas, id: string, activa: boolean): EstadoVigiladas {
    return { ...e, reglas: e.reglas.map((r) => (r.id === id ? { ...r, activa } : r)) };
}

/** La regla de una carpeta, o de la carpeta madre si el archivo va en una subcarpeta. */
export function reglaDe(e: EstadoVigiladas, carpeta: string): ReglaVigilada | null {
    const c = String(carpeta ?? "").replace(/\/+$/, "").trim();
    if (!c) return null;
    const exacta = e.reglas.find((r) => r.activa && mismaCarpeta(r.carpeta, c));
    if (exacta) return exacta;
    return e.reglas.find((r) => r.activa && c.startsWith(`${r.carpeta}/`)) ?? null;
}

/** ¿El nombre de salida ya existe en la carpeta? (sin mayúsculas de por medio) */
function estaEnCarpeta(nombres: string[], salida: string): boolean {
    const s = salida.toLowerCase();
    return nombres.some((n) => n.toLowerCase() === s);
}

/**
 * Qué archivos nuevos de una carpeta hay que convertir con su regla. Sin
 * repetir y sin bucles: se salta lo que ya está en el formato destino (así
 * nunca se toca el resultado de una conversión), lo ya registrado como hecho y
 * el que tendría el nombre de salida que ya existe en la carpeta.
 */
export function pendientes(e: EstadoVigiladas, carpeta: string, nombres: string[]): Pendiente[] {
    const r = reglaDe(e, carpeta);
    if (!r) return [];
    const limpios = nombres.filter((n) => typeof n === "string" && n.trim());
    const hechasRegla = new Set(e.hechas.filter((h) => h.regla === r.id).map((h) => h.salida.toLowerCase()));
    const out: Pendiente[] = [];
    const vistos = new Set<string>();
    for (const n of limpios) {
        const nombre = n.split(/[\\/]/).pop() ?? "";
        if (vistos.has(nombre.toLowerCase())) continue;
        vistos.add(nombre.toLowerCase());
        const salida = nombreDeSalida(nombre, r.destino);
        if (salida.toLowerCase() === nombre.toLowerCase()) continue;
        if (estaEnCarpeta(limpios, salida)) continue;
        if (hechasRegla.has(salida.toLowerCase())) continue;
        out.push({ regla: r.id, origen: nombre, destino: r.destino, salida });
    }
    return out;
}

/**
 * Anota las conversiones terminadas (nombre de la SALIDA, que ya vive en la
 * misma carpeta). Dedupe (regla|salida) y tope ancestral de `TOPE_HECHAS`.
 */
export function marcarHechas(e: EstadoVigiladas, hechas: Array<Pick<Pendiente, "regla" | "salida">>, cuando = Date.now()): EstadoVigiladas {
    const vistas = new Set(e.hechas.map((h) => `${h.regla}|${h.salida.toLowerCase()}`));
    const nuevas: MarcaHecha[] = [];
    for (const h of hechas) {
        const regla = typeof h?.regla === "string" ? h.regla : "";
        const salida = typeof h?.salida === "string" ? h.salida.trim() : "";
        if (!regla || !salida) continue;
        const clave = `${regla}|${salida.toLowerCase()}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        nuevas.push({ regla, salida, cuando });
    }
    const hechasFin = [...e.hechas.filter((h) => !nuevas.some((n) => n.regla === h.regla && n.salida.toLowerCase() === h.salida.toLowerCase())), ...nuevas];
    return { version: 1, reglas: e.reglas, hechas: hechasFin.slice(-TOPE_HECHAS) };
}


