/**
 * La oferta de esta neurona para la bolsa de recursos, publicada desde sus asignaciones de
 * Recursos de IA (SOP `architecture/recursos-ia-neurona.md` §2 y §6 · tarea RIA1023F).
 *
 * PURA: inventario + estado asignado → `OfertaNeurona` (`src/lib/recursos/oferta.ts`).
 * Qué modelos sirve y por qué procesador sale de las asignaciones (`procesaEn`) y de lo
 * instalado; su servidor propio de IA (Hono, puerto 4480) se presta solo si la topología
 * `servidor-propio` la nombra; nada privado sale con alcance público (§3).
 */
import type { OfertaNeurona } from "@/lib/recursos/oferta";
import { resolverAsignacion } from "./asignaciones";
import {
    VIA_REFERENCIA,
    type Alcance,
    type ConfigTopologia,
    type EstadoRecursosIa,
    type InventarioRecursos,
    type Procesador,
    type Via,
} from "./tipos";

/** El motor del servidor propio de IA de la neurona que sirve a la cuenta (puerto 4480). */
export const MOTOR_SERVIDOR_IA = "servidor-ia:4480";

/** Un modelo que esta neurona sirve en un procesador suyo, con el alcance de su asignación. */
export interface ServicioIA {
    modeloId: string;
    procesadorId: string;
    alcance?: Alcance;
    /** Ya está en la neurona (`modelosInstalados`): no viene de una asignación. */
    instalado?: boolean;
}

/** Contexto para publicar la oferta: la cuenta dueña y el instante de publicación. */
export interface ContextoOferta {
    cuentaId: string;
    ahora: number;
}

/** Alcance → permiso de préstamo: perfil = la cuenta; grupo/comunidad = sus ids; público solo comunidad pública. PURA. */
function entraEnPresta(a: Alcance, p: { cuenta: boolean; grupos: Set<string>; publico: boolean }): void {
    if (a.tipo === "perfil") p.cuenta = true;
    else p.grupos.add(a.id);
    if (a.tipo === "comunidad" && a.visibilidad === "publica") p.publico = true;
}

/** Qué modelos sirve esta neurona y por qué procesador. PURA. */
export function serviciosDeIA(inv: InventarioRecursos, estado: EstadoRecursosIa): ServicioIA[] {
    const n = inv.neuronas.find((x) => x.id === inv.estaNeuronaId);
    if (!n) return [];
    const ids = new Set(n.procesadores.map((p) => p.id));
    const out: ServicioIA[] = [];
    for (const a of Object.values(estado.asignaciones)) {
        if (a.elemento.tipo !== "modelo") continue;
        const res = resolverAsignacion(estado, a.elemento);
        if (!(res.procesaEn && ids.has(res.procesaEn))) continue;
        out.push({ modeloId: a.elemento.id, procesadorId: res.procesaEn, alcance: a.alcance });
    }
    for (const mi of inv.modelosInstalados ?? []) {
        if (mi.procesadorId && ids.has(mi.procesadorId)) out.push({ modeloId: mi.modeloId, procesadorId: mi.procesadorId, instalado: true });
    }
    return out;
}

/** La topología «servidor propio» que nombra a esta neurona, si la hay. PURA. */
export function servidorPropioDe(estado: EstadoRecursosIa, neuronaId: string): ConfigTopologia | null {
    for (const c of Object.values(estado.topologias)) {
        if (c.topologia === "servidor-propio" && c.servidorNeuronaId === neuronaId) return c;
    }
    return null;
}

/** La oferta de esta neurona. PURA. */
export function ofertaDesdeAsignaciones(
    inv: InventarioRecursos,
    estado: EstadoRecursosIa,
    ctx: ContextoOferta,
): OfertaNeurona {
    const n = inv.neuronas.find((x) => x.id === inv.estaNeuronaId) ?? null;
    const procs: Procesador[] = n?.procesadores ?? [];
    const servicios = n ? serviciosDeIA(inv, estado) : [];
    const propio = n ? servidorPropioDe(estado, n.id) : null;

    const nucleos = procs.reduce((s, p) => s + (p.tipo === "cpu" ? (p.nucleos ?? 0) : 0), 0);
    const ramLibreMb = Math.round(procs.reduce((m, p) => Math.max(m, p.ramLibreGb ?? 0), 0) * 1024);
    const vramMb = Math.round(procs.reduce((s, p) => s + (p.vramGb ?? 0), 0) * 1024);
    const gpu = procs.some((p) => p.tipo === "gpu" || p.tipo === "webgpu");

    const alms = (n?.almacenes ?? []).filter((a) => a.disponible);
    const prestaMb = Math.round(alms.reduce((s, a) => s + (a.libreGb ?? a.totalGb ?? 0), 0) * 1024);
    const volumenes = alms.map((a) => a.id);
    const vias: Via[] = n?.vias?.length ? n.vias : ["local"];

    // El préstamo: la propia cuenta siempre; grupo/comunidad según la asignación; lo privado
    // NUNCA sale al público (§3), solo una comunidad declarada pública lo permite.
    const prestaBase = { cuenta: true, grupos: new Set<string>(), publico: false };
    const alcances: Alcance[] = [propio?.alcance, ...servicios.flatMap((s) => (s.alcance ? [s.alcance] : []))].filter(
        (x): x is Alcance => !!x,
    );
    for (const a of alcances) entraEnPresta(a, prestaBase);

    const motores = [...new Set([
        ...procs.flatMap((p) => p.runtimes),
        ...servicios.map((s) => s.modeloId),
        ...(propio ? [MOTOR_SERVIDOR_IA] : []),
    ])];
    return {
        nodoId: n?.id ?? "esta",
        cuentaId: ctx.cuentaId,
        medio: "recursos-ia",
        computo: {
            nucleos,
            ramLibreMb,
            gpu,
            ...(vramMb > 0 ? { vramMb } : {}),
            motores,
        },
        almacen: { prestaMb, volumenes },
        apps: [],
        enlaces: {
            bajadaKbps: Math.round(VIA_REFERENCIA[vias[0]].mbs * 8000),
            latenciaMs: Object.fromEntries(vias.map((v) => [v, VIA_REFERENCIA[v].latenciaMs] as const)),
        },
        energia: { cargando: false, enUso: false },
        presta: {
            cuenta: prestaBase.cuenta,
            grupos: [...prestaBase.grupos],
            publico: prestaBase.publico,
            topes: { cpuPct: 50, ramMb: ramLibreMb, discoMb: prestaMb, soloCargando: false },
        },
        t: ctx.ahora,
    };
}
