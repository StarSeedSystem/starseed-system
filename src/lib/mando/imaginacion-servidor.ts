// Imaginación · servidor de propuestas y ajustes (Ola 1021I · IMN1021G; Ola 1024I · IMG1024A). SOLO servidor.
// Contrato: architecture/imaginacion-autodesarrollo.md §3, §4 y §6 y el de la Ola 1024I. Lee y escribe
// `starseed_memory_root/imaginacion/propuestas.json` (raíz con `raizDelProyecto()`) y
// `~/.starseed/autodesarrollo.json`, siempre con escritura atómica. Integrar (= aprobar) marca «aprobada»
// (el director la encola en su ciclo) o, si la fuente es Astraura, la aplica en su backend 1.58 local; si no
// responde, error honesto y NADA cambia. Reimaginar deja «reimaginando» con lo pedido para el director. Un lote
// hace UNA lectura y UNA escritura y da el resultado de cada id sin parar al primer error. La automática nunca
// integra alta ni crítica. Jamás devuelve rutas del disco.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    ESTADOS_PROPUESTA, NOMBRE_FUENTE, TIPOS_PROPUESTA, esDecidible, leerAmbito, normalizarAmbito, normalizarImportancia,
    normalizarReferencias, normalizarReimaginacion, validarAjustes, vetoDecision, vetoReimaginar,
    type AjustesAutodesarrollo, type EstadoPropuesta, type FuentePropuesta, type HacerDecision, type HacerLote,
    type PropuestaNormalizada, type QuienDecide, type TipoPropuesta,
} from "@/lib/mando/imaginacion-tipos";

export type PropuestaVisible = PropuestaNormalizada;
export type Resultado = { ok: true; propuesta: PropuestaVisible } | { ok: false; error: string };
export interface ResultadoId { id: string; ok: boolean; error?: string }
/** `error` solo cuando el lote entero no se pudo intentar (datos o ámbito malos): entonces nada cambió. */
export interface ResultadoLote { ok: boolean; resultados: ResultadoId[]; error?: string }
type Crudo = Record<string, unknown>;
export interface Lugar { raiz?: string; casa?: string }
/** Reloj, red y backend inyectables; `por` dice si decide Alex o la automática (por defecto, Alex). */
export interface OpcionesDecision extends Lugar { ahora?: Date; hace?: typeof fetch; base?: string; por?: QuienDecide }
export interface OpcionesLote extends OpcionesDecision { ambito?: string }
export interface DatosDecision { notas?: unknown; referencias?: unknown; motivo?: unknown; horas?: number }
const TIPO_ASTRAURA: Record<string, string> = { creacion: "creation", rama: "branch", creation: "creation", branch: "branch" }; // director → backend 1.58
const esObj = (v: unknown): v is Crudo => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
export function rutasImaginacion({ raiz = raizDelProyecto(), casa = os.homedir() }: Lugar = {}) {
    return { propuestas: path.join(raiz, "starseed_memory_root", "imaginacion", "propuestas.json"), ajustes: path.join(casa, ".starseed", "autodesarrollo.json") };
}

/** Propuesta del disco → la que ve Genesis: tipada, acotada, con los campos nuevos por defecto y sin rutas absolutas. PURA. */
export function normalizarPropuesta(d: unknown): PropuestaVisible | null {
    if (!esObj(d) || typeof d.id !== "string" || !d.id.trim() || typeof d.fuente !== "string" || !Object.hasOwn(NOMBRE_FUENTE, d.fuente)) return null;
    const archivos = Array.isArray(d.archivos) ? d.archivos.filter((a): a is string => typeof a === "string" && !path.isAbsolute(a) && !/^[a-z]:|(^|\/)\.\.(\/|$)|^~/i.test(a)).map((a) => a.slice(0, 200)) : [];
    const utilidad = typeof d.utilidad === "number" && Number.isFinite(d.utilidad) ? Math.min(1, Math.max(0, d.utilidad)) : 0;
    const version = typeof d.version === "number" && Number.isInteger(d.version) && d.version >= 1 ? Math.min(d.version, 999) : 1;
    const p: PropuestaVisible = {
        id: d.id.trim().slice(0, 120), fuente: d.fuente as FuentePropuesta, titulo: texto(d.titulo, 200), cuerpo: texto(d.cuerpo, 8000), archivos, utilidad,
        importancia: normalizarImportancia(d.importancia), // «critica» sin acento = «crítica» (IMG1024C)
        estado: ESTADOS_PROPUESTA.includes(d.estado as EstadoPropuesta) ? (d.estado as EstadoPropuesta) : "nueva", motivo: texto(d.motivo, 300), t: texto(d.t, 40),
        tipo: TIPOS_PROPUESTA.includes(d.tipo as TipoPropuesta) ? (d.tipo as TipoPropuesta) : "codigo",
        ambito: normalizarAmbito(d.ambito), referencias: normalizarReferencias(d.referencias), version,
    };
    if (typeof d.agente === "string" && d.agente.trim()) p.agente = d.agente.trim().slice(0, 80);
    if (typeof d.version_de === "string" && d.version_de.trim()) p.version_de = d.version_de.trim().slice(0, 120);
    const reimaginacion = normalizarReimaginacion(d.reimaginacion);
    if (reimaginacion) p.reimaginacion = reimaginacion;
    if (typeof d.tarea === "string" && d.tarea) p.tarea = d.tarea.slice(0, 80);
    if (typeof d.hasta === "string" && d.hasta) p.hasta = d.hasta.slice(0, 40);
    if (typeof d.decidida === "string" && d.decidida) p.decidida = d.decidida.slice(0, 40);
    return p;
}

/** El ítem del backend 1.58 de una propuesta de Astraura, o null si no lo tiene. PURA. */
export function itemAstraura(d: Crudo): { item_id: string; item_type: string } | null {
    const o = esObj(d.origen) ? d.origen : {};
    const tipo = TIPO_ASTRAURA[String(o.tipo ?? "")];
    return d.fuente === "astraura" && typeof o.id === "string" && o.id && tipo ? { item_id: o.id, item_type: tipo } : null;
}

/** Hasta cuándo queda pospuesta: de 1 a 720 horas, con el reloj por parámetro. PURA. */
export const posponerHasta = (ahoraMs: number, horas: number) => new Date(ahoraMs + Math.min(720, Math.max(1, horas)) * 3_600_000).toISOString();
const leerJson = (ruta: string): Promise<unknown> => readFile(ruta, "utf-8").then((t) => JSON.parse(t) as unknown, () => null);
async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
    await rename(temporal, ruta);
}
/** Lista cruda (con los campos del director: origen, cita…) y cómo volver a guardarla con su forma. */
async function leerCrudas(lugar: Lugar) {
    const crudo = await leerJson(rutasImaginacion(lugar).propuestas);
    const lista = Array.isArray(crudo) ? crudo : esObj(crudo) && Array.isArray(crudo.propuestas) ? crudo.propuestas : [];
    const guardar = (l: unknown[]) => escribirAtomico(rutasImaginacion(lugar).propuestas, esObj(crudo) ? { ...crudo, propuestas: l } : l);
    return { lista: lista as unknown[], guardar };
}
export const leerPropuestas = async (lugar: Lugar = {}): Promise<PropuestaVisible[]> =>
    (await leerCrudas(lugar)).lista.map(normalizarPropuesta).filter((p): p is PropuestaVisible => p !== null);

/** Los cambios comunes de una decisión, o el error honesto si sus datos no valen (antes de leer nada). PURA. */
function cambiosDe(hacer: HacerDecision, datos: DatosDecision, ahora: Date, por: QuienDecide): { cambios: Crudo } | { error: string } {
    if (hacer === "integrar") return { cambios: { estado: "aprobada", motivo: "" } };
    if (hacer === "rechazar") return { cambios: { estado: "rechazada", motivo: texto(datos.motivo, 300) } };
    if (hacer === "posponer") {
        const horas = datos.horas ?? Number.NaN;
        if (!Number.isFinite(horas) || horas < 1 || horas > 720) return { error: "Se pospone de 1 a 720 horas." };
        return { cambios: { estado: "pospuesta", hasta: posponerHasta(ahora.getTime(), horas) } };
    }
    const veto = vetoReimaginar(datos.notas, datos.referencias);
    if (veto) return { error: veto };
    const notas = typeof datos.notas === "string" ? datos.notas.trim().slice(0, 2000) : "";
    return { cambios: { estado: "reimaginando", reimaginacion: { notas, referencias: normalizarReferencias(datos.referencias), pedida: ahora.toISOString(), por } } };
}

/**
 * El corazón de toda decisión: una lectura, cada id por su cuenta (sin parar al primer error) y, si algo
 * cambió, una sola escritura. Integrar una de Astraura llama antes a su backend: si falla, ESA no cambia.
 */
interface Aplicado { error?: string; resultados: ResultadoId[]; cambiadas: Map<string, PropuestaVisible> }
async function aplicar(ids: string[] | "pendientes", hacer: HacerDecision, datos: DatosDecision, o: OpcionesLote): Promise<Aplicado> {
    const ahora = o.ahora ?? new Date();
    const por: QuienDecide = o.por === "automatica" ? "automatica" : "alex";
    const ambito = leerAmbito(o.ambito);
    if (ambito === null) return { error: "Ámbito desconocido: usa metagenesis, personal, grupo:<id> o pagina:<id>.", resultados: [], cambiadas: new Map() };
    const preparado = cambiosDe(hacer, datos, ahora, por);
    if ("error" in preparado) return { error: preparado.error, resultados: [], cambiadas: new Map() };
    const ajustes: AjustesAutodesarrollo = por === "automatica" ? await leerAjustes(o) : validarAjustes(null);
    const base = o.base ?? process.env.ASTRAURA_158_URL ?? "http://127.0.0.1:8000";
    const { lista, guardar } = await leerCrudas(o);
    const indice = new Map<string, number>();
    lista.forEach((d, i) => { if (esObj(d) && typeof d.id === "string" && !indice.has(d.id)) indice.set(d.id, i); });
    const enAmbito = (p: PropuestaVisible) => ambito === "todos" || p.ambito === ambito;
    const objetivo = ids === "pendientes"
        ? [...indice.entries()].filter(([, i]) => { const p = normalizarPropuesta(lista[i]); return p !== null && esDecidible(p.estado) && enAmbito(p); }).map(([id]) => id)
        : [...new Set(ids)];
    const resultados: ResultadoId[] = [];
    const cambiadas = new Map<string, PropuestaVisible>();
    for (const id of objetivo) {
        const i = indice.get(id);
        const d = i === undefined ? undefined : lista[i];
        const p = normalizarPropuesta(d);
        if (i === undefined || !esObj(d) || !p) { resultados.push({ id, ok: false, error: "No existe esa propuesta." }); continue; }
        if (!enAmbito(p)) { resultados.push({ id, ok: false, error: "Esa propuesta es de otro ámbito." }); continue; }
        const veto = vetoDecision(p, hacer, por, ajustes);
        if (veto) { resultados.push({ id, ok: false, error: veto }); continue; }
        if (hacer === "integrar" && d.fuente === "astraura") {
            const item = itemAstraura(d);
            const fallo = item ? await aplicarEnAstraura(item, base, o.hace) : "Esta propuesta de Astraura no trae su ítem del backend 1.58: no se puede aplicar.";
            if (fallo) { resultados.push({ id, ok: false, error: fallo }); continue; }
        }
        const nueva: Crudo = { ...d, ...preparado.cambios, decidida: ahora.toISOString() };
        if (hacer !== "posponer") delete nueva.hasta;
        lista[i] = nueva;
        cambiadas.set(id, normalizarPropuesta(nueva) as PropuestaVisible);
        resultados.push({ id, ok: true });
    }
    if (cambiadas.size) await guardar(lista);
    return { resultados, cambiadas };
}
async function una(id: string, hacer: HacerDecision, datos: DatosDecision, o: OpcionesDecision): Promise<Resultado> {
    const r = await aplicar([id], hacer, datos, o);
    if (r.error) return { ok: false, error: r.error };
    const propuesta = r.cambiadas.get(id);
    return propuesta ? { ok: true, propuesta } : { ok: false, error: r.resultados[0]?.error ?? "No existe esa propuesta." };
}

/** POST /api/imagination/action al backend 1.58 local; null si lo aplicó, o el error honesto. */
export async function aplicarEnAstraura(item: { item_id: string; item_type: string }, base: string, hace: typeof fetch = fetch): Promise<string | null> {
    try {
        const res = await hace(`${base.replace(/\/+$/, "")}/api/imagination/action`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, action: "apply" }), signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return `El backend 1.58 respondió HTTP ${res.status}: no se aplicó y nada cambió.`;
        const j = (await res.json().catch(() => null)) as { success?: boolean; ok?: boolean; error?: string } | null;
        if (j && (j.success === false || j.ok === false)) return `El backend 1.58 no la aplicó (${texto(j.error, 160) || "sin motivo"}): nada cambió.`;
        return null;
    } catch {
        return "El backend 1.58 no responde: no se aplicó y nada cambió.";
    }
}
/** Integrar = aprobar: «aprobada» (el director la encola) o aplicada en Astraura si es suya. */
export const aprobar = (id: string, o: OpcionesDecision = {}): Promise<Resultado> => una(id, "integrar", {}, o);
export const integrar = aprobar;
export const rechazar = (id: string, motivo = "", o: Lugar & { ahora?: Date } = {}) => una(id, "rechazar", { motivo }, o);
export const posponer = (id: string, horas: number, o: Lugar & { ahora?: Date } = {}): Promise<Resultado> => una(id, "posponer", { horas }, o);
/** Pide otra versión: notas (≤ 2000) o al menos una referencia https; si no, error honesto y nada cambia. */
export const reimaginar = (id: string, notas: string, referencias: unknown = [], por: QuienDecide = "alex", o: Omit<OpcionesDecision, "por"> = {}): Promise<Resultado> =>
    una(id, "reimaginar", { notas, referencias }, { ...o, por });
/**
 * Aplica `hacer` a varias propuestas (o a todas las decidibles del ámbito con «pendientes») con una sola
 * lectura y una sola escritura; cada id trae su resultado. `ok` = todas bien (un lote vacío está bien).
 */
export async function lote(ids: string[] | "pendientes", hacer: HacerLote, datos: DatosDecision = {}, o: OpcionesLote = {}): Promise<ResultadoLote> {
    if (ids !== "pendientes" && !ids.length) return { ok: false, resultados: [], error: "El lote no trae ids." };
    const r = await aplicar(ids, hacer, datos, o);
    if (r.error) return { ok: false, resultados: [], error: r.error };
    return { ok: r.resultados.every((x) => x.ok), resultados: r.resultados };
}
export const leerAjustes = async (lugar: Lugar = {}): Promise<AjustesAutodesarrollo> => validarAjustes(await leerJson(rutasImaginacion(lugar).ajustes));
/** Une lo nuevo a lo guardado (los objetos, campo a campo: `auto: {aprobar}` no borra el umbral) y lo valida. */
export async function guardarAjustes(nuevos: unknown, lugar: Lugar = {}): Promise<AjustesAutodesarrollo> {
    const guardados: Crudo = { ...(await leerAjustes(lugar)) };
    const unidos: Crudo = { ...guardados };
    if (esObj(nuevos)) for (const [k, v] of Object.entries(nuevos)) unidos[k] = esObj(v) && esObj(guardados[k]) ? { ...(guardados[k] as Crudo), ...v } : v;
    const ajustes = validarAjustes(unidos);
    await escribirAtomico(rutasImaginacion(lugar).ajustes, ajustes);
    return ajustes;
}
