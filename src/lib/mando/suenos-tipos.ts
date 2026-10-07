/**
 * Sueños profundos · tipos y lógica PURA (2026-09-29 · Genesis)
 * ─────────────────────────────────────────────────────────────────────────────
 * Una flota de analistas gratuitos (tareas `tipo: "analisis"` del enjambre) sueña cada área
 * de StarSeed OS con seis lentes y deja un informe por área × lente en
 * `starseed_memory_root/dream/profundo/<fecha>/`; los supervisores Claude los verifican con
 * `scripts/puente/suenos.py veredicto` y `consolidar` los funde en `INFORME.md` y en una cola
 * propuesta que NO se lanza sola. SOP: `architecture/suenos-profundos.md`.
 *
 * Este módulo no importa nada de Node: lo usan el panel (cliente) y `suenos.ts` (servidor).
 * La misma derivación de estados que `suenos.py estado`, para que la terminal y Genesis
 * digan lo mismo del mismo sueño.
 */

import { AREAS_TRABAJO } from "@/lib/mando/areas";

/** Las seis lentes (copia de `LENTES` en scripts/enjambre/analista.py: una prueba vigila que no se separen). */
export const LENTES_SUENOS = [
    { id: "arquitectura-deuda", nombre: "Arquitectura y deuda" },
    { id: "ux-accesibilidad-diseno", nombre: "UX y accesibilidad" },
    { id: "rendimiento-consumo", nombre: "Rendimiento y consumo" },
    { id: "seguridad-privacidad", nombre: "Seguridad (privada)" },
    { id: "pruebas-fiabilidad", nombre: "Pruebas y fiabilidad" },
    { id: "coherencia-triada", nombre: "Coherencia con la Tríada" },
] as const;

/** Áreas de la orquestación que no están en `AREAS_TRABAJO` (copia de `AREAS_EXTRA` de suenos_areas.py). */
export const AREAS_EXTRA_SUENOS = [
    { id: "mando", nombre: "Genesis y orquestación" },
    { id: "dashboards", nombre: "Dashboards y widgets" },
    { id: "gobernanza", nombre: "Gobernanza y Hub" },
] as const;

export interface OpcionSueno {
    id: string;
    nombre: string;
}

/** Las áreas que se pueden soñar, en el orden del planificador. */
export function areasSuenos(): OpcionSueno[] {
    const base = AREAS_TRABAJO.map((a) => ({ id: a.id, nombre: a.nombre }));
    const vistas = new Set(base.map((a) => a.id));
    return [...base, ...AREAS_EXTRA_SUENOS.filter((a) => !vistas.has(a.id)).map((a) => ({ id: a.id, nombre: a.nombre }))];
}

export const ESTADOS_SUENO = [
    "pendiente",
    "analizando",
    "informe",
    "verificado",
    "ajustado",
    "rechazado",
    "fallo",
    "interrumpida",
] as const;
export type EstadoSueno = (typeof ESTADOS_SUENO)[number];
export const ESTADOS_VEREDICTO = new Set<EstadoSueno>(["verificado", "ajustado", "rechazado"]);

/** Una celda de la rejilla área × lente. */
export interface FilaSueno {
    id: string;
    area: string;
    lente: string;
    estado: EstadoSueno;
    privado: boolean;
    modelo: string;
    proveedor: string;
    /** Qué hace ahora el analista: «lectura 3/9 · llm7/gpt-oss», «pausa · ritmo del plan»… */
    subfase: string;
    /** Tokens ESTIMADOS (3 caracteres por token, como limite_proveedor.py). */
    tokens: number;
    llamadas: number;
    segundos: number;
    hallazgos: number;
    /** Quién lo verificó (claude-…), si hay veredicto. */
    por: string;
    nota: string;
}

/** Una recomendación ya ordenada por `director_suenos.py` (consolidado.json). */
export interface RecomendacionSueno {
    titulo: string;
    area: string;
    lente: string;
    archivo: string;
    linea: number;
    impacto: number;
    esfuerzo: number;
    confianza: number;
    verificacion: string;
    por: string;
    capacidad: boolean;
    privado: boolean;
    puntuacion: number;
    tarea: string;
    apariciones: number;
    yaEncargada: boolean;
    seccion: string;
    propuesta: string;
    /** ¿Se puede encargar? (regla determinista, con el veto de Jev si lo hubo). */
    accionable: boolean;
    /** alta · media · baja (regla, o Jev cuando su confianza pasa de 0,6). */
    prioridad: string;
    /** Qué dijo el consejero: «alta · 0.93 (local)», «regla: media», «… · VETO». */
    jev: string;
}

export interface ConsolidadoSueno {
    generado: string;
    resumen: string;
    propuestas: number;
    cuentas: Record<string, number>;
    top: RecomendacionSueno[];
}

export interface SesionSuenos {
    sesion: string;
    total: number;
    cuentas: Partial<Record<EstadoSueno, number>>;
    filas: FilaSueno[];
    tokens: number;
    completa: boolean;
    orquestadorVivo: boolean;
    informeFinal: boolean;
    /** Contenido de INFORME.md, solo si se pidió (`?informe=1`). */
    informeMd: string | null;
    /** La cola propuesta (NO lanzada), para abrirla en el Diseñador de olas. */
    propuesta: { nombre: string; tareas: number } | null;
    consolidado: ConsolidadoSueno | null;
    ultimoLanzamiento: { t: string; horas: number; por: string } | null;
}

export interface DatosSuenos {
    sesiones: string[];
    sesion: SesionSuenos | null;
    areas: OpcionSueno[];
    lentes: OpcionSueno[];
}

// ─────────────────────────────── utilidades ───────────────────────────────

function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}
function numero(v: unknown, alternativo = 0): number {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : alternativo;
}

export const PATRON_SESION = /^\d{4}-\d{2}-\d{2}$/;

/** Veredictos de `verificaciones.jsonl`: el último de cada tarea manda. Tolera líneas rotas. */
export function leerVeredictos(contenido: string): Map<string, { estado: EstadoSueno; por: string; nota: string }> {
    const fuera = new Map<string, { estado: EstadoSueno; por: string; nota: string }>();
    for (const linea of (contenido || "").split("\n")) {
        if (!linea.trim()) continue;
        try {
            const d = objeto(JSON.parse(linea));
            const tarea = texto(d.tarea);
            const estado = texto(d.estado) as EstadoSueno;
            if (!tarea || !ESTADOS_VEREDICTO.has(estado)) continue;
            fuera.set(tarea, { estado, por: texto(d.por) || fuera.get(tarea)?.por || "", nota: texto(d.nota).slice(0, 300) });
        } catch {
            // línea rota: se salta
        }
    }
    return fuera;
}

/** El estado de UN sueño, con la misma precedencia que `suenos.py estado`. PURA. */
export function estadoDeSueno(e: {
    veredicto?: EstadoSueno | null;
    hayInforme: boolean;
    faseLatido?: string | null;
    estadoProgreso?: string | null;
    orquestadorVivo: boolean;
}): EstadoSueno {
    if (e.veredicto && ESTADOS_VEREDICTO.has(e.veredicto)) return e.veredicto;
    if (e.hayInforme) return "informe";
    if (e.faseLatido === "analizando") return "analizando";
    const prog = e.estadoProgreso ?? "";
    if (prog.startsWith("fallo")) return "fallo";
    if (prog === "en_curso") return e.orquestadorVivo ? "analizando" : "interrumpida";
    return "pendiente";
}

export interface EntradaFilas {
    tareas: unknown[];
    /** Informes (`<área>--<lente>.json`) por id de tarea. */
    informes: Record<string, unknown>;
    veredictos: Map<string, { estado: EstadoSueno; por: string; nota: string }>;
    progreso: Record<string, unknown>;
    /** Latidos frescos por id de tarea (de `olas/latidos-*.json`). */
    latidos: Record<string, unknown>;
    orquestadorVivo: boolean;
    ahoraMs: number;
}

/** Las filas de la rejilla de una sesión. Solo tareas `tipo: "analisis"`. PURA. */
export function filasDeSesion(e: EntradaFilas): FilaSueno[] {
    const fuera: FilaSueno[] = [];
    for (const bruto of e.tareas) {
        const t = objeto(bruto);
        const id = texto(t.id);
        if (!id || t.tipo !== "analisis") continue;
        const inf = e.informes[id] ? objeto(e.informes[id]) : null;
        const ver = e.veredictos.get(id) ?? null;
        const lat = e.latidos[id] ? objeto(e.latidos[id]) : null;
        const prog = objeto(e.progreso[id]);
        const estado = estadoDeSueno({
            veredicto: ver?.estado ?? null,
            hayInforme: Boolean(inf),
            faseLatido: lat ? texto(lat.fase) : null,
            estadoProgreso: texto(prog.estado) || null,
            orquestadorVivo: e.orquestadorVivo,
        });
        const modelos = objeto(inf?.modelos);
        const tokens = objeto(inf ? inf.tokens : lat?.tokens);
        const modelo = texto(modelos.sintesis) || texto(lat?.modelo) || texto(prog.modelo);
        const desde = numero(lat?.desde, 0);
        fuera.push({
            id,
            area: texto(t.area),
            lente: texto(t.lente),
            estado,
            privado: t.privado === true || texto(t.lente) === "seguridad-privacidad",
            modelo,
            proveedor: modelo ? (modelo.split("/", 1)[0] ?? "") : "",
            subfase: texto(lat?.subfase).slice(0, 80),
            tokens: numero(tokens.entrada) + numero(tokens.salida),
            llamadas: numero(tokens.llamadas),
            segundos: Math.max(0, Math.round(
                numero(inf?.segundos) || numero(prog.segundos) || (desde ? e.ahoraMs / 1000 - desde : 0),
            )),
            hallazgos: Array.isArray(inf?.hallazgos) ? (inf?.hallazgos as unknown[]).length : 0,
            por: ver?.por ?? "",
            nota: estado === "fallo" || estado === "interrumpida" ? texto(prog.nota).slice(0, 160) : "",
        });
    }
    return fuera;
}

/** Recuento por estado. PURA. */
export function contarEstados(filas: FilaSueno[]): Partial<Record<EstadoSueno, number>> {
    const c: Partial<Record<EstadoSueno, number>> = {};
    for (const f of filas) c[f.estado] = (c[f.estado] ?? 0) + 1;
    return c;
}

/** consolidado.json → recomendaciones tipadas (tolerante con campos que falten). PURA. */
export function consolidadoDe(bruto: unknown): ConsolidadoSueno | null {
    const d = objeto(bruto);
    if (!Array.isArray(d.top)) return null;
    const cuentas: Record<string, number> = {};
    for (const [k, v] of Object.entries(objeto(d.cuentas))) cuentas[k] = numero(v);
    return {
        generado: texto(d.generado),
        resumen: texto(d.resumen).slice(0, 1200),
        propuestas: numero(d.propuestas),
        cuentas,
        top: (d.top as unknown[]).map((x) => {
            const u = objeto(x);
            return {
                titulo: texto(u.titulo).slice(0, 200),
                area: texto(u.area),
                lente: texto(u.lente),
                archivo: texto(u.archivo).replace(/^\/+/, "").slice(0, 200),
                linea: numero(u.linea),
                impacto: numero(u.impacto),
                esfuerzo: numero(u.esfuerzo),
                confianza: numero(u.confianza),
                verificacion: texto(u.verificacion) || "sin_verificar",
                por: texto(u.por),
                capacidad: u.capacidad === true,
                privado: u.privado === true,
                puntuacion: numero(u.puntuacion),
                tarea: texto(u.tarea),
                apariciones: Math.max(1, numero(u.apariciones, 1)),
                yaEncargada: u.ya_encargada === true,
                seccion: texto(u.seccion),
                propuesta: texto(u.propuesta).slice(0, 200),
                accionable: u.accionable !== false,
                prioridad: texto(u.prioridad),
                jev: texto(u.jev).slice(0, 80),
            };
        }),
    };
}

export interface PeticionLanzar {
    horas: number;
    areas: string[];
    lentes: string[];
}

/** Valida lo que manda el diálogo de lanzamiento: horas 0-12, áreas y lentes conocidas. PURA. */
export function validarLanzamiento(bruto: unknown): { ok: true; valor: PeticionLanzar } | { ok: false; error: string } {
    const d = objeto(bruto);
    const horas = numero(d.horas, 0);
    if (horas < 0 || horas > 12) return { ok: false, error: "Las horas van de 0 (tan rápido como dejen los cupos) a 12." };
    const conocidasA = new Set(areasSuenos().map((a) => a.id));
    const conocidasL = new Set<string>(LENTES_SUENOS.map((l) => l.id));
    const lista = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : []);
    const areas = lista(d.areas);
    const lentes = lista(d.lentes);
    const malasA = areas.filter((a) => !conocidasA.has(a));
    const malasL = lentes.filter((l) => !conocidasL.has(l));
    if (malasA.length) return { ok: false, error: `Áreas desconocidas: ${malasA.join(", ")}.` };
    if (malasL.length) return { ok: false, error: `Lentes desconocidas: ${malasL.join(", ")}.` };
    return { ok: true, valor: { horas: Math.round(horas * 4) / 4, areas, lentes } };
}

/** Tono de una celda por estado (claves de color del panel). PURA. */
export function tonoSueno(estado: EstadoSueno): "ok" | "vivo" | "espera" | "mal" | "neutro" {
    if (estado === "verificado" || estado === "ajustado") return "ok";
    if (estado === "analizando") return "vivo";
    if (estado === "informe") return "espera";
    if (estado === "fallo" || estado === "rechazado" || estado === "interrumpida") return "mal";
    return "neutro";
}
