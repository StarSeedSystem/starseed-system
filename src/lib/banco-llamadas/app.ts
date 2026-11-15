/**
 * Banco de llamadas · el actor montado en la app de la Mac (ORD1114P). Una instancia por página; el
 * estado vive en memoria (al recargar o cerrar la app queda apagado, contrato de la ronda §4.1 regla 1).
 */
import { ActorBanco, SONDEO_MS, type EstadoApp } from "./actor";
import { EVENTO_CAMBIO, SesionHacia } from "@/lib/control-remoto/canal";

let actor: ActorBanco | null = null;
let reloj: ReturnType<typeof setInterval> | null = null;
let dejarDeVigilar: (() => void) | null = null; // ORD1114Q
const sesiones = new Map<string, SesionHacia>();
let ultimo: EstadoApp | null = null; // BAN1115D: lo último que la app informó de sí misma (la banda lo enseña)

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
        yo: () => {
            try {
                const id = window.localStorage.getItem("starseed.neuron.device-id");
                return id && /^[0-9a-f-]{36}$/i.test(id) ? id.toLowerCase() : null;
            } catch {
                return null;
            }
        },
        publicar: (estado) => {
            ultimo = estado;
            avisar();
            void fetch("/api/banco-llamadas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(estado), cache: "no-store" }).catch(() => undefined);
        },
        llave: async () => {
            const f = await import("@/lib/chats-genesis/firma-aparato");
            const spki = await f.spkiDelAparato().catch(() => null);
            const yo = await f.aparatoLocal().catch(() => null);
            return { tiene: spki === undefined ? null : !!spki, codigo: yo?.codigo ?? null };
        },
        local: async (nombre, args) => {
            const { ejecutarEnApp } = await import("@/lib/control-remoto/ejecutores");
            const { uidActual } = await import("@/lib/consumo/usuario");
            return ejecutarEnApp(nombre, args, { cuentaPropia: await uidActual() });
        },
    });
}

/** BAN1115D: el último informe de la app (clave, tableta elegida, si la aceptó, armada) o null si aún no hubo. */
export function ultimoInforme(): EstadoApp | null {
    return ultimo;
}

export function estadoBanco() {
    return actor?.estado() ?? null;
}

/** Lo enciende la persona en la Mac, para UNA tableta. */
export function armarBanco(tableta: string, horas?: number, llamadas?: number): boolean {
    if (!actor) actor = crear();
    const ok = actor.armar(tableta, horas, llamadas);
    // ORD1114Q: si alguien contesta o cuelga a mano EN LA MAC durante la serie, la serie para y lo dice.
    if (ok && !dejarDeVigilar) {
        void import("./a-mano").then((m) => {
            if (dejarDeVigilar || !actor?.estado()) return;
            dejarDeVigilar = m.vigilarLlamadas((que) => {
                actor?.intervencion(que, "mac");
                apagarBanco("a-mano");
            });
        });
    }
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

/**
 * BAN1115D: la persona eligió (o pidió controlar) una tableta: la app mira si ya la aceptó y publica lo que sabe, armada o no.
 * No arma nada, no acepta nada, no enciende ningún permiso.
 */
export function informarBanco(tableta: string): void {
    if (!actor) actor = crear();
    void actor.comprobar(tableta);
}

export function apagarBanco(motivo = "apagar"): void {
    actor?.apagar(motivo);
    dejarDeVigilar?.(); // ORD1114Q
    dejarDeVigilar = null;
    if (reloj) clearInterval(reloj);
    reloj = null;
    for (const s of sesiones.values()) void s.cerrar().catch(() => undefined);
    sesiones.clear();
    avisar();
}
