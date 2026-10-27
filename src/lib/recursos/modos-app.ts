// ════════════════════════════════════════════════════════════════
// Modos de apertura de una app en la malla (tarea N · Ola 1017A)
// ----------------------------------------------------------------
// Puro: elige cómo abrir una app desde una neurona y explica por qué.
// Contrato: architecture/apps-en-la-malla.md §4 (suelo), §5 (los cinco
// modos) y §9 (ventana transmitida). Nada de red, disco, procesos ni reloj.
// ════════════════════════════════════════════════════════════════
import type {
    ModoEjecucionApp, RequisitosApp, StarseedApp,
} from "@/components/dashboard/apps/launcher-types";
import type { OfertaNeurona } from "./oferta";

/** Tope de latencia para tiempo real (ventanas, juegos, llamadas) en ms. */
export const LATENCIA_TOPE_DEFECTO_MS = 80;

/** Plan que aporta el contexto (bolsa de recursos §4) para decidir. */
export type PlanApertura = {
    /** Neuronas anfitrionas candidatas, mejor primero. */
    anfitrionas?: OfertaNeurona[];
    /** Latencia medida desde esta neurona a cada vecino (nodoId → ms). */
    latenciaMs?: Record<string, number>;
    /** Tope de latencia para tiempo real. Sin valor: el de defecto. */
    latenciaTopeMs?: number;
};

/** Resultado: modo, destino (nodo, volumen o 'no-local') y motivo legible. */
export type AperturaApp = {
    modo: ModoEjecucionApp;
    destino: string;
    motivo: string;
    /** Qué faltaba en la neurona local (vacío si nada). */
    faltas: string[];
}

/** Qué del requisito no puede satisfacer la neurona (solo medido en la oferta). */
export function faltasEnNeurona(
    requisitos: RequisitosApp | undefined,
    neurona: OfertaNeurona
): string[] {
    if (!requisitos) return [];
    const faltas: string[] = [];
    const { ramMb, gpu, motores, volumen } = requisitos;
    if (ramMb !== undefined && neurona.computo.ramLibreMb < ramMb) {
        faltas.push(`RAM: necesita ${ramMb} MB y la neurona ofrece ${neurona.computo.ramLibreMb} MB`);
    }
    if (gpu && !neurona.computo.gpu) faltas.push("GPU: la neurona no tiene");
    if (motores) {
        const sinMotor = motores.filter((m) => !neurona.computo.motores.includes(m));
        if (sinMotor.length > 0) faltas.push(`Motores que faltan: ${sinMotor.join(", ")}`);
    }
    if (volumen && !neurona.almacen.volumenes.includes(volumen)) {
        faltas.push(`Volumen «${volumen}» no está en esta neurona`);
    }
    return faltas;
}

/** Una anfitriona está disponible si nadie la usa a fondo y su batería no está baja. */
function anfitrionaSana(host: OfertaNeurona): boolean {
    const { bateriaPct, cargando, enUso } = host.energia;
    const bateriaBaja = bateriaPct !== undefined && bateriaPct < 20 && !cargando;
    return !enUso && !bateriaBaja;
}

/**
 * Elige cómo abrir la app desde la neurona, con la regla del §5:
 * local si cabe → por-bandas (web/WASM con volumen) → montada (nativa
 * fuera del disco) → transmitida (otra neurona la tiene y la latencia
 * sirve) → ramificada (solo falta cálculo) · suelo: local con aviso.
 */
export function comoAbrir(
    app: Pick<StarseedApp, "id" | "ejecucion" | "requisitos">,
    neurona: OfertaNeurona,
    plan: PlanApertura = {}
): AperturaApp {
    const modos: ModoEjecucionApp[] = app.ejecucion ?? ["local"];
    const req = app.requisitos;
    const faltas = faltasEnNeurona(req, neurona);
    const cabe = faltas.length === 0;
    const tope = plan.latenciaTopeMs ?? LATENCIA_TOPE_DEFECTO_MS;

    if (cabe && modos.includes("local")) {
        return { modo: "local", destino: neurona.nodoId, motivo: `Cabe en la neurona local (${neurona.nodoId}).`, faltas };
    }
    if (modos.includes("por-bandas") && req?.volumen) {
        return { modo: "por-bandas", destino: req.volumen, motivo: `Se sirve por bandas del volumen «${req.volumen}»; solo baja lo que se usa.`, faltas };
    }
    if (modos.includes("montada") && req?.volumen) {
        return { modo: "montada", destino: req.volumen, motivo: `App nativa servida como volumen «${req.volumen}» por la pasarela local.`, faltas };
    }
    if (modos.includes("transmitida") && plan.anfitrionas) {
        for (const host of plan.anfitrionas) {
            if (host.nodoId === neurona.nodoId) continue;
            if (!host.apps.some((a) => a.id === app.id)) continue;
            if (!anfitrionaSana(host)) continue;
            const lat = plan.latenciaMs?.[host.nodoId];
            if (lat === undefined || lat > tope) continue;
            return { modo: "transmitida", destino: host.nodoId, motivo: `Corre en ${host.nodoId} (${lat} ms de latencia) y la ventana llega en vídeo.`, faltas };
        }
    }
    const soloFaltaCalcular = faltas.length > 0 && faltas.every((f) => !f.startsWith("Volumen"));
    const conCalculo = (plan.anfitrionas ?? []).find(
        (h) => h.nodoId !== neurona.nodoId && anfitrionaSana(h) && h.computo.ramLibreMb > 0
    );
    if (soloFaltaCalcular && modos.includes("ramificada")) {
        return { modo: "ramificada", destino: conCalculo?.nodoId ?? "red", motivo: `La interfaz va en local y el cálculo se reparte por la red. Falta: ${faltas.join("; ")}.`, faltas };
    }
    const modo = modos.includes("local") ? "local" : (modos[0] ?? "local");
    const motivo = cabe
        ? "Sin exigencias declaradas: se abre en local."
        : `Se abre con lo que hay en local, pero falta: ${faltas.join("; ")}.`;
    return { modo, destino: neurona.nodoId, motivo, faltas };
};
