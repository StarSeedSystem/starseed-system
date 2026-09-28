/**
 * Red y guardado FALSOS en memoria para probar el controlador con varias personas a la vez, sin
 * Supabase. La red entrega los mensajes cuando la prueba lo pide (`entregar()`), para poder
 * reproducir carreras: dos personas actuando a la vez, mensajes desordenados, alguien sin red.
 */
import { Controlador, type EstadoConexion, type Persistencia, type Transporte } from "../juegos/controlador";
import { motorMesa } from "../juegos/mesa";
import { sanearDoc } from "../juegos/registro";
import { docVacio } from "../juegos/registro";
import type { DocSala, MotorCualquiera, Presente } from "../juegos/tipos";

interface Mensaje {
    de: string;
    evento: string;
    carga: unknown;
}

interface Nodo {
    uid: string;
    alRecibir: ((evento: string, carga: unknown) => void) | null;
    alEstado: ((e: EstadoConexion) => void) | null;
    alPresentes: ((l: Presente[]) => void) | null;
    presente: Presente | null;
    sinRed: boolean;
}

export class RedFalsa {
    nodos = new Map<string, Nodo>();
    cola: Mensaje[] = [];
    /** Todo lo que se envió (para inspeccionar en las pruebas). */
    enviados: Mensaje[] = [];

    transporte(uid: string): Transporte {
        const nodo: Nodo = { uid, alRecibir: null, alEstado: null, alPresentes: null, presente: null, sinRed: false };
        this.nodos.set(uid, nodo);
        return {
            enviar: (evento, carga) => {
                if (nodo.sinRed) return;
                const m = { de: uid, evento, carga: JSON.parse(JSON.stringify(carga ?? null)) };
                this.enviados.push(m);
                this.cola.push(m);
            },
            suscribir: (alRecibir, alEstado) => {
                nodo.alRecibir = alRecibir;
                nodo.alEstado = alEstado;
                queueMicrotask(() => alEstado("en-vivo"));
                return () => {
                    nodo.alRecibir = null;
                    nodo.alEstado = null;
                };
            },
            anunciar: (yo) => {
                nodo.presente = yo;
                this.notificarPresentes();
            },
            alPresentes: (cb) => {
                nodo.alPresentes = cb;
                return () => {
                    nodo.alPresentes = null;
                };
            },
        };
    }

    private notificarPresentes(): void {
        const lista = [...this.nodos.values()].map((n) => n.presente).filter((p): p is Presente => p !== null);
        for (const n of this.nodos.values()) n.alPresentes?.(lista);
    }

    /** Entrega los mensajes en cola a todos menos a su autor. `filtro` permite perder u ordenar. */
    entregar(filtro?: (m: Mensaje, para: string) => boolean): number {
        const actuales = this.cola.splice(0);
        let entregados = 0;
        for (const m of actuales) {
            for (const nodo of this.nodos.values()) {
                if (nodo.uid === m.de || nodo.sinRed || !nodo.alRecibir) continue;
                if (filtro && !filtro(m, nodo.uid)) continue;
                nodo.alRecibir(m.evento, JSON.parse(JSON.stringify(m.carga)));
                entregados += 1;
            }
        }
        return entregados;
    }

    /** Entrega hasta que no quede nada (las respuestas también viajan). */
    entregarTodo(): void {
        for (let i = 0; i < 20 && this.cola.length > 0; i++) this.entregar();
    }

    inyectar(de: string, evento: string, carga: unknown): void {
        this.cola.push({ de, evento, carga });
    }

    sinRed(uid: string, valor: boolean): void {
        const n = this.nodos.get(uid);
        if (n) n.sinRed = valor;
    }
}

/** Guardado falso con compare-and-swap, como `os_spaces`. */
export class AlmacenFalso {
    doc: unknown = {};
    rev = 0;
    escrituras = 0;
    denegados = new Set<string>();
    fallar = false;
    oyentes = new Map<string, (doc: unknown) => void>();

    persistencia(uid: string, opciones: { soloLectura?: boolean } = {}): Persistencia {
        return {
            leer: async () => ({ ok: true, doc: JSON.parse(JSON.stringify(this.doc)), soloLectura: opciones.soloLectura }),
            escribir: async (fn) => {
                if (this.fallar) return { ok: false, error: "red caída" };
                if (this.denegados.has(uid)) return { ok: false, error: "sin permiso", denegado: true };
                const actual = sanearDoc(JSON.parse(JSON.stringify(this.doc)));
                const nuevo = fn(actual);
                if (!nuevo) return { ok: true, doc: this.doc };
                if (JSON.stringify(nuevo) !== JSON.stringify(actual)) {
                    this.doc = JSON.parse(JSON.stringify(nuevo));
                    this.rev += 1;
                    this.escrituras += 1;
                    for (const [otro, cb] of this.oyentes) if (otro !== uid) cb(JSON.parse(JSON.stringify(this.doc)));
                }
                return { ok: true, doc: JSON.parse(JSON.stringify(this.doc)) };
            },
            alCambiar: (cb) => {
                this.oyentes.set(uid, cb);
                return () => {
                    this.oyentes.delete(uid);
                };
            },
        };
    }
}

export function buscarMotorJuegos(tipo: string): MotorCualquiera | null {
    return ["tres-en-raya", "conecta-4", "ajedrez", "dibujo"].includes(tipo) ? motorMesa : null;
}

export function crearCliente(
    uid: string,
    red: RedFalsa,
    almacen: AlmacenFalso,
    extra: { ahora?: () => number; nombre?: string; soloLectura?: boolean; retardoGuardadoMs?: number; buscarMotor?: (t: string) => MotorCualquiera | null; tipoDoc?: "juego" | "programa" } = {},
): Controlador {
    let n = 0;
    return new Controlador({
        tipoDoc: extra.tipoDoc ?? "juego",
        yo: { uid, nombre: extra.nombre ?? uid },
        transporte: red.transporte(uid),
        persistencia: almacen.persistencia(uid, { soloLectura: extra.soloLectura }),
        buscarMotor: extra.buscarMotor ?? buscarMotorJuegos,
        ahora: extra.ahora,
        idNuevo: () => `${uid}-${++n}`,
        retardoGuardadoMs: extra.retardoGuardadoMs ?? 50,
    });
}

export function docInicial(tipo: "juego" | "programa" = "juego"): DocSala {
    return docVacio(tipo);
}
