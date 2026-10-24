/**
 * OfertaNeurona publicable de una neurona desde su inventario y sus asignaciones (RIA1023F).
 * PURA: sin red, disco, procesos ni reloj (`t` entra por opciones y por defecto es 0).
 * Modelos: `apps` como `modelo:<id>` → `<procesadorId>`; servidor propio: `servidor-ia` → 4480.
 * Alcance: privado → solo la cuenta; grupo/comunidad → su id y nunca público. Nada privado se publica.
 */
import type { OfertaNeurona } from "../recursos/oferta";
import { claveAlcance, resolverAsignacion } from "./asignaciones";
import type { Alcance, ConfigTopologia, EstadoRecursosIa, InventarioRecursos, NeuronaRecursos, Procesador } from "./tipos";
export const PUERTO_SERVIDOR_IA = 4480;

export interface OpcionesOferta {
    cuentaId: string;
    neuronaId?: string;
    alcance?: Alcance;
    topologia?: ConfigTopologia;
    medio?: string;
    energia?: OfertaNeurona["energia"];
    enlaces?: OfertaNeurona["enlaces"];
    servidorPropio?: boolean;
    puertoServidorIa?: number;
    topes?: Partial<OfertaNeurona["presta"]["topes"]>;
    /** Instante de la oferta; 0 por defecto para que la función sea determinista. */
    t?: number;
}

export type ModeloServido = { modeloId: string; procesadorId: string; almacenId: string };

const maxDe = (v: number[]) => (v.length ? Math.max(...v) : 0);
const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const RANGO: Record<Procesador["tipo"], number> = { gpu: 0, npu: 1, webgpu: 2, servidor: 3, cpu: 4 };

function neuronaDe(inv: InventarioRecursos, id?: string): NeuronaRecursos | undefined {
    return inv.neuronas.find((n) => n.id === (id ?? inv.estaNeuronaId)) ?? inv.neuronas.find((n) => n.esEsta);
}
function procesadoresDe(inv: InventarioRecursos, n: NeuronaRecursos): Procesador[] {
    return [...n.procesadores, ...inv.procesadoresSueltos.filter((p) => p.neuronaId === n.id)];
}
function mejorProcesador(procesadores: Procesador[]): Procesador | undefined {
    return [...procesadores].filter((p) => p.disponible)
        .sort((a, b) => RANGO[a.tipo] - RANGO[b.tipo] || (b.vramGb ?? 0) - (a.vramGb ?? 0) || a.id.localeCompare(b.id))[0];
}
function alcanceDe(o: OpcionesOferta): Alcance {
    return o.alcance ?? { tipo: "perfil", id: o.cuentaId, visibilidad: "privada" };
}
function topologiaDe(e: EstadoRecursosIa, o: OpcionesOferta): ConfigTopologia | undefined {
    if (o.topologia) return o.topologia;
    const clave = claveAlcance(alcanceDe(o));
    return Object.values(e.topologias).find((c) => claveAlcance(c.alcance) === clave);
}
/** El servidor propio se publica si lo pide el alcance o si un procesador de la neurona lo declara. */
function publicaServidor(o: OpcionesOferta, n: NeuronaRecursos, ps: Procesador[], top: ConfigTopologia | undefined): boolean {
    if (o.servidorPropio !== undefined) return o.servidorPropio;
    return (top?.topologia === "servidor-propio" && top.servidorNeuronaId === n.id) ||
        ps.some((p) => /servidor-ia/i.test(p.id) || p.runtimes.some((r) => /servidor-ia/i.test(r)));
}
/** Modelos que sirve ESTA neurona. Solo asignaciones del mismo alcance (lo privado no se cuela). PURA. */
export function modelosServidos(inv: InventarioRecursos, estado: EstadoRecursosIa, o: OpcionesOferta): ModeloServido[] {
    const n = neuronaDe(inv, o.neuronaId);
    if (!n) return [];
    const alcance = alcanceDe(o), ps = procesadoresDe(inv, n), porId = new Map(ps.map((p) => [p.id, p]));
    const servidor = publicaServidor(o, n, ps, topologiaDe(estado, o));
    const propios = new Set(n.almacenes.map((a) => a.id)), vistos = new Set<string>(), fuera: ModeloServido[] = [];
    for (const a of Object.values(estado.asignaciones)) {
        if (a.elemento.tipo !== "modelo" || a.alcance.tipo !== alcance.tipo || a.alcance.id !== alcance.id) continue;
        const r = resolverAsignacion(estado, a.elemento);
        const declarado = r.procesaEn && r.procesaEn !== "auto" ? porId.get(r.procesaEn) : undefined;
        if (r.procesaEn && r.procesaEn !== "auto" && !declarado) continue;
        const enEsta = propios.has(r.almacenEn) || (r.almacenEn === "auto" && servidor);
        const procesador = declarado ?? mejorProcesador(ps);
        if (!declarado && !enEsta && !servidor) continue;
        if (!procesador || vistos.has(a.elemento.id)) continue;
        vistos.add(a.elemento.id);
        fuera.push({ modeloId: a.elemento.id, procesadorId: procesador.id, almacenId: r.almacenEn });
    }
    return fuera.sort((a, b) => a.modeloId.localeCompare(b.modeloId));
}
/** Construye la oferta publicable de una neurona. PURA: misma entrada → misma salida. */
export function ofertaDesdeAsignaciones(inv: InventarioRecursos, estado: EstadoRecursosIa, o: OpcionesOferta): OfertaNeurona {
    const n = neuronaDe(inv, o.neuronaId), alcance = alcanceDe(o);
    const ps = n ? procesadoresDe(inv, n) : [];
    const servidor = !!n && publicaServidor(o, n, ps, topologiaDe(estado, o));
    const modelos = n ? modelosServidos(inv, estado, o) : [];
    const publica = alcance.visibilidad === "publica";
    const almacenes = (n?.almacenes ?? []).filter((a) =>
        a.disponible && (a.tipo === "neurona-local" || a.tipo === "disco-externo") && (!publica || !a.privado));
    const prestaMb = Math.round(almacenes.reduce((t, a) => t + (a.libreGb ?? 0) * 1024, 0));
    const nucleos = Math.round(maxDe(ps.map((p) => p.nucleos ?? 0)));
    const ramLibreMb = Math.round(maxDe(ps.map((p) => (p.ramLibreGb ?? p.ramGb ?? 0) * 1024)));
    const gpu = ps.some((p) => p.tipo === "gpu" || p.tipo === "npu" || p.tipo === "webgpu");
    const vramMb = Math.round(maxDe(ps.map((p) => p.vramGb ?? 0)) * 1024);
    const motores = unicos([...ps.flatMap((p) => p.runtimes), ...(servidor ? ["servidor-ia"] : [])]).sort();
    const apps = modelos.map((m) => ({ id: `modelo:${m.modeloId}`, version: m.procesadorId }));
    if (servidor) apps.push({ id: "servidor-ia", version: String(o.puertoServidorIa ?? PUERTO_SERVIDOR_IA) });
    apps.sort((a, b) => a.id.localeCompare(b.id));
    const grupos = publica && (alcance.tipo === "grupo" || alcance.tipo === "comunidad") ? [alcance.id] : [];
    return {
        nodoId: n?.id ?? o.neuronaId ?? inv.estaNeuronaId,
        cuentaId: o.cuentaId,
        medio: o.medio ?? n?.vias[0] ?? "desconocido",
        computo: { nucleos, ramLibreMb, gpu, ...(vramMb > 0 ? { vramMb } : {}), motores },
        almacen: { prestaMb, volumenes: almacenes.map((a) => a.id) },
        apps,
        enlaces: o.enlaces ?? {},
        energia: o.energia ?? { enUso: false },
        presta: {
            cuenta: true, // la oferta es de la cuenta; lo privado no pasa de ahí
            grupos,
            publico: publica && alcance.tipo === "perfil",
            topes: {
                cpuPct: o.topes?.cpuPct ?? 100,
                ramMb: o.topes?.ramMb ?? ramLibreMb,
                discoMb: o.topes?.discoMb ?? prestaMb,
                ...(o.topes?.horas ? { horas: o.topes.horas } : {}),
                soloCargando: o.topes?.soloCargando ?? false,
            },
        },
        t: o.t ?? 0,
    };
}
