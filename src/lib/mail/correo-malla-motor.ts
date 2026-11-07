"use client";

/**
 * Correos por la malla: guardar y reenviar (GRP1107A · 2026-11-07) — el motor.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Decisiones PURAS en `correo-malla.ts` (rutas, recibos, estado, qué hacer con lo que llega).
 * Aquí: la bandeja cifrada (`boveda-correo-malla.ts`), el envío por el transporte universal
 * (canal «correo-malla», con acuse de la otra app), la subida al buzón con `meta.mallaId`
 * (idempotente: `composeMail`), los recibos de vuelta por la malla y los reintentos (cada 30 s y al
 * volver la red). Las dependencias se inyectan (`crearMotorCorreoMalla`) para probarlo sin red.
 * Nunca lanza hacia fuera.
 */

import { useSyncExternalStore } from "react";
import {
    aplicarRecibo,
    CANAL_CORREO_MALLA,
    correoDesdeMensaje,
    decidirEntrada,
    leerMensajeCorreo,
    medioDeTipo,
    mensajeDeCorreo,
    nuevoCorreoMalla,
    rutasCorreo,
    tocaReintento,
    type CorreoMalla,
    type EnlaceCorreo,
    type MsgCorreoMalla,
    type MsgRecibo,
    type ViaCorreo,
} from "./correo-malla";
import { almacenCifrado, type AlmacenCorreoMalla } from "./boveda-correo-malla";
import { mediosAdmitidos, normalizarPreferencias } from "@/lib/mensajeria/medios/medios";
import { claveChat, preferenciasEfectivas } from "@/lib/mensajeria/medios/preferencias-store";

export interface DepsCorreoMalla {
    almacen: AlmacenCorreoMalla;
    identidad(): Promise<{ uid: string | null; nombre: string; neurona?: string }>;
    red(): Promise<{ internet: boolean; sesion: boolean }>;
    enlaces(): Promise<EnlaceCorreo[]>;
    /** Manda por UN enlace (sobre del transporte universal); confirmado = la otra app acusó. */
    enviarPorEnlace(enlaceId: string, cuerpo: MsgCorreoMalla): Promise<{ ok: boolean; confirmado: boolean; detalle?: string }>;
    /** Sube al buzón @star.seed con su id de malla (idempotente). */
    subirAlServidor(c: CorreoMalla): Promise<{ ok: boolean; hilo?: string; motivo?: string }>;
    ahora(): number;
    nuevoId(): string;
    /** Medios elegidos para Correos (null = automático). */
    permitidos?(): string[] | null;
}

export interface EntradaCorreo {
    cuerpo: unknown;
    origen: { enlaceId: string; etiqueta: string; tipo: string };
}

export interface MotorCorreoMalla {
    enviar(o: { para: Array<{ uid: string; nombre?: string }>; asunto: string; cuerpo: string }): Promise<{ ok: boolean; correo?: CorreoMalla; motivo?: string }>;
    recibir(m: EntradaCorreo): Promise<void>;
    /** Reintenta lo pendiente: rutas por la malla, subida al buzón y recibos de relevo. */
    tic(forzar?: boolean): Promise<void>;
    lista(): CorreoMalla[];
    suscribir(cb: () => void): () => void;
    cargar(): Promise<void>;
    cifrado(): boolean;
}

export function crearMotorCorreoMalla(deps: DepsCorreoMalla): MotorCorreoMalla {
    const correos = new Map<string, CorreoMalla>();
    const oyentes = new Set<() => void>();
    let foto: CorreoMalla[] = [];
    let cargado: Promise<void> | null = null;
    const enCurso = new Set<string>();

    const avisar = () => {
        foto = Array.from(correos.values()).sort((a, b) => b.creado - a.creado);
        for (const cb of Array.from(oyentes)) {
            try {
                cb();
            } catch {
                /* noop */
            }
        }
    };

    const poner = async (c: CorreoMalla) => {
        correos.set(c.id, c);
        avisar();
        try {
            await deps.almacen.guardar(c);
        } catch {
            /* sigue en memoria */
        }
    };

    const cargar = () => {
        cargado ??= (async () => {
            try {
                for (const c of await deps.almacen.cargar()) if (!correos.has(c.id)) correos.set(c.id, c);
            } catch {
                /* bandeja vacía */
            }
            avisar();
        })();
        return cargado;
    };

    const via = (enlaceId: string, etiqueta: string, tipo: string): ViaCorreo => ({ medio: medioDeTipo(tipo), enlaceId, etiqueta, en: deps.ahora() });

    /**
     * Cambia un correo partiendo SIEMPRE de su versión más reciente: un recibo que llega a mitad
     * de un intento (por la malla, mientras se espera otro envío) no se pisa.
     */
    const mutar = async (id: string, fn: (c: CorreoMalla) => CorreoMalla): Promise<CorreoMalla | null> => {
        const actual = correos.get(id);
        if (!actual) return null;
        const sig = fn(actual);
        if (sig !== actual) await poner(sig);
        return sig;
    };

    /** Un intento completo para un correo que sale o que guardo de relevo. */
    const intentar = async (id: string, forzar: boolean): Promise<void> => {
        if (enCurso.has(id)) return;
        const c0 = correos.get(id);
        if (!c0 || c0.dir === "entra" || c0.estado === "en-servidor") return;
        if (!forzar && !tocaReintento(c0, deps.ahora())) return;
        enCurso.add(id);
        try {
            const [yo, red, enlaces] = await Promise.all([deps.identidad(), deps.red(), deps.enlaces().catch(() => [] as EnlaceCorreo[])]);
            if (!yo.uid) return;
            const c = (await mutar(id, (x) => ({ ...x, intentos: x.intentos + 1, ultimoIntento: deps.ahora() }))) ?? c0;
            if (c.dir === "relevo") {
                // De relevo solo se sube al buzón (nunca se pasa a otra neurona: un salto).
                if (!(red.internet && red.sesion)) {
                    await mutar(id, (x) => ({ ...x, aviso: "Esperando internet para subirlo al buzón." }));
                    return;
                }
                const r = await deps.subirAlServidor(c);
                if (!r.ok) {
                    await mutar(id, (x) => ({ ...x, aviso: r.motivo ?? "El buzón no respondió; se reintenta." }));
                    return;
                }
                const hecho = await mutar(id, (x) => aplicarRecibo(x, { tipo: "en-servidor", por: "este aparato", en: deps.ahora(), ...(r.hilo ? { hilo: r.hilo } : {}) }));
                // Recibo de vuelta a la neurona que lo escribió, por donde llegó (si sigue abierto).
                if (hecho?.via?.enlaceId) {
                    const recibo: MsgRecibo = { t: "cm.recibo", v: 1, id, tipo: "en-servidor", uid: yo.uid, nombre: yo.nombre, ...(r.hilo ? { hilo: r.hilo } : {}) };
                    await deps.enviarPorEnlace(hecho.via.enlaceId, recibo).catch(() => null);
                }
                return;
            }
            const rutas = rutasCorreo({ correo: c, enlaces, internet: red.internet, sesion: red.sesion, miUid: yo.uid, permitidos: deps.permitidos?.() ?? null });
            if (!rutas.pasos.length) {
                await mutar(id, (x) => ({ ...x, aviso: rutas.aviso }));
                return;
            }
            const fallos: string[] = [];
            for (const p of rutas.pasos) {
                if (p.tipo === "servidor") {
                    const r = await deps.subirAlServidor(c);
                    if (r.ok) {
                        await mutar(id, (x) => aplicarRecibo(x, { tipo: "en-servidor", por: "Buzón @star.seed", en: deps.ahora(), via: { medio: "correo", etiqueta: "Buzón @star.seed", en: deps.ahora() }, ...(r.hilo ? { hilo: r.hilo } : {}) }));
                    } else fallos.push(r.motivo ?? "el buzón no respondió");
                    continue;
                }
                const v: ViaCorreo = { medio: p.medio, enlaceId: p.enlaceId, etiqueta: p.etiqueta, en: deps.ahora() };
                // El recibo del otro puede llegar DURANTE el envío: cada cambio parte de la versión más reciente.
                const r = await deps.enviarPorEnlace(p.enlaceId, mensajeDeCorreo(c, p.tipo === "entrega" ? "entrega" : "relevo")).catch(() => ({ ok: false, confirmado: false, detalle: "falló el envío" }));
                if (r.ok) {
                    await mutar(id, (x) => ({ ...aplicarRecibo(x, { tipo: "enviado", ...(p.tipo === "entrega" ? { uid: p.uid } : {}), por: p.etiqueta, via: v, en: deps.ahora() }), via: v }));
                } else {
                    fallos.push(`${p.etiqueta}: ${r.detalle ?? "no salió"}`);
                }
            }
            await mutar(id, (x) => {
                const aviso =
                    x.estado === "en-servidor" || x.estado === "entregado"
                        ? undefined
                        : fallos.length
                          ? `No salió por: ${fallos.join("; ")}. Se reintenta solo.`
                          : x.estado === "guardado" && x.entregadoA.length < x.para.length
                            ? "Enviado por la malla; esperando el acuse de quien lo guarda."
                            : undefined;
                return x.aviso === aviso ? x : { ...x, aviso };
            });
        } catch {
            /* se reintenta en el siguiente tic */
        } finally {
            enCurso.delete(id);
        }
    };

    const motor: MotorCorreoMalla = {
        cifrado: () => deps.almacen.cifrado(),
        cargar,
        lista: () => foto,
        suscribir(cb) {
            oyentes.add(cb);
            return () => {
                oyentes.delete(cb);
            };
        },
        async enviar(o) {
            await cargar();
            const yo = await deps.identidad();
            if (!yo.uid) return { ok: false, motivo: "Sin cuenta en este aparato no se puede enviar un correo." };
            const n = nuevoCorreoMalla({ id: deps.nuevoId(), de: { uid: yo.uid, nombre: yo.nombre, ...(yo.neurona ? { neurona: yo.neurona } : {}) }, para: o.para, asunto: o.asunto, cuerpo: o.cuerpo, ahora: deps.ahora() });
            if (!n.ok) return { ok: false, motivo: n.motivo };
            // Primero se guarda (cifrado): pase lo que pase después, no se pierde.
            await poner(n.correo);
            await intentar(n.correo.id, true);
            return { ok: true, correo: correos.get(n.correo.id) ?? n.correo };
        },
        async recibir(m) {
            await cargar();
            const msg = leerMensajeCorreo(m.cuerpo);
            if (!msg) return;
            const yo = await deps.identidad();
            const lista = await deps.enlaces().catch(() => [] as EnlaceCorreo[]);
            const uidEnlace = lista.find((l) => l.id === m.origen.enlaceId)?.uid;
            if (msg.t === "cm.recibo") {
                const c = correos.get(msg.id);
                if (!c || c.dir === "entra") return;
                // El recibo lo firma quien dice ser el aparato por el que llega (nadie acusa por otro).
                if (!uidEnlace || uidEnlace !== msg.uid) return;
                // Un «entregado» solo cuenta si lo dice un destinatario; «en tránsito» y «en el servidor», una neurona mía.
                if (msg.tipo === "entregado" && !c.para.includes(msg.uid)) return;
                if ((msg.tipo === "en-transito" || msg.tipo === "en-servidor") && msg.uid !== yo.uid) return;
                const sig = aplicarRecibo(c, { tipo: msg.tipo, uid: msg.uid, por: msg.nombre, via: via(m.origen.enlaceId, m.origen.etiqueta, m.origen.tipo), en: deps.ahora(), ...(msg.hilo ? { hilo: msg.hilo } : {}) });
                if (sig !== c) await poner(sig);
                return;
            }
            const d = decidirEntrada(msg, { miUid: yo.uid, uidEnlace, yaLoTengo: correos.has(msg.id) });
            if (d.accion === "ignorar") return;
            if (d.accion === "guardar") {
                await poner(correoDesdeMensaje(msg, d.dir, via(m.origen.enlaceId, m.origen.etiqueta, m.origen.tipo), deps.ahora()));
            }
            if (!yo.uid) return;
            const recibo: MsgRecibo = { t: "cm.recibo", v: 1, id: msg.id, tipo: d.recibo, uid: yo.uid, nombre: yo.nombre };
            await deps.enviarPorEnlace(m.origen.enlaceId, recibo).catch(() => null);
            // De relevo y con internet: se sube ya.
            if (d.accion === "guardar" && d.dir === "relevo") void intentar(msg.id, true);
        },
        async tic(forzar = false) {
            await cargar();
            for (const c of Array.from(correos.values())) {
                if (c.dir !== "entra" && c.estado !== "en-servidor") await intentar(c.id, forzar);
            }
        },
    };
    return motor;
}

/* ══════════════════════════ Instancia de la app ══════════════════════════ */

let compartido: MotorCorreoMalla | null = null;

function nuevoIdReal(): string {
    try {
        return crypto.randomUUID();
    } catch {
        return `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
}

/** El motor de esta pestaña con las dependencias reales (perezosas). */
export function motorCorreoMalla(): MotorCorreoMalla {
    compartido ??= crearMotorCorreoMalla({
        almacen: almacenCifrado(),
        ahora: () => Date.now(),
        nuevoId: nuevoIdReal,
        permitidos() {
            // Los ajustes de «Medio de transmisión» que valen para Correos (los generales o los de Correos).
            const p = normalizarPreferencias(preferenciasEfectivas(claveChat("correo", "nuevo")));
            if (p.modo !== "elegidos") return null;
            const admitidos = mediosAdmitidos("correo");
            const utiles = p.elegidos.filter((m) => admitidos.includes(m));
            return utiles.length ? utiles : null;
        },
        async identidad() {
            const { miIdentidad } = await import("@/lib/llamadas/identidad");
            const yo = await miIdentidad().catch(() => null);
            return { uid: yo?.uid ?? null, nombre: yo?.nombre ?? "Yo" };
        },
        async red() {
            const { hayInternetYSesion } = await import("@/lib/mensajeria/neuronas/buzon");
            const r = await hayInternetYSesion();
            return { internet: r.internet, sesion: !!r.uid };
        },
        async enlaces() {
            const tu = await import("@/lib/malla/transporte-universal");
            const { miIdentidad } = await import("@/lib/llamadas/identidad");
            const [lista, yo] = await Promise.all([tu.enlacesDisponibles(), miIdentidad().catch(() => null)]);
            return lista.map((e) => ({
                id: e.id,
                tipo: e.tipo,
                etiqueta: e.etiqueta,
                abierto: e.abierto,
                // La malla de la cuenta solo une aparatos de TU cuenta.
                ...(e.alcanza.uid ? { uid: e.alcanza.uid } : e.tipo === "cuenta" && yo?.uid ? { uid: yo.uid } : {}),
                rttMs: e.rttMs ?? null,
            }));
        },
        async enviarPorEnlace(enlaceId, cuerpo) {
            const tu = await import("@/lib/malla/transporte-universal");
            const r = await tu.enviarMensaje({ enlaceId }, CANAL_CORREO_MALLA, cuerpo);
            return { ok: r.ok, confirmado: r.confirmado, detalle: r.motivo };
        },
        async subirAlServidor(c) {
            const { composeMail } = await import("./os-mail");
            const r = await composeMail({ recipientIds: c.para, subject: c.asunto, body: c.cuerpo, mallaId: c.id });
            return r.ok ? { ok: true, hilo: r.threadId } : { ok: false, motivo: r.needsAuth ? "sin sesión" : r.error };
        },
    });
    return compartido;
}

/** Lista reactiva de la bandeja de la malla (para el panel de Correos). */
export function useCorreosMalla(): CorreoMalla[] {
    const m = motorCorreoMalla();
    return useSyncExternalStore(m.suscribir, m.lista, () => VACIA);
}
const VACIA: CorreoMalla[] = [];

let parada: (() => void) | null = null;

/** Escucha el canal «correo-malla» y reintenta cada 30 s y al volver la red. Idempotente. */
export function iniciarCorreoMalla(): () => void {
    if (parada || typeof window === "undefined") return () => undefined;
    const m = motorCorreoMalla();
    let activo = true;
    const bajas: Array<() => void> = [];
    void m.cargar().then(() => (activo ? m.tic(true) : undefined));
    void import("@/lib/malla/transporte-universal")
        .then((tu) => {
            if (!activo) return;
            bajas.push(tu.alRecibirMensaje(CANAL_CORREO_MALLA, (x) => void m.recibir({ cuerpo: x.cuerpo, origen: { enlaceId: x.origen.enlaceId, etiqueta: x.origen.etiqueta, tipo: x.origen.tipo } })));
        })
        .catch(() => undefined);
    const tic = () => void m.tic();
    const alVolver = () => void m.tic(true);
    const intervalo = setInterval(tic, 30_000);
    window.addEventListener("online", alVolver);
    bajas.push(
        () => clearInterval(intervalo),
        () => window.removeEventListener("online", alVolver),
    );
    parada = () => {
        activo = false;
        for (const b of bajas.splice(0)) {
            try {
                b();
            } catch {
                /* noop */
            }
        }
    };
    return () => {
        parada?.();
        parada = null;
    };
}
