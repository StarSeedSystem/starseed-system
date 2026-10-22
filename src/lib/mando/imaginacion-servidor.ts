/**
 * Imaginación · servidor de propuestas y ajustes de autodesarrollo (Ola 1021I · IMN1021G).
 * ─────────────────────────────────────────────────────────────────────────────
 * Solo servidor (contrato `architecture/imaginacion-autodesarrollo.md` §6): lee y
 * escribe `starseed_memory_root/imaginacion/propuestas.json` (raíz con
 * `raizDelProyecto()`) y `~/.starseed/autodesarrollo.json`, siempre con escritura
 * atómica. `aprobar` marca «aprobada» (el director la encola en su ciclo) o, si la
 * fuente es Astraura, llama a su backend 1.58 local (POST /api/imagination/action
 * `{item_id, item_type, action: "apply"}`); si no responde, error honesto y NADA
 * cambia. JAMÁS devuelve rutas del disco. Lo puro (validación y decisiones) no toca
 * disco ni red: el reloj y el fetch vienen por parámetro.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";

export const FUENTES = ["diaria", "profunda", "astraura", "directores"] as const;
export type FuenteImaginacion = (typeof FUENTES)[number];

export const IMPORTANCIAS = ["baja", "media", "alta", "crítica"] as const;
type Importancia = (typeof IMPORTANCIAS)[number];

export const ESTADOS_PROPUESTA = [
    "nueva", "autodesarrollo", "esperando-aprobacion", "pregunta", "descartada",
    "aprobada", "rechazada", "pospuesta", "hecha",
] as const;
export type EstadoPropuesta = (typeof ESTADOS_PROPUESTA)[number];

export interface PropuestaImaginacion {
    id: string;
    fuente: FuenteImaginacion;
    titulo: string;
    cuerpo: string;
    /** Archivos del repo que toca (siempre relativos, sin barra inicial). */
    archivos: string[];
    utilidad: number;
    importancia: Importancia;
    estado: EstadoPropuesta;
    motivo: string;
    tarea: string | null;
    t: string;
    /** Solo la fuente astraura: el ítem de su backend 1.58. */
    astraura?: { itemId: string; itemType: string };
    /** Puesta en posponer: hasta cuándo está dormida (ISO). */
    hasta?: string;
}

export interface AjustesAutodesarrollo {
    automatico: boolean;
    /** Techo de tareas autodesarrolladas por ciclo (0–10). */
    rango: number;
    fuentes: Record<FuenteImaginacion, boolean>;
    horario: { modo: "inteligente" | "franjas"; franjas: { dias: number[]; desde: string; hasta: string }[]; repartir: boolean };
    profunda: { cada_dias: number };
}

export const AJUSTES_DEFECTO: AjustesAutodesarrollo = {
    automatico: true,
    rango: 10,
    fuentes: { diaria: true, profunda: true, astraura: true, directores: true },
    horario: { modo: "inteligente", franjas: [{ dias: [0, 1, 2, 3, 4, 5, 6], desde: "02:00", hasta: "06:00" }], repartir: true },
    profunda: { cada_dias: 7 },
};

// ─────────────────────────────── lo puro ───────────────────────────────

function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida y completa los ajustes de autodesarrollo con sus defectos (§4). PURA. */
export function validarAjustes(bruto: unknown): { ok: true; valor: AjustesAutodesarrollo } | { ok: false; error: string } {
    const d = objeto(bruto);
    if (d.automatico !== undefined && typeof d.automatico !== "boolean")
        return { ok: false, error: "«automatico» debe ser true o false." };
    let rango = AJUSTES_DEFECTO.rango;
    if (d.rango !== undefined) {
        const n = typeof d.rango === "number" ? d.rango : Number(d.rango);
        if (!Number.isInteger(n) || n < 0 || n > 10)
            return { ok: false, error: "El rango va de 0 a 10 tareas autodesarrolladas por ciclo." };
        rango = n;
    }
    const fuentes = { ...AJUSTES_DEFECTO.fuentes };
    const df = objeto(d.fuentes);
    for (const f of FUENTES) if (typeof df[f] === "boolean") fuentes[f] = df[f] as boolean;
    const h = objeto(d.horario);
    const modo = h.modo === "franjas" ? "franjas" : "inteligente";
    let franjas = AJUSTES_DEFECTO.horario.franjas;
    if (Array.isArray(h.franjas)) {
        const validas: AjustesAutodesarrollo["horario"]["franjas"] = [];
        for (const f of h.franjas) {
            const x = objeto(f);
            const dias = Array.isArray(x.dias) ? (x.dias as unknown[]).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6) : [];
            const desde = typeof x.desde === "string" && PATRON_HORA.test(x.desde) ? x.desde : "";
            const hasta = typeof x.hasta === "string" && PATRON_HORA.test(x.hasta) ? x.hasta : "";
            if (!desde || !hasta) return { ok: false, error: "Cada franja necesita «desde» y «hasta» con forma HH:MM." };
            validas.push({ dias, desde, hasta });
        }
        franjas = validas;
    }
    const p = objeto(d.profunda);
    const cada = typeof p.cada_dias === "number" ? p.cada_dias : AJUSTES_DEFECTO.profunda.cada_dias;
    if (!Number.isInteger(cada) || cada < 0 || cada > 60)
        return { ok: false, error: "«profunda.cada_dias» va de 0 (nunca) a 60." };
    return {
        ok: true,
        valor: {
            automatico: d.automatico === undefined ? AJUSTES_DEFECTO.automatico : d.automatico === true,
            rango,
            fuentes,
            horario: { modo, franjas, repartir: h.repartir === undefined ? AJUSTES_DEFECTO.horario.repartir : h.repartir === true },
            profunda: { cada_dias: cada },
        },
    };
}

/** Normaliza una propuesta del disco: tipada, acotada y SIN rutas absolutas. PURA. */
export function proponerPropuesta(bruto: unknown): PropuestaImaginacion | null {
    const d = objeto(bruto);
    const id = typeof d.id === "string" && d.id.trim() ? d.id.trim().slice(0, 60) : "";
    const fuente = typeof d.fuente === "string" && (FUENTES as readonly string[]).includes(d.fuente) ? d.fuente : "";
    if (!id || !fuente) return null;
    const estado = typeof d.estado === "string" && (ESTADOS_PROPUESTA as readonly string[]).includes(d.estado) ? d.estado : "";
    const importancia = typeof d.importancia === "string" && (IMPORTANCIAS as readonly string[]).includes(d.importancia) ? d.importancia : "";
    const a = objeto(d.astraura);
    const utilidad = typeof d.utilidad === "number" && Number.isFinite(d.utilidad) ? Math.min(1, Math.max(0, d.utilidad)) : 0;
    return {
        id,
        fuente: fuente as FuenteImaginacion,
        titulo: typeof d.titulo === "string" ? d.titulo.slice(0, 200) : "",
        cuerpo: typeof d.cuerpo === "string" ? d.cuerpo.slice(0, 2000) : "",
        archivos: Array.isArray(d.archivos)
            ? d.archivos.filter((x): x is string => typeof x === "string").map((x) => x.replace(/^\/+/, "").slice(0, 200))
            : [],
        utilidad,
        importancia: importancia as Importancia,
        estado: (estado || "nueva") as EstadoPropuesta,
        motivo: typeof d.motivo === "string" ? d.motivo.slice(0, 300) : "",
        tarea: typeof d.tarea === "string" && d.tarea ? d.tarea.slice(0, 60) : null,
        t: typeof d.t === "string" ? d.t.slice(0, 40) : "",
        astraura:
            typeof a.itemId === "string" && a.itemId.trim() && typeof a.itemType === "string" && a.itemType.trim()
                ? { itemId: a.itemId.trim().slice(0, 120), itemType: a.itemType.trim().slice(0, 40) }
                : undefined,
        hasta: typeof d.hasta === "string" ? d.hasta.slice(0, 40) : undefined,
    };
}

/** ¿Aprobar esta propuesta significa aplicar en el backend 1.58? PURA. */
export function necesitaAstraura(p: PropuestaImaginacion): boolean {
    return p.fuente === "astraura" && !!p.astraura?.itemId && !!p.astraura?.itemType;
}

/** Hasta cuándo queda pospuesta, con el reloj por parámetro. PURA. */
export function posponerHasta(ahoraMs: number, horas: number): string {
    return new Date(ahoraMs + Math.min(720, Math.max(1, horas)) * 3600_000).toISOString();
}

// ─────────────────────────────── discos (solo servidor) ───────────────────────────────

export function rutasImaginacion(raiz = raizDelProyecto(), casa = os.homedir()) {
    return {
        propuestas: path.join(raiz, "starseed_memory_root", "imaginacion", "propuestas.json"),
        ajustes: path.join(casa, ".starseed", "autodesarrollo.json"),
    };
}

async function leerJson(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
    } catch {
        return null;
    }
}

/** Escritura atómica: archivo temporal + rename, como en el resto de /api/mando. */
export async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
    await rename(temporal, ruta);
}

/** Las propuestas, normalizadas (jamás rutas absolutas). Lista vacía si no hay archivo. */
export async function leerPropuestas(raiz = raizDelProyecto()): Promise<PropuestaImaginacion[]> {
    const crudo = await leerJson(rutasImaginacion(raiz).propuestas);
    const lista = Array.isArray(crudo) ? crudo : Array.isArray(objeto(crudo).propuestas) ? (objeto(crudo).propuestas as unknown[]) : [];
    return lista.map(proponerPropuesta).filter((p): p is PropuestaImaginacion => p !== null);
}

async function cambiarPropuesta(
    id: string,
    cambios: Partial<PropuestaImaginacion>,
    raiz?: string,
): Promise<PropuestaImaginacion | null> {
    const lista = (await leerPropuestas(raiz)).map((p) => (p.id === id ? { ...p, ...cambios } : p));
    await escribirAtomico(rutasImaginacion(raiz).propuestas, lista);
    return lista.find((p) => p.id === id) ?? null;
}

/** POST /api/imagination/action del backend 1.58 local. Devuelve null si se aplicó. */
export async function aplicarEnAstraura(
    p: PropuestaImaginacion,
    url: string,
    hace: typeof fetch = fetch,
): Promise<string | null> {
    const a = p.astraura ?? { itemId: "", itemType: "" };
    try {
        const ctrl = new AbortController();
        const alarma = setTimeout(() => ctrl.abort(), 8_000);
        const res = await hace(`${url.replace(/\/+$/, "")}/api/imagination/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_id: a.itemId, item_type: a.itemType, action: "apply" }),
            signal: ctrl.signal,
        });
        clearTimeout(alarma);
        if (!res.ok) return `El backend 1.58 respondió HTTP ${res.status}: no se aplicó y nada cambió.`;
        const j = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (j && j.success === false)
            return `El backend 1.58 rechazó la acción (${String(j.error ?? "sin motivo")}). Nada cambió.`;
        return null;
    } catch {
        return "El backend 1.58 no responde: no se aplicó y nada cambió.";
    }
}

/** Marca «aprobada» (el director la encola) o aplica en el backend de Astraura; si no responde, nada cambia. */
export async function aprobarPropuesta(
    id: string,
    opciones: { raiz?: string; hace?: typeof fetch; urlAstraura?: string } = {},
): Promise<{ ok: boolean; error?: string; propuesta?: PropuestaImaginacion }> {
    const lista = await leerPropuestas(opciones.raiz);
    const p = lista.find((x) => x.id === id);
    if (!p) return { ok: false, error: "No existe esa propuesta." };
    if (necesitaAstraura(p)) {
        const url = opciones.urlAstraura ?? process.env.ASTRAURA_158_URL ?? "http://127.0.0.1:8000";
        const error = await aplicarEnAstraura(p, url, opciones.hace ?? fetch);
        if (error) return { ok: false, error };
    }
    const propuesta = await cambiarPropuesta(id, { estado: "aprobada", motivo: "", t: new Date().toISOString() }, opciones.raiz);
    return { ok: true, propuesta: propuesta ?? undefined };
}

/** Marca «rechazada», con el motivo si viene. */
export async function rechazarPropuesta(id: string, motivo = "", raiz?: string) {
    const lista = await leerPropuestas(raiz);
    if (!lista.some((x) => x.id === id)) return { ok: false as const, error: "No existe esa propuesta." };
    const propuesta = await cambiarPropuesta(id, { estado: "rechazada", motivo: motivo.slice(0, 300), t: new Date().toISOString() }, raiz);
    return { ok: true as const, propuesta: propuesta ?? undefined };
}

/** Marca «pospuesta» hasta ahora + horas (1–720). */
export async function posponerPropuesta(id: string, horas: number, opciones: { raiz?: string; ahoraMs?: number } = {}) {
    if (!Number.isFinite(horas) || horas < 1 || horas > 720)
        return { ok: false as const, error: "Las horas de posponer van de 1 a 720." };
    const lista = await leerPropuestas(opciones.raiz);
    if (!lista.some((x) => x.id === id)) return { ok: false as const, error: "No existe esa propuesta." };
    const hasta = posponerHasta(opciones.ahoraMs ?? Date.now(), horas);
    const propuesta = await cambiarPropuesta(id, { estado: "pospuesta", hasta, t: new Date().toISOString() }, opciones.raiz);
    return { ok: true as const, propuesta: propuesta ?? undefined };
}

/** Ajustes leídos del disco (o los de defecto si el archivo no existe o no valida). */
export async function leerAjustes(casa = os.homedir()): Promise<AjustesAutodesarrollo> {
    const v = validarAjustes(await leerJson(rutasImaginacion(undefined, casa).ajustes));
    return v.ok ? v.valor : AJUSTES_DEFECTO;
}

/** Guarda los ajustes tras validarlos; con error honesto y sin escribir si no validan. */
export async function guardarAjustes(bruto: unknown, casa = os.homedir()) {
    const v = validarAjustes(bruto);
    if (!v.ok) return v;
    await escribirAtomico(rutasImaginacion(undefined, casa).ajustes, v.valor);
    return v;
}
