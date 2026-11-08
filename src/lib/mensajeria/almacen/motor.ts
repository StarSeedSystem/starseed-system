/**
 * Motor de mensajes de la malla sobre el almacén local (MSJ1108C · F1).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Reúne, sin DOM ni red propios, lo que hace falta para hablar SIN internet en un chat de cuenta:
 * enviar texto (markdown tal cual), citas, formato enriquecido y anuncio de adjuntos; recibir con
 * reloj híbrido; y editar o borrar con operaciones firmadas que se aplican igual en los dos extremos.
 * El transporte se inyecta (`enviar`): en la app es `enviarPorPasoMalla`/el canal «chat-malla»; en las
 * pruebas, dos motores unidos en memoria. El buzón (`buzon.ts`) usa las mismas funciones puras
 * (`cuerpoChatDe`, `aplicarOperacion`) sobre su bandeja en memoria.
 */

import type { AlmacenMensajes, RegistroMensaje } from "./almacen";
import { autorDe, registroDe } from "./almacen";
import { aplicarOperacion, anadirPendiente, firmarOperacion, type ContextoAplicar, type Firmante, type OperacionMensaje, type OpsPendientes } from "./operaciones";
import type { RelojHibrido } from "./reloj-hibrido";
import { leerCuerpoChatMalla, type CuerpoChatMalla, type MensajeMalla, type RespuestaCitada } from "@/lib/mensajeria/neuronas/bandeja";
import type { AdjuntoNeurona } from "@/lib/mensajeria/neuronas/datos-neurona";
import type { ViaMensaje } from "@/lib/mensajeria/medios/tipos";

const META_PENDIENTES = "ops-pendientes";
const metaClaves = (autor: string) => `claves:${autor}`;

/** Cuerpo que viaja por el canal «chat-malla» para un mensaje de un hilo. */
export function cuerpoChatDe(m: MensajeMalla, hilo: string, uid: string | null): CuerpoChatMalla {
    return {
        v: 1,
        mid: m.id,
        h: hilo,
        txt: m.texto,
        at: m.at,
        de: { u: uid ?? undefined },
        ...(m.hlc ? { hlc: m.hlc } : {}),
        ...(m.respuestaA ? { rp: m.respuestaA } : {}),
        ...(m.formato ? { fmt: m.formato } : {}),
        ...(m.adjunto ? { adj: m.adjunto } : {}),
        ...(m.llamada ? { ll: m.llamada } : {}),
    };
}

/** Claves públicas ya fijadas para un autor (TOFU), guardadas en el meta del almacén. */
export async function crearContextoClaves(almacen: AlmacenMensajes, autor: string): Promise<ContextoAplicar> {
    const lista = [...((await almacen.meta<string[]>(metaClaves(autor))) ?? [])];
    return {
        clavesDe: () => lista,
        fijar: (_a, pub) => {
            lista.push(pub);
            void almacen.ponerMeta(metaClaves(autor), [...lista]);
        },
    };
}

export const META_OPS_PENDIENTES = META_PENDIENTES;

export interface DepsMotor {
    almacen: AlmacenMensajes;
    uid: string | null;
    neurona: string;
    reloj: RelojHibrido;
    firmante: Firmante;
    ahora(): number;
    nuevoId(): string;
    /** Manda un cuerpo a una persona del chat por los enlaces de la malla. */
    enviar(destinoUid: string, canal: string, cuerpo: unknown): Promise<{ ok: boolean; via?: ViaMensaje }>;
    /** Nombre de los extractos de cita (opcional). */
    nombreDe?(uid: string): string | undefined;
}

export interface EnvioMotor {
    hilo: string;
    destinatarios: string[];
    texto: string;
    respuestaA?: RespuestaCitada;
    formato?: unknown;
    adjunto?: AdjuntoNeurona;
}

export interface MotorMensajes {
    enviar(e: EnvioMotor): Promise<MensajeMalla>;
    editar(id: string, texto: string): Promise<boolean>;
    borrar(id: string): Promise<boolean>;
    recibir(cuerpo: unknown, via?: ViaMensaje): Promise<"mensaje" | "operacion" | "pendiente" | "duplicado" | "invalido" | "rechazado">;
    lista(clave: string): Promise<MensajeMalla[]>;
}

export const CANAL_CHAT = "chat-malla";

export function crearMotorMensajes(deps: DepsMotor): MotorMensajes {
    const { almacen, reloj } = deps;

    async function guardar(m: MensajeMalla): Promise<void> {
        const previo = await almacen.obtener(m.id);
        await almacen.poner([registroDe(m, m.hlc ?? reloj.tic(), autorDe(m, deps.uid, deps.neurona), previo)]);
    }

    const contextoClaves = (autor: string) => crearContextoClaves(almacen, autor);

    async function aplicar(reg: RegistroMensaje, op: OperacionMensaje): Promise<boolean> {
        const ctx = await contextoClaves(op.autor);
        const r = await aplicarOperacion(reg.m, op, { miUid: deps.uid, miNeurona: deps.neurona }, ctx);
        if (!r.ok) return false;
        if (r.cambio) await guardar(r.m);
        return true;
    }

    async function repartir(m: MensajeMalla, destinatarios: string[], cuerpo: unknown): Promise<void> {
        const vias: ViaMensaje[] = [];
        for (const d of destinatarios) {
            try {
                const r = await deps.enviar(d, CANAL_CHAT, cuerpo);
                if (r.ok && r.via) vias.push(r.via);
                if (r.ok && !m.recibos?.[d]) m = { ...m, recibos: { ...m.recibos, [d]: { entregado: deps.ahora() } } };
            } catch {
                /* ese destinatario no tiene camino ahora: queda sin recibo */
            }
        }
        if (cuerpo && (cuerpo as { op?: unknown }).op) return;
        const actual = (await almacen.obtener(m.id))?.m ?? m;
        await guardar({
            ...actual,
            recibos: { ...actual.recibos, ...m.recibos },
            estado: vias.length ? (vias.some((v) => v.confirmado) ? "confirmado" : "enviado") : "en-espera",
            via: vias[0] ?? actual.via,
        });
    }

    return {
        async enviar(e) {
            const m: MensajeMalla = {
                id: deps.nuevoId(),
                clave: `dm:${e.hilo}`,
                dir: "sale",
                texto: e.texto.slice(0, 4000),
                at: deps.ahora(),
                estado: "enviando",
                hlc: reloj.tic(),
                destinatarios: e.destinatarios,
                ...(e.respuestaA ? { respuestaA: e.respuestaA } : {}),
                ...(e.formato ? { formato: e.formato } : {}),
                ...(e.adjunto ? { adjunto: e.adjunto } : {}),
            };
            await guardar(m);
            await repartir(m, e.destinatarios, cuerpoChatDe(m, e.hilo, deps.uid));
            return (await almacen.obtener(m.id))?.m ?? m;
        },

        async editar(id, texto) {
            const reg = await almacen.obtener(id);
            const autor = deps.uid ?? deps.neurona;
            if (!reg || reg.m.dir !== "sale" || reg.m.borrado || !texto.trim()) return false;
            const op = await firmarOperacion(deps.firmante, { t: "editar", mid: id, h: reg.m.clave.slice(3), autor, hlc: reloj.tic(), txt: texto.slice(0, 4000) });
            if (!(await aplicar(reg, op))) return false;
            await repartir(reg.m, reg.m.destinatarios ?? [], { v: 1, mid: id, h: reg.m.clave.slice(3), txt: "", de: { u: deps.uid ?? undefined }, hlc: op.hlc, op });
            return true;
        },

        async borrar(id) {
            const reg = await almacen.obtener(id);
            const autor = deps.uid ?? deps.neurona;
            if (!reg || reg.m.dir !== "sale") return false;
            const op = await firmarOperacion(deps.firmante, { t: "borrar", mid: id, h: reg.m.clave.slice(3), autor, hlc: reloj.tic() });
            if (!(await aplicar(reg, op))) return false;
            await repartir(reg.m, reg.m.destinatarios ?? [], { v: 1, mid: id, h: reg.m.clave.slice(3), txt: "", de: { u: deps.uid ?? undefined }, hlc: op.hlc, op });
            return true;
        },

        async recibir(cuerpo, via) {
            const c = leerCuerpoChatMalla(cuerpo);
            if (!c) return "invalido";
            reloj.observar(c.hlc);
            if (c.op) {
                const reg = await almacen.obtener(c.op.mid);
                if (!reg) {
                    const p = (await almacen.meta<OpsPendientes>(META_PENDIENTES)) ?? {};
                    await almacen.ponerMeta(META_PENDIENTES, anadirPendiente(p, c.op));
                    return "pendiente";
                }
                return (await aplicar(reg, c.op)) ? "operacion" : "rechazado";
            }
            if (c.de.u && deps.uid && c.de.u === deps.uid) return "duplicado"; // eco de mi cuenta
            if (await almacen.obtener(c.mid)) return "duplicado";
            const m: MensajeMalla = {
                id: c.mid,
                clave: `dm:${c.h}`,
                dir: "entra",
                texto: c.txt,
                at: deps.ahora(),
                estado: "recibido",
                hlc: c.hlc ?? reloj.tic(),
                deUid: c.de.u,
                ...(via ? { via } : {}),
                ...(c.rp ? { respuestaA: c.rp } : {}),
                ...(c.fmt ? { formato: c.fmt } : {}),
                ...(c.adj ? { adjunto: c.adj } : {}),
                ...(c.ll ? { llamada: c.ll } : {}),
            };
            await guardar(m);
            const pend = (await almacen.meta<OpsPendientes>(META_PENDIENTES)) ?? {};
            const ops = pend[m.id];
            if (ops?.length) {
                for (const op of [...ops].sort((a, b) => (a.hlc < b.hlc ? -1 : 1))) {
                    const reg = await almacen.obtener(m.id);
                    if (reg) await aplicar(reg, op);
                }
                const resto = { ...pend };
                delete resto[m.id];
                await almacen.ponerMeta(META_PENDIENTES, resto);
            }
            return "mensaje";
        },

        async lista(clave) {
            return (await almacen.todos())
                .filter((r) => r.clave === clave && !r.lapida)
                .map((r) => r.m)
                .sort((a, b) => (a.hlc ?? "") < (b.hlc ?? "") ? -1 : 1);
        },
    };
}
