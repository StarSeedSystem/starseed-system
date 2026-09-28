"use client";

/**
 * Señalización de las llamadas: UN canal de Supabase Realtime por llamada, `llamada:<sesionId>`.
 *
 *  · Presencia: quién está dentro (nombre, foto, micro/cámara/pantalla, hora de entrada).
 *  · Broadcast (evento «llamada»): ofertas/respuestas SDP y candidatos ICE dirigidos a un par,
 *    avisos de colgar y de rechazo del timbre.
 *
 * ⚠️ supabase-js DEVUELVE EL MISMO objeto de canal para el mismo tema (`realtime:<tema>`): si la
 * tarjeta del chat y el motor de la llamada abrieran «su» canal por separado, al cerrar uno se
 * cerraría el del otro. Por eso aquí hay un REGISTRO compartido con cuenta de referencias: todos
 * los que miran una llamada comparten canal y oyentes, y el canal se cierra con el último.
 *
 * La clave de presencia se fija al crear el canal. Un observador (tarjeta, timbre) no la
 * necesita; si luego entra un participante con su propia clave, el canal se recrea con ella y
 * los oyentes existentes pasan al nuevo sin enterarse.
 *
 * ⚠️ Y `removeChannel` es asíncrono: el canal que se va sigue en la lista del cliente hasta que
 * el servidor confirma la salida, y pedir el mismo tema entretanto devuelve ESE canal a medio
 * cerrar (suscribirlo lanza «subscribe multiple times»). Por eso un canal nuevo espera a que
 * termine el cierre pendiente de su tema antes de crearse.
 *
 * Nunca lanza: sin Supabase o sin red devuelve null y la interfaz lo dice.
 */
import { createClient } from "@/utils/supabase/client";
import { participantesDePresencia } from "@/lib/llamadas/presencia";
import { sanearSenal } from "@/lib/llamadas/negociacion";
import type { MetaPresencia, SenalLlamada } from "@/lib/llamadas/tipos";

type Cliente = ReturnType<typeof createClient>;
type Canal = ReturnType<Cliente["channel"]>;

const EVENTO = "llamada";
const MAX_COLA = 300;

interface Registro {
    sesionId: string;
    clave: string;
    /** true si la clave la fijó un participante (no un observador). */
    claveDeParticipante: boolean;
    cliente: Cliente | null;
    canal: Canal | null;
    suscrito: boolean;
    presencia: MetaPresencia[];
    /** Meta publicada (se republica tras cada reconexión). */
    meta: MetaPresencia | null;
    cola: SenalLlamada[];
    refs: number;
    /** Sube con cada (re)creación: una creación diferida vieja no pisa a la nueva. */
    generacion: number;
    liberado: boolean;
    oyentesPresencia: Set<(p: MetaPresencia[]) => void>;
    oyentesSenal: Set<(s: SenalLlamada) => void>;
    oyentesSuscrito: Set<(ok: boolean) => void>;
}

const registros = new Map<string, Registro>();
/** Cierres de canal en curso por sesión (ver la advertencia de arriba). */
const cierres = new Map<string, Promise<unknown>>();

function claveObservador(): string {
    return `obs-${Math.random().toString(36).slice(2, 10)}`;
}

function emitir<T>(oyentes: Set<(v: T) => void>, v: T) {
    for (const cb of Array.from(oyentes)) {
        try {
            cb(v);
        } catch {
            /* un oyente roto no tumba a los demás */
        }
    }
}

function cerrarCanal(r: Registro) {
    const { cliente, canal } = r;
    r.canal = null;
    r.suscrito = false;
    r.generacion += 1;
    if (cliente && canal) {
        try {
            const p = Promise.resolve(cliente.removeChannel(canal)).catch(() => undefined);
            // Tope de espera: si el servidor no confirma, a los 4 s se sigue igualmente.
            const conTope = Promise.race([p, new Promise((ok) => setTimeout(ok, 4000))]);
            cierres.set(r.sesionId, conTope);
            void conTope.then(() => {
                if (cierres.get(r.sesionId) === conTope) cierres.delete(r.sesionId);
            });
        } catch {
            /* best-effort */
        }
    }
}

function enviarAhora(r: Registro, s: SenalLlamada): boolean {
    if (!r.canal || !r.suscrito) return false;
    try {
        void r.canal.send({ type: "broadcast", event: EVENTO, payload: s });
        return true;
    } catch {
        return false;
    }
}

/** Crea el canal ya, o en cuanto termine el cierre pendiente de su tema. */
function crearCanal(r: Registro): boolean {
    if (typeof window === "undefined") return false;
    try {
        r.cliente = r.cliente ?? createClient();
    } catch {
        return false;
    }
    const pendiente = cierres.get(r.sesionId);
    if (!pendiente) return crearCanalYa(r);
    const generacion = r.generacion;
    void pendiente.then(() => {
        if (r.liberado || r.generacion !== generacion || r.canal) return;
        if (!crearCanalYa(r)) emitir(r.oyentesSuscrito, false);
    });
    return true;
}

function crearCanalYa(r: Registro, intento = 0): boolean {
    if (!r.cliente) return false;
    try {
        const tema = `llamada:${r.sesionId}`;
        // Si aún queda un canal de ese tema a medio cerrar, se espera a que se vaya del todo
        // (hasta ~10 s; después se intenta igualmente y, si falla, se dice).
        const viejo = r.cliente.getChannels?.().find((c) => c.topic === `realtime:${tema}`);
        if (viejo && intento < 40) {
            const generacion = r.generacion;
            setTimeout(() => {
                if (!r.liberado && r.generacion === generacion && !r.canal && !crearCanalYa(r, intento + 1)) emitir(r.oyentesSuscrito, false);
            }, 250);
            return true;
        }
        const canal = r.cliente.channel(tema, {
            config: { presence: { key: r.clave }, broadcast: { self: false, ack: false } },
        });
        r.canal = canal;
        canal.on("presence", { event: "sync" }, () => {
            if (r.canal !== canal) return;
            try {
                r.presencia = participantesDePresencia(canal.presenceState() as Record<string, unknown>);
            } catch {
                r.presencia = [];
            }
            emitir(r.oyentesPresencia, r.presencia);
        });
        canal.on("broadcast", { event: EVENTO }, (mensaje: { payload?: unknown }) => {
            if (r.canal !== canal) return;
            const s = sanearSenal(mensaje?.payload);
            if (s) emitir(r.oyentesSenal, s);
        });
        canal.subscribe((estado: string) => {
            if (r.canal !== canal) return;
            if (estado === "SUBSCRIBED") {
                r.suscrito = true;
                if (r.meta) {
                    try {
                        void canal.track(r.meta);
                    } catch {
                        /* se reintenta en la próxima reconexión */
                    }
                }
                const pendientes = r.cola.splice(0);
                for (const s of pendientes) enviarAhora(r, s);
                emitir(r.oyentesSuscrito, true);
            } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
                r.suscrito = false;
                emitir(r.oyentesSuscrito, false);
            }
        });
        return true;
    } catch {
        r.canal = null;
        return false;
    }
}

export interface ConexionCanal {
    readonly sesionId: string;
    /** Clave de presencia efectiva del canal. */
    clave(): string;
    suscrito(): boolean;
    presencia(): MetaPresencia[];
    onPresencia(cb: (p: MetaPresencia[]) => void): () => void;
    onSenal(cb: (s: SenalLlamada) => void): () => void;
    onSuscrito(cb: (ok: boolean) => void): () => void;
    /** Envía (o encola hasta estar suscrito). */
    enviar(s: SenalLlamada): void;
    /** Publica/actualiza mi presencia (solo tiene sentido con clave de participante). */
    publicar(meta: MetaPresencia): void;
    /** Deja de publicar mi presencia. */
    retirar(): void;
    /** Suelta esta referencia; el canal se cierra con la última. */
    soltar(): void;
}

/**
 * Abre (o comparte) el canal de una llamada.
 * `clave`: la de participante (`<uid>:<pestaña>`); omítela para mirar sin participar.
 */
export function abrirCanalLlamada(sesionId: string, opciones: { clave?: string | null } = {}): ConexionCanal | null {
    if (!sesionId || typeof window === "undefined") return null;
    const clavePedida = opciones.clave ?? null;
    let r = registros.get(sesionId);
    if (!r) {
        r = {
            sesionId,
            clave: clavePedida ?? claveObservador(),
            claveDeParticipante: !!clavePedida,
            cliente: null,
            canal: null,
            suscrito: false,
            presencia: [],
            meta: null,
            cola: [],
            refs: 0,
            generacion: 0,
            liberado: false,
            oyentesPresencia: new Set(),
            oyentesSenal: new Set(),
            oyentesSuscrito: new Set(),
        };
        if (!crearCanal(r)) return null;
        registros.set(sesionId, r);
    } else if (clavePedida && clavePedida !== r.clave) {
        // Entra un participante en un canal abierto por observadores: se recrea con su clave.
        cerrarCanal(r);
        r.clave = clavePedida;
        r.claveDeParticipante = true;
        r.meta = null;
        r.presencia = [];
        if (!crearCanal(r)) return null;
    }
    const reg = r;
    reg.refs += 1;
    let suelta = false;
    const mios = { p: new Set<(p: MetaPresencia[]) => void>(), s: new Set<(s: SenalLlamada) => void>(), e: new Set<(ok: boolean) => void>() };

    return {
        sesionId,
        clave: () => reg.clave,
        suscrito: () => reg.suscrito,
        presencia: () => reg.presencia,
        onPresencia(cb) {
            reg.oyentesPresencia.add(cb);
            mios.p.add(cb);
            return () => {
                reg.oyentesPresencia.delete(cb);
                mios.p.delete(cb);
            };
        },
        onSenal(cb) {
            reg.oyentesSenal.add(cb);
            mios.s.add(cb);
            return () => {
                reg.oyentesSenal.delete(cb);
                mios.s.delete(cb);
            };
        },
        onSuscrito(cb) {
            reg.oyentesSuscrito.add(cb);
            mios.e.add(cb);
            return () => {
                reg.oyentesSuscrito.delete(cb);
                mios.e.delete(cb);
            };
        },
        enviar(s) {
            if (suelta) return;
            if (!enviarAhora(reg, s)) {
                if (reg.cola.length >= MAX_COLA) reg.cola.shift();
                reg.cola.push(s);
            }
        },
        publicar(meta) {
            if (suelta) return;
            reg.meta = meta;
            if (reg.canal && reg.suscrito) {
                try {
                    void reg.canal.track(meta);
                } catch {
                    /* se republica al reconectar */
                }
            }
        },
        retirar() {
            reg.meta = null;
            if (reg.canal && reg.suscrito) {
                try {
                    void reg.canal.untrack();
                } catch {
                    /* best-effort */
                }
            }
        },
        soltar() {
            if (suelta) return;
            suelta = true;
            mios.p.forEach((cb) => reg.oyentesPresencia.delete(cb));
            mios.s.forEach((cb) => reg.oyentesSenal.delete(cb));
            mios.e.forEach((cb) => reg.oyentesSuscrito.delete(cb));
            reg.refs -= 1;
            if (reg.refs <= 0) {
                reg.liberado = true;
                cerrarCanal(reg);
                reg.cola = [];
                registros.delete(sesionId);
            }
        },
    };
}

/** Solo para pruebas: vacía el registro. */
export function __reiniciarCanales() {
    for (const r of registros.values()) {
        r.liberado = true;
        cerrarCanal(r);
    }
    registros.clear();
    cierres.clear();
}
