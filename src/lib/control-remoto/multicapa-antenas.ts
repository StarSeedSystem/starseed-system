/**
 * CTL1123C · Enrutamiento multiantena simultáneo y capas de conciencia.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `any`): planifica qué antena real lleva cada función
 * de la sesión remota (`video`, `entrada`, `ordenes`, `telemetria`) según latencia,
 * ancho de banda y disponibilidad, combinado con capas de conciencia (prioridad,
 * umbrales).
 *
 * Regla: prioriza baja latencia (< 40 ms) por Bluetooth / Wi‑Fi Direct para
 * entrada/teclado en tiempo real, mientras el flujo pesado de pantalla usa
 * Wi‑Fi local / WebRTC / malla simultáneamente cuando hay más de una antena.
 */

export type TipoAntena = "bluetooth" | "wifi-directo" | "wifi-router" | "malla" | "turn" | "servidor";

export interface AntenaDisponible {
    id: string;
    tipo: TipoAntena;
    latenciaMs: number;
    anchoBandaKbps: number;
}

export type FuncionSesion = "video" | "entrada" | "ordenes" | "telemetria";

export interface PerfilConciencia {
    nombre: string;
    prioridad: FuncionSesion[];
    umbralLatenciaMs: number;
    umbralAnchoBandaKbps: number;
}

export interface AntenaEnPlan {
    id: string;
    tipo: TipoAntena;
    funcion: string;
}

export interface PlanAntenas {
    video: string;
    entrada: string;
    ordenes: string;
    telemetria: string;
    antenasUsadas: AntenaEnPlan[];
}

const FUNCIONES: FuncionSesion[] = ["video", "entrada", "ordenes", "telemetria"];

function nombreTipo(tipo: TipoAntena): string {
    switch (tipo) {
        case "bluetooth":
            return "Bluetooth";
        case "wifi-directo":
            return "Wi‑Fi directo";
        case "wifi-router":
            return "Wi‑Fi router";
        case "malla":
            return "Malla";
        case "turn":
            return "TURN";
        case "servidor":
            return "Servidor";
    }
}

type CategoriaRequisito = "baja-latencia" | "alto-ancho-banda" | "flexible";

function categoriaDeFuncion(funcion: FuncionSesion): CategoriaRequisito {
    if (funcion === "entrada" || funcion === "ordenes") return "baja-latencia";
    if (funcion === "video") return "alto-ancho-banda";
    return "flexible";
}

function antenaAdecuadaPara(
    antena: AntenaDisponible,
    funcion: FuncionSesion,
    perfil: PerfilConciencia
): boolean {
    if (funcion === "entrada" || funcion === "ordenes") {
        return antena.latenciaMs <= perfil.umbralLatenciaMs;
    }
    if (funcion === "video") {
        return antena.anchoBandaKbps >= perfil.umbralAnchoBandaKbps;
    }
    return true;
}

const PREFERENCIA_TIPO_BAJA_LATENCIA: TipoAntena[] = ["bluetooth", "wifi-directo", "wifi-router", "malla", "turn", "servidor"];
const PREFERENCIA_TIPO_ALTO_ANCHO_BANDA: TipoAntena[] = ["wifi-directo", "wifi-router", "malla", "turn", "servidor", "bluetooth"];
const PREFERENCIA_TIPO_FLEXIBLE: TipoAntena[] = ["wifi-directo", "bluetooth", "wifi-router", "malla", "turn", "servidor"];

function preferenciasParaCategoria(cat: CategoriaRequisito): TipoAntena[] {
    switch (cat) {
        case "baja-latencia":
            return PREFERENCIA_TIPO_BAJA_LATENCIA;
        case "alto-ancho-banda":
            return PREFERENCIA_TIPO_ALTO_ANCHO_BANDA;
        case "flexible":
            return PREFERENCIA_TIPO_FLEXIBLE;
    }
}

function indicePreferencia(tipo: TipoAntena, preferencias: TipoAntena[]): number {
    const i = preferencias.indexOf(tipo);
    return i >= 0 ? i : preferencias.length;
}

function mejorAntenaPara(
    disponibles: AntenaDisponible[],
    funcion: FuncionSesion,
    perfil: PerfilConciencia,
    asignadas: Map<string, FuncionSesion[]>
): AntenaDisponible | null {
    const cat = categoriaDeFuncion(funcion);
    const preferencias = preferenciasParaCategoria(cat);

    const antenasConInfo = disponibles.map((a) => ({
        antena: a,
        yaAsignada: asignadas.has(a.id),
        mismaCategoria: asignadas.has(a.id) && asignadas.get(a.id)!.some((f) => categoriaDeFuncion(f) === cat),
    }));

    const candidatas = antenasConInfo
        .filter(({ antena }) => antenaAdecuadaPara(antena, funcion, perfil))
        .sort(({ antena: a, yaAsignada: ua, mismaCategoria: ma }, { antena: b, yaAsignada: ub, mismaCategoria: mb }) => {
            if (ma !== mb) return ma ? -1 : 1;
            const ia = indicePreferencia(a.tipo, preferencias);
            const ib = indicePreferencia(b.tipo, preferencias);
            if (ia !== ib) return ia - ib;
            if (ua !== ub) return ua ? 1 : -1;
            if (cat === "baja-latencia" || cat === "flexible") {
                return a.latenciaMs - b.latenciaMs;
            }
            return b.anchoBandaKbps - a.anchoBandaKbps;
        });
    return candidatas[0]?.antena ?? null;
}

export function planificarAntenasSimultaneas(
    disponibles: AntenaDisponible[],
    perfil: PerfilConciencia
): PlanAntenas {
    if (disponibles.length === 0) {
        throw new Error("Sin antenas disponibles");
    }

    const asignadas = new Map<string, FuncionSesion[]>();
    const plan: Partial<Record<FuncionSesion, string>> = {};

    for (const funcion of perfil.prioridad) {
        const antena = mejorAntenaPara(disponibles, funcion, perfil, asignadas);
        const elegida = antena ?? disponibles[0];
        plan[funcion] = elegida.id;
        if (!asignadas.has(elegida.id)) asignadas.set(elegida.id, []);
        asignadas.get(elegida.id)!.push(funcion);
    }

    const antenasEnPlan: AntenaEnPlan[] = [];
    for (const [id, funcs] of Array.from(asignadas.entries())) {
        const antena = disponibles.find((a) => a.id === id)!;
        antenasEnPlan.push({
            id,
            tipo: antena.tipo,
            funcion: funcs.map((f) => (f === "telemetria" ? "telemetría" : f)).join(", "),
        });
    }

    return {
        video: plan.video!,
        entrada: plan.entrada!,
        ordenes: plan.ordenes!,
        telemetria: plan.telemetria!,
        antenasUsadas: antenasEnPlan,
    };
}

export function resumenPlanAntenas(plan: PlanAntenas): string {
    if (plan.antenasUsadas.length === 1) {
        const a = plan.antenasUsadas[0];
        return `Todas las funciones (video, entrada, órdenes, telemetría) viajan por ${nombreTipo(a.tipo)} (${a.id}).`;
    }

    const lineas = plan.antenasUsadas.map((a) => {
        const funcs = a.funcion.split(", ").map((f) => f.trim());
        const verb = funcs.length > 1 ? "llevan" : "lleva";
        return `${nombreTipo(a.tipo)} (${a.id}) ${verb} ${funcs.join(", ")}.`;
    });

    return lineas.join(" ");
}