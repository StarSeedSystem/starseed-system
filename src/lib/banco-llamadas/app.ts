/**
 * Banco de llamadas · el actor montado en la app de la Mac (ORD1114P). Una instancia por página; el
 * estado vive en memoria (al recargar o cerrar la app queda apagado, contrato de la ronda §4.1 regla 1).
 */
import { ActorBanco, SONDEO_MS } from "./actor";
import { EVENTO_CAMBIO, SesionHacia } from "@/lib/control-remoto/canal";

let actor: ActorBanco | null = null;
let reloj: ReturnType<typeof setInterval> | null = null;
const sesiones = new Map<string, SesionHacia>();

function avisar(): void {
    try {
        window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO));
    } catch {
        /* sin ventana */
    }
}

function crear(): ActorBanco {
    return new ActorBanco({
        ahora: () => Date.now(),
        dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
        leer: async () => {
            const r = await fetch("/api/banco-llamadas", { cache: "no-store" });
            if (!r.ok) return null;
            const j = (await r.json()) as { disponible?: boolean; orden?: unknown; calma?: unknown };
            return j.disponible ? { orden: j.orden ?? null, calma: j.calma ?? null } : null;
        },
        marcar: (detalle, neurona) => {
            void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("banco", neurona, detalle)).catch(() => undefined);
        },
        tableta: (para) => {
            let s = sesiones.get(para);
            if (!s) {
                s = new SesionHacia(para);
                sesiones.set(para, s);
            }
            return s;
        },
        local: async (nombre, args) => {
            const { ejecutarEnApp } = await import("@/lib/control-remoto/ejecutores");
            const { uidActual } = await import("@/lib/consumo/usuario");
            return ejecutarEnApp(nombre, args, { cuentaPropia: await uidActual() });
        },
    });
}

export function estadoBanco() {
    return actor?.estado() ?? null;
}

/** Lo enciende la persona en la Mac, para UNA tableta. */
export function armarBanco(tableta: string, horas?: number, llamadas?: number): boolean {
    if (!actor) actor = crear();
    const ok = actor.armar(tableta, horas, llamadas);
    if (ok && !reloj) {
        reloj = setInterval(() => {
            void actor?.vuelta().then((r) => {
                if (r === "vencida" || r === "hecha" || r.startsWith("rechazada")) avisar();
            });
        }, SONDEO_MS);
    }
    avisar();
    return ok;
}

export function apagarBanco(motivo = "apagar"): void {
    actor?.apagar(motivo);
    if (reloj) clearInterval(reloj);
    reloj = null;
    for (const s of sesiones.values()) void s.cerrar().catch(() => undefined);
    sesiones.clear();
    avisar();
}
