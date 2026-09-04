/**
 * Ramificación multiagéntica (Ola 241 · Puente de Mando · solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * El árbol vivo de cada ola: tareas → dependencias → agente que la escribe (modelo,
 * proveedor, fase, tokens reales, ventana) → revisor → commit. Lo consume la pestaña
 * «Procesos» del Puente de Mando (`ramificacion-agentes.tsx`) y `GET /api/mando/ramificacion`.
 *
 * Fuentes, en este orden de verdad:
 *  1. Las colas del disco (`olas/cola-*.json`): estructura (tareas, dependencias, títulos).
 *  2. `olas/progreso.json` y `olas/pasos/<id>.jsonl` de ESTA máquina.
 *  3. El bus `relevo_eventos` (Supabase): lo que hicieron los orquestadores de la Mac y de
 *     la nube (inicio, paso, commit, fallo…). Sin el bus, una ola que corre en el contenedor
 *     de Cowork sería invisible desde la Mac, porque su progreso.json vive allí.
 *  4. Los latidos (Mac + bus): qué está haciendo cada agente AHORA.
 *
 * Tolerante: cualquier fuente que falte se ignora y el árbol se construye con el resto.
 * ⚠️ Seguridad: no devuelve claves ni rutas absolutas; solo identificadores de trabajo.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
    leerColas,
    leerLatidos,
    leerLatidosDelBus,
    leerProgreso,
} from "@/lib/mando/lector-local";
import type { FotoEnjambre, LatidoTarea, TareaOla } from "@/lib/mando/tipos";

/** Un paso registrado de una tarea (escritura, tsc, tests, revision, integracion). */
export interface PasoRama {
    t: string;
    paso: string;
    donde: string;
    datos: Record<string, string | number | boolean>;
}

/** Un evento del bus relacionado con la tarea (inicio, aviso, reenrutado, proveedor…). */
export interface EventoRama {
    t: string;
    tipo: string;
    texto: string;
    donde: string;
}

/** Una tarea dentro del árbol de su ola, con todo lo que se sabe de ella. */
export interface RamaTarea {
    id: string;
    ola: string;
    titulo: string;
    dependencias: string[];
    /** pendiente · en_curso · commit · sin_cambios · fallo · fallo_tsc · fallo_tests · conflicto · bloqueante */
    estado: string;
    /** Profundidad por dependencias (0 = sin dependencias). */
    nivel: number;
    /** Dónde corrió o corre: mac · nube · null si nunca empezó. */
    donde: string | null;
    modelo: string;
    proveedor: string;
    revisor: string;
    sha: string;
    nota: string;
    segundos: number;
    modelosFallidos: string[];
    pasos: PasoRama[];
    eventos: EventoRama[];
    /** Latido si un agente la tiene entre manos ahora mismo. */
    vivo: LatidoTarea | null;
}

/** Una ola con su árbol de tareas y el recuento. */
export interface RamaOla {
    id: string;
    numero: number;
    tareas: RamaTarea[];
    total: number;
    hechas: number;
    enCurso: number;
    fallidas: number;
    sinCambios: number;
    pendientes: number;
    /** true si algún agente está latiendo en esta ola. */
    viva: boolean;
}

/** Lo que devuelve `GET /api/mando/ramificacion`. */
export interface Ramificacion {
    generadoEn: string;
    olas: RamaOla[];
    latidos: LatidoTarea[];
    enjambres: FotoEnjambre[];
    /** Cuántas olas hay en total en disco (por si el cliente quiere pedir más). */
    olasEnDisco: number;
}

const RAÍZ = process.cwd();
const TIPOS_BUS = [
    "inicio", "paso", "commit", "bloqueante", "fallo", "sin_cambios", "conflicto",
    "reintento", "reenrutado", "proveedor", "aviso", "estancado", "cola_terminada",
];
const TERMINALES = new Set(["commit", "bloqueante", "sin_cambios", "fallo", "conflicto"]);
const PREFIJO_PROVEEDOR: Record<string, string> = { nvidia: "nim" };

function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}
function número(v: unknown, alternativo: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : alternativo;
}
function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function plano(v: Record<string, unknown>): Record<string, string | number | boolean> {
    const salida: Record<string, string | number | boolean> = {};
    for (const [k, val] of Object.entries(v)) {
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") salida[k] = val;
    }
    return salida;
}

/** Proveedor a partir del id del modelo (`nvidia/…` → nim, `xkiro/…` → xkiro). */
export function proveedorDe(modelo: string): string {
    const p = modelo.split("/", 1)[0] ?? "";
    return PREFIJO_PROVEEDOR[p] ?? p;
}

/** Número de ola extraído de su etiqueta («Ola 240 · estudio de voces» → 240). */
export function numeroOla(etiqueta: string): number {
    const m = /(\d{2,4})/.exec(etiqueta);
    return m ? Number.parseInt(m[1], 10) : 0;
}

/** Pasos locales: `olas/pasos/<id>.jsonl` (una línea JSON por paso). */
async function leerPasosLocales(): Promise<Map<string, PasoRama[]>> {
    const salida = new Map<string, PasoRama[]>();
    for (const dir of ["starseed_memory_root/olas/pasos", "olas/pasos"]) {
        let nombres: string[] = [];
        try {
            nombres = (await readdir(path.join(RAÍZ, dir))).filter((n) => n.endsWith(".jsonl"));
        } catch {
            continue;
        }
        for (const nombre of nombres) {
            const id = nombre.replace(/\.jsonl$/, "");
            try {
                const contenido = await readFile(path.join(RAÍZ, dir, nombre), "utf-8");
                const pasos: PasoRama[] = [];
                for (const linea of contenido.split("\n")) {
                    if (!linea.trim()) continue;
                    try {
                        const d = objeto(JSON.parse(linea));
                        const { t, tarea: _tarea, paso, ...resto } = d;
                        void _tarea;
                        pasos.push({ t: texto(t), paso: texto(paso), donde: "mac", datos: plano(resto) });
                    } catch {
                        // línea corrupta: se salta
                    }
                }
                if (pasos.length) salida.set(id, pasos);
            } catch {
                // sin archivo
            }
        }
        break;
    }
    return salida;
}

interface FilaBus {
    id: number;
    t: string;
    quien: string;
    tipo: string;
    tarea: string;
    texto: string;
    datos: unknown;
}

/** Eventos del bus de las últimas `horas` horas, más antiguos primero. */
async function leerBus(horas: number): Promise<FilaBus[]> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return [];
    try {
        const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
        const tipos = TIPOS_BUS.join(",");
        const r = await fetch(
            `${url}/rest/v1/relevo_eventos?select=id,t,quien,tipo,tarea,texto,datos&tipo=in.(${tipos})&t=gte.${encodeURIComponent(desde)}&order=id.desc&limit=2000`,
            { headers: { apikey: clave, Authorization: `Bearer ${clave}` }, cache: "no-store" },
        );
        if (!r.ok) return [];
        const filas = (await r.json()) as unknown;
        return Array.isArray(filas)
            ? (filas as unknown[]).map((f) => {
                  const d = objeto(f);
                  return {
                      id: número(d.id, 0),
                      t: texto(d.t),
                      quien: texto(d.quien),
                      tipo: texto(d.tipo),
                      tarea: texto(d.tarea),
                      texto: texto(d.texto),
                      datos: d.datos,
                  };
              }).reverse()
            : [];
    } catch {
        return [];
    }
}

/** Nivel de cada tarea por dependencias (0 = raíz); los ciclos se cortan en 0. */
function niveles(tareas: TareaOla[]): Map<string, number> {
    const porId = new Map(tareas.map((t) => [t.id, t]));
    const memo = new Map<string, number>();
    const visitando = new Set<string>();
    const nivel = (id: string): number => {
        const previo = memo.get(id);
        if (previo !== undefined) return previo;
        if (visitando.has(id)) return 0;
        visitando.add(id);
        const t = porId.get(id);
        let n = 0;
        for (const dep of t?.dependencias ?? []) {
            if (porId.has(dep)) n = Math.max(n, nivel(dep) + 1);
        }
        visitando.delete(id);
        memo.set(id, n);
        return n;
    };
    for (const t of tareas) nivel(t.id);
    return memo;
}

/**
 * Construye la ramificación de las `cuantas` olas más recientes (por número), leyendo disco,
 * bus y latidos. `horasBus` acota cuánto historial del bus se cruza (por defecto 72 h).
 */
export async function construirRamificacion(cuantas = 4, horasBus = 72): Promise<Ramificacion> {
    const [tareas, progreso, pasosLocales, bus, latidosMac, delBus] = await Promise.all([
        leerColas(),
        leerProgreso(),
        leerPasosLocales(),
        leerBus(horasBus),
        leerLatidos(),
        leerLatidosDelBus(),
    ]);

    // Latidos: lo local manda sobre el bus para la misma tarea; la nube se añade.
    const idsMac = new Set(latidosMac.map((l) => `${l.cola}|${l.tarea}`));
    const latidos = [
        ...latidosMac,
        ...delBus.latidos.filter((l) => l.donde !== "mac" || !idsMac.has(`${l.cola}|${l.tarea}`)),
    ];
    const vivoPor = new Map<string, LatidoTarea>();
    for (const l of latidos) vivoPor.set(l.tarea, l);

    // Bus por tarea, en orden cronológico.
    const busPor = new Map<string, FilaBus[]>();
    for (const f of bus) {
        if (!f.tarea) continue;
        const lista = busPor.get(f.tarea) ?? [];
        lista.push(f);
        busPor.set(f.tarea, lista);
    }

    // Agrupar por ola y quedarse con las más recientes.
    const porOla = new Map<string, TareaOla[]>();
    for (const t of tareas) {
        const clave = t.ola || t.id;
        const lista = porOla.get(clave) ?? [];
        lista.push(t);
        porOla.set(clave, lista);
    }
    const etiquetas = [...porOla.keys()].sort((a, b) => numeroOla(a) - numeroOla(b) || a.localeCompare(b));
    const elegidas = etiquetas.slice(-Math.max(1, cuantas));

    const olas: RamaOla[] = [];
    for (const etiqueta of elegidas) {
        const lista = porOla.get(etiqueta) ?? [];
        const nivelDe = niveles(lista);
        const ramas: RamaTarea[] = [];
        for (const t of lista) {
            const prog = objeto(progreso[t.id]);
            const eventos = busPor.get(t.id) ?? [];
            const vivo = vivoPor.get(t.id) ?? null;

            // Estado: local si es terminal; si no, el último evento terminal del bus; si no,
            // en_curso si hay latido o un «inicio» reciente sin cierre; si no, pendiente.
            let estado = texto(prog.estado);
            let donde: string | null = Object.keys(prog).length ? "mac" : null;
            let modelo = texto(prog.modelo);
            let nota = texto(prog.nota);
            let segundos = número(prog.segundos, 0);
            let sha = "";
            let revisor = "";
            const pasos: PasoRama[] = [...(pasosLocales.get(t.id) ?? [])];
            const eventosRama: EventoRama[] = [];

            let ultimoTerminal: FilaBus | null = null;
            let ultimoInicio: FilaBus | null = null;
            for (const e of eventos) {
                const d = objeto(e.datos);
                const dondeEv = texto(d.donde) || "mac";
                if (e.tipo === "paso") {
                    const nombre = e.texto.split(" · ")[0]?.trim() ?? "paso";
                    const { donde: _d, categoria: _c, ...resto } = d;
                    void _d; void _c;
                    const datos = plano(resto);
                    // Un paso local ya registrado no se duplica desde el bus.
                    const yaLocal = pasos.some((p) => p.paso === nombre && p.t.slice(0, 16) === e.t.slice(0, 16));
                    if (!yaLocal) pasos.push({ t: e.t, paso: nombre, donde: dondeEv, datos });
                    if (nombre === "escritura" && typeof datos.modelo === "string") modelo = datos.modelo;
                    if (nombre === "revision" && typeof datos.revisor === "string") revisor = datos.revisor;
                    if (nombre === "integracion" && typeof datos.sha === "string") sha = datos.sha;
                    if (typeof datos.segundos_total === "number") segundos = datos.segundos_total;
                    continue;
                }
                eventosRama.push({ t: e.t, tipo: e.tipo, texto: e.texto, donde: dondeEv });
                if (e.tipo === "inicio") ultimoInicio = e;
                if (TERMINALES.has(e.tipo)) ultimoTerminal = e;
            }
            // Pasos locales también aportan modelo/revisor/sha.
            for (const p of pasos) {
                if (p.paso === "escritura" && typeof p.datos.modelo === "string" && !modelo) modelo = p.datos.modelo;
                if (p.paso === "revision" && typeof p.datos.revisor === "string" && !revisor) revisor = p.datos.revisor;
                if (p.paso === "integracion" && typeof p.datos.sha === "string" && !sha) sha = p.datos.sha;
            }

            const localTerminal = TERMINALES.has(estado) || estado.startsWith("fallo");
            if (ultimoTerminal && (!localTerminal || (ultimoTerminal.tipo === "commit" && estado !== "commit"))) {
                // El bus tiene un cierre y lo local no (o el bus dice «commit» y lo local no): el
                // cierre del bus manda, porque esa tarea la hizo un orquestador de otra máquina.
                estado = ultimoTerminal.tipo === "commit" ? "commit" : ultimoTerminal.tipo;
                donde = texto(objeto(ultimoTerminal.datos).donde) || donde || "mac";
                if (!nota) nota = ultimoTerminal.texto.slice(0, 160);
            } else if (localTerminal) {
                // lo local ya lo dice
            } else if (vivo) {
                estado = "en_curso";
                donde = vivo.donde;
            } else if (ultimoInicio && (!ultimoTerminal || ultimoInicio.id > ultimoTerminal.id)) {
                // Empezó y no hay cierre: solo cuenta como en curso si el inicio es reciente (<3 h);
                // si no, el orquestador murió y la tarea vuelve a estar pendiente.
                const hace = Date.now() - new Date(ultimoInicio.t).getTime();
                estado = hace < 3 * 3600 * 1000 ? "en_curso" : "pendiente";
                donde = texto(objeto(ultimoInicio.datos).donde) || donde;
            } else if (!estado) {
                estado = "pendiente";
            }
            // Un commit cuya revisión fue bloqueante se marca así (lo dice la nota o el evento).
            if (estado === "commit" && /bloqueante/.test(nota) && !/no bloqueante|revisión ok/.test(nota)) estado = "bloqueante";
            if (vivo && !modelo) modelo = vivo.modelo;
            if (!sha && estado === "commit") {
                const m = /^([0-9a-f]{7,10})\b/.exec(nota);
                if (m) sha = m[1];
            }

            const fallidosBruto = Array.isArray(prog.modelos_fallidos) ? (prog.modelos_fallidos as unknown[]) : [];
            ramas.push({
                id: t.id,
                ola: etiqueta,
                titulo: t.titulo,
                dependencias: t.dependencias,
                estado,
                nivel: nivelDe.get(t.id) ?? 0,
                donde,
                modelo,
                proveedor: modelo ? proveedorDe(modelo) : "",
                revisor,
                sha,
                nota,
                segundos,
                modelosFallidos: fallidosBruto.map((m) => texto(m)).filter(Boolean),
                pasos: pasos.sort((a, b) => a.t.localeCompare(b.t)),
                eventos: eventosRama.slice(-12),
                vivo,
            });
        }
        ramas.sort((a, b) => a.nivel - b.nivel || a.id.localeCompare(b.id, undefined, { numeric: true }));
        const cuenta = (pred: (r: RamaTarea) => boolean): number => ramas.filter(pred).length;
        olas.push({
            id: etiqueta,
            numero: numeroOla(etiqueta),
            tareas: ramas,
            total: ramas.length,
            hechas: cuenta((r) => r.estado === "commit" || r.estado === "bloqueante"),
            enCurso: cuenta((r) => r.estado === "en_curso"),
            fallidas: cuenta((r) => r.estado.startsWith("fallo") || r.estado === "conflicto"),
            sinCambios: cuenta((r) => r.estado === "sin_cambios" || r.estado === "sustituida"),
            pendientes: cuenta((r) => r.estado === "pendiente"),
            viva: ramas.some((r) => r.vivo !== null),
        });
    }
    // Las olas vivas primero; después, las más recientes.
    olas.sort((a, b) => Number(b.viva) - Number(a.viva) || b.numero - a.numero);

    return {
        generadoEn: new Date().toISOString(),
        olas,
        latidos,
        enjambres: delBus.enjambres,
        olasEnDisco: etiquetas.length,
    };
}
