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

// VEN1115L: lo armado se guarda en el aparato (con su caducidad) para que una recarga de la interfaz no apague la serie.
export const CLAVE_ARMADO = "starseed.banco-llamadas.armado";
interface Guardado {
    con: string;
    hasta: number;
    restantes: number;
}
let restaurando: Guardado | null = null;

function guardar(): void {
    try {
        const a = actor?.estado();
        if (a) window.localStorage.setItem(CLAVE_ARMADO, JSON.stringify({ con: a.con, hasta: a.hasta, restantes: a.restantes }));
        else window.localStorage.removeItem(CLAVE_ARMADO);
    } catch {
        /* sin almacenamiento: la serie sigue, solo que no sobrevive a una recarga */
    }
}

function olvidar(): void {
    try {
        window.localStorage.removeItem(CLAVE_ARMADO);
    } catch {
        /* sin almacenamiento */
    }
}

function iso(t: number): string {
    return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function marcarBanco(detalle: string, neurona: string | null): void {
    void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("banco", neurona, detalle)).catch(() => undefined);
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
            if (restaurando && detalle.startsWith("armada ")) {
                detalle = `armada con=${restaurando.con} hasta=${iso(restaurando.hasta)} restantes=${restaurando.restantes} origen=recarga`;
            }
            marcarBanco(detalle, neurona);
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
    guardar();
    if (ok && !reloj) {
        reloj = setInterval(() => {
            void actor?.vuelta().then((r) => {
                guardar();
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
    olvidar();
    dejarDeVigilar?.(); // ORD1114Q
    dejarDeVigilar = null;
    if (reloj) clearInterval(reloj);
    reloj = null;
    for (const s of sesiones.values()) void s.cerrar().catch(() => undefined);
    sesiones.clear();
    avisar();
}

/**
 * VEN1115L: al cargar la interfaz, si había una serie armada y no ha caducado, la vuelve a armar con lo que le quedaba
 * (marca `armada … origen=recarga`); si no se puede, lo dice (`apagada motivo=recarga`) y no deja nada guardado.
 */
export function restaurarBanco(): boolean {
    let crudo: string | null = null;
    try {
        crudo = window.localStorage.getItem(CLAVE_ARMADO);
    } catch {
        return false;
    }
    if (crudo === null) return false;
    let g: Guardado | null = null;
    try {
        const j = JSON.parse(crudo) as Partial<Guardado>;
        if (typeof j.con === "string" && typeof j.hasta === "number" && typeof j.restantes === "number" && Number.isFinite(j.hasta) && Number.isFinite(j.restantes)) {
            g = { con: j.con, hasta: j.hasta, restantes: Math.floor(j.restantes) };
        }
    } catch {
        g = null;
    }
    const ahora = Date.now();
    if (!g || g.hasta <= ahora || g.restantes < 1 || g.restantes > 200) {
        olvidar();
        marcarBanco("apagada motivo=recarga", null);
        return false;
    }
    restaurando = g;
    let ok = false;
    try {
        ok = armarBanco(g.con, (g.hasta - ahora) / 3_600_000, g.restantes);
        const a = actor?.estado();
        if (ok && a) {
            a.hasta = g.hasta; // armar() redondea las horas: se deja la caducidad exacta
            a.restantes = g.restantes;
            guardar();
        }
    } finally {
        restaurando = null;
    }
    if (!ok) {
        olvidar();
        marcarBanco("apagada motivo=recarga", null);
    }
    return ok;
}

if (typeof window !== "undefined") restaurarBanco();
