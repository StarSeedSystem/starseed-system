"use client";

/**
 * Llamadas de GRUPO sin internet (GRP1107A · 2026-11-07) — el motor.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Decisiones PURAS en `grupo-malla.ts` (a quién suena, tope, vídeo o solo voz, protocolo).
 * Aquí: el timbre por cada enlace sin internet (`llg.inv`), la respuesta (`llg.res`), el aviso de
 * que quien llama colgó antes (`llg.fin`) y la llamada en sí, que es el `MotorLlamada` de siempre
 * con un canal DIRECTO por cada enlace (`abrirCanalLlamadaPorEnlace`), `iceServers: []` y sin
 * `tema`: ni Supabase ni TURN. Si cada par tiene su enlace, la malla es completa; la pareja que no
 * lo tiene no se ve, y se dice (`paresSinEnlace`).
 *
 * La sala (`malla-grupo:<hilo>:<aleatorio>`) la comparten todos: cada canal por enlace filtra por
 * ella. El timbre suena con la tarjeta global de llamadas entrantes (Aceptar / Solo voz /
 * Rechazar); nada se contesta solo. Nunca lanza hacia fuera.
 */

import { MotorLlamada } from "./motor";
import { obtenerMedios, pararStream, soportaLlamadas } from "./medios";
import { clavePestana, miIdentidad } from "./identidad";
import { abrirCanalLlamadaPorEnlace } from "./canal-enlace-local";
import { agregarTimbre, leerLlamadas, quitarTimbre, suscribirLlamadas, type TimbreEntrante } from "./store";
import {
    admitirInvitacion,
    avisoParesSinEnlace,
    decidirMediosGrupo,
    ESPERA_INVITACION_MS,
    leerMensajeGrupo,
    MAX_GRUPO_MALLA,
    paresSinEnlace,
    planGrupoMalla,
    salaGrupoMalla,
    textoViaGrupo,
    type EnlaceGrupo,
    type InvitacionGrupo,
    type MensajeGrupo,
    type PlanGrupoMalla,
} from "./grupo-malla";
import { alRegistrarEnlaceLocal, enlaceLocal, enlacesLocalesVivos, type EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";

export interface ResultadoGrupoMalla {
    ok: boolean;
    motivo?: string;
    sala?: string;
}

function aleatorio(): string {
    try {
        return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    } catch {
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }
}

/** Los enlaces vivos sin funciones, con sus medidas, para la decisión pura. */
export function enlacesParaGrupo(vivos: EnlaceLocalVivo[] = enlacesLocalesVivos()): EnlaceGrupo[] {
    return vivos.map((e) => {
        let abierto = false;
        let capacidadKbps: number | null = null;
        let rttMs: number | null = null;
        try {
            abierto = e.abierto();
            capacidadKbps = e.capacidadKbps();
            rttMs = e.rttMs();
        } catch {
            /* sin medidas */
        }
        return { id: e.id, nombre: e.par.nombre || "Aparato vinculado", abierto, ...(e.par.uid ? { uid: e.par.uid } : {}), capacidadKbps, rttMs };
    });
}

function mandar(enlaceId: string, m: MensajeGrupo): boolean {
    const e = enlaceLocal(enlaceId);
    if (!e) return false;
    try {
        return e.enviar(JSON.stringify(m));
    } catch {
        return false;
    }
}

/* ══════════════════════════ Llamadas salientes ══════════════════════════ */

interface Saliente {
    sala: string;
    plan: PlanGrupoMalla;
    yo: { uid: string; nombre: string };
    pendientes: Set<string>;
    alcanza: Map<string, { uid: string; nombre: string; alcanza: string[] }>;
    motor: MotorLlamada;
}

const salientes = new Map<string, Saliente>();

/** Quien llama tiene enlace con todos los que contestan; entre ellos, se dice qué parejas no lo tienen. */
function avisarTopologia(s: Saliente): void {
    const aviso = avisoParesSinEnlace(paresSinEnlace(Array.from(s.alcanza.values())));
    if (aviso) s.motor.avisar(aviso);
}

/**
 * Llama a un grupo sin servidor: suena por cada enlace del plan y entra en la sala. `plan`: el de
 * `planLlamadaChat`/`planGrupoMalla` (si falta, se calcula con los enlaces de ahora).
 */
export async function empezarLlamadaGrupoMalla(o: {
    hiloId: string;
    tipoChat: "dm" | "grupo";
    tipo: "audio" | "video";
    titulo: string;
    miembros: string[];
    plan?: PlanGrupoMalla;
}): Promise<ResultadoGrupoMalla> {
    try {
        const acciones = await import("./acciones");
        if (acciones.hayLlamadaEnCurso()) return { ok: false, motivo: "Ya estás en una llamada. Cuelga antes de empezar otra." };
        if (!soportaLlamadas()) return { ok: false, motivo: "Este navegador no permite llamadas: hace falta una conexión segura (https) y un navegador actual." };
        const yo = await miIdentidad();
        if (!yo?.uid) return { ok: false, motivo: "Sin cuenta en este aparato no se puede llamar a un grupo." };
        const plan = o.plan ?? planGrupoMalla({ miembros: o.miembros, miUid: yo.uid, enlaces: enlacesParaGrupo(), pedido: o.tipo });
        if (!plan.ok) return { ok: false, motivo: plan.aviso ? plan.aviso[0].toUpperCase() + plan.aviso.slice(1) : "No hay enlaces sin internet con este grupo." };
        const enlaces = plan.invitados.map((i) => enlaceLocal(i.enlaceId)).filter((e): e is EnlaceLocalVivo => !!e && safeAbierto(e));
        if (!enlaces.length) return { ok: false, motivo: "Los enlaces sin internet de este grupo se acaban de cerrar." };
        const medios = await obtenerMedios({ audio: true, video: plan.video });
        if (!medios.stream) return { ok: false, motivo: medios.error ?? "No se pudo usar el micrófono." };
        const sala = salaGrupoMalla(o.hiloId, aleatorio());
        const miembros = Array.from(new Set([...o.miembros, yo.uid]));
        const motor = new MotorLlamada({
            sesionId: sala,
            yo,
            colgarAlQuedarSolo: false,
            iceServers: [],
            hayTurn: false,
            tema: null,
            canalesDirectos: () => enlaces.slice(0, MAX_GRUPO_MALLA - 1).map((e) => abrirCanalLlamadaPorEnlace(e, sala, clavePestana(yo.base))),
        });
        await motor.prepararMedios({ audio: true, video: plan.video, stream: medios.stream });
        const avisos = [plan.motivoMedios, medios.aviso, ...plan.avisos].filter(Boolean);
        if (avisos.length) motor.avisar(avisos.join(" "));
        const s: Saliente = { sala, plan, yo: { uid: yo.uid, nombre: yo.nombre }, pendientes: new Set(plan.invitados.map((i) => i.enlaceId)), alcanza: new Map(), motor };
        salientes.set(sala, s);
        acciones.activarLlamada({
            sesionId: sala,
            tipo: plan.video ? "video" : "audio",
            hiloId: hiloDeChat(o.hiloId),
            titulo: o.titulo || "Llamada de grupo",
            mensajeId: null,
            adjunto: null,
            esCreador: true,
            token: null,
            unoAUno: false,
            motor,
            minimizada: false,
            via: plan.texto,
        });
        if (!motor.entrar()) {
            salientes.delete(sala);
            pararStream(medios.stream);
            return { ok: false, motivo: "No se pudo abrir la llamada por los enlaces sin internet." };
        }
        const inv: InvitacionGrupo = {
            t: "llg.inv",
            v: 1,
            s: sala,
            h: o.hiloId,
            tc: o.tipoChat,
            tipo: o.tipo,
            video: plan.video,
            de: { uid: yo.uid, nombre: yo.nombre },
            miembros,
            ...(o.titulo ? { titulo: o.titulo.slice(0, 80) } : {}),
            ts: Date.now(),
        };
        let sonando = 0;
        for (const i of plan.invitados) if (mandar(i.enlaceId, inv)) sonando += 1;
        if (!sonando) {
            motor.colgar("No salió la invitación por ningún enlace sin internet.");
            return { ok: false, motivo: "No salió la invitación por ningún enlace sin internet.", sala };
        }
        // Si cuelgo antes de que contesten, que deje de sonar en los demás.
        const baja = motor.suscribir((e) => {
            if (e.fase !== "terminada" && e.fase !== "error" && e.fase !== "llena") return;
            baja();
            const fin = { t: "llg.fin" as const, v: 1 as const, s: sala, de: { uid: yo.uid as string } };
            for (const id of s.pendientes) mandar(id, fin);
            salientes.delete(sala);
        });
        return { ok: true, sala };
    } catch {
        return { ok: false, motivo: "No se pudo llamar al grupo por la malla." };
    }
}

/** Una llamada desde la pestaña «Neuronas» (`cerebro-<sección>`) no cuelga de ningún chat. */
function hiloDeChat(hiloId: string): string | null {
    return hiloId.startsWith("cerebro-") ? null : hiloId;
}

function safeAbierto(e: EnlaceLocalVivo): boolean {
    try {
        return e.abierto();
    } catch {
        return false;
    }
}

/* ══════════════════════════ Entrar o rechazar ══════════════════════════ */

/** Entra en la sala de un timbre de grupo por la malla (botón «Aceptar» o «Solo voz»). */
export async function unirseAGrupoMalla(t: TimbreEntrante, opciones: { camara?: boolean } = {}): Promise<ResultadoGrupoMalla> {
    if (!t.malla) return { ok: false, motivo: "Esa llamada no es por la malla." };
    try {
        const acciones = await import("./acciones");
        if (acciones.hayLlamadaEnCurso()) return { ok: false, motivo: "Ya estás en otra llamada. Cuelga antes de unirte a esta." };
        if (!soportaLlamadas()) return { ok: false, motivo: "Este navegador no permite llamadas: hace falta una conexión segura (https) y un navegador actual." };
        const yo = await miIdentidad();
        if (!yo?.uid) return { ok: false, motivo: "Sin cuenta en este aparato no se puede entrar." };
        // Mis enlaces con aparatos de los miembros de ESTA llamada (por cada uno, un canal directo).
        const decision = planGrupoMalla({ miembros: t.malla.miembros, miUid: yo.uid, enlaces: enlacesParaGrupo(), pedido: t.malla.video && opciones.camara !== false ? "video" : "audio" });
        const enlaces = decision.invitados.map((i) => enlaceLocal(i.enlaceId)).filter((e): e is EnlaceLocalVivo => !!e && safeAbierto(e));
        if (!enlaces.some((e) => e.id === t.malla?.enlaceId)) {
            const original = enlaceLocal(t.malla.enlaceId);
            if (!original || !safeAbierto(original)) return { ok: false, motivo: "El enlace con quien llama se ha cerrado." };
            enlaces.unshift(original);
        }
        const aparatos = Math.min(MAX_GRUPO_MALLA, enlaces.length + 1);
        const medios0 = decidirMediosGrupo(t.malla.video && opciones.camara !== false ? "video" : "audio", aparatos, enlacesParaGrupo(enlaces));
        const medios = await obtenerMedios({ audio: true, video: medios0.video });
        if (!medios.stream && !medios.error) return { ok: false, motivo: "No se pudo usar el micrófono." };
        const sala = t.sesionId;
        const motor = new MotorLlamada({
            sesionId: sala,
            yo,
            colgarAlQuedarSolo: false,
            iceServers: [],
            hayTurn: false,
            tema: null,
            canalesDirectos: () => enlaces.slice(0, MAX_GRUPO_MALLA - 1).map((e) => abrirCanalLlamadaPorEnlace(e, sala, clavePestana(yo.base))),
        });
        if (medios.stream) await motor.prepararMedios({ audio: true, video: medios0.video, stream: medios.stream });
        else {
            const r = await motor.prepararMedios({ audio: true, video: false });
            if (!r.audio && r.error) motor.avisar(`${r.error} Entras sin micrófono: puedes escuchar y activarlo luego.`);
        }
        const avisos = [medios0.motivo, medios.aviso, ...medios0.avisos].filter(Boolean);
        if (avisos.length) motor.avisar(avisos.join(" "));
        acciones.activarLlamada({
            sesionId: sala,
            tipo: medios0.video ? "video" : "audio",
            hiloId: hiloDeChat(t.hiloId),
            titulo: t.tituloHilo ?? t.llamante.nombre,
            mensajeId: null,
            adjunto: null,
            esCreador: false,
            token: null,
            unoAUno: false,
            motor,
            minimizada: false,
            via: textoViaGrupo(aparatos, medios0.video),
        });
        motor.entrar();
        const alcanza = Array.from(new Set(enlaces.map((e) => e.par.uid).filter((u): u is string => !!u)));
        mandar(t.malla.enlaceId, { t: "llg.res", v: 1, s: sala, si: true, de: { uid: yo.uid, nombre: yo.nombre }, alcanza });
        return { ok: true, sala };
    } catch {
        return { ok: false, motivo: "No se pudo entrar en la llamada por la malla." };
    }
}

/** Dice «no» por el enlace por el que llegó la invitación. */
export async function rechazarGrupoMalla(t: TimbreEntrante, motivo?: string): Promise<void> {
    if (!t.malla) return;
    const yo = await miIdentidad().catch(() => null);
    mandar(t.malla.enlaceId, {
        t: "llg.res",
        v: 1,
        s: t.sesionId,
        si: false,
        de: { uid: yo?.uid ?? "anon", nombre: yo?.nombre ?? "Alguien" },
        alcanza: [],
        ...(motivo ? { motivo } : {}),
    });
}

/* ══════════════════════════ Recepción ══════════════════════════ */

const caducidades = new Map<string, ReturnType<typeof setTimeout>>();

async function recibir(enlace: EnlaceLocalVivo, data: unknown): Promise<void> {
    if (typeof data !== "string") return;
    const msg = leerMensajeGrupo(data, Date.now());
    if (!msg) return;
    if (msg.t === "llg.inv") {
        const yo = await miIdentidad().catch(() => null);
        const { activa, timbres } = leerLlamadas();
        if (activa?.sesionId === msg.s || timbres.some((x) => x.sesionId === msg.s)) return;
        const admitida = admitirInvitacion(msg, { miUid: yo?.uid ?? null, uidEnlace: enlace.par.uid, enLlamada: !!activa && !activa.motor.cerrada });
        if (!admitida.ok) {
            // Solo se contesta a quien sí es del grupo (al resto, nada: no se confirma que existo).
            if (admitida.motivo === "ya estás en otra llamada") {
                mandar(enlace.id, { t: "llg.res", v: 1, s: msg.s, si: false, de: { uid: yo?.uid ?? "anon", nombre: yo?.nombre ?? "Alguien" }, alcanza: [], motivo: "está en otra llamada" });
            }
            return;
        }
        agregarTimbre({
            sesionId: msg.s,
            tipo: msg.tipo,
            hiloId: msg.h,
            tipoHilo: msg.tc,
            tituloHilo: msg.titulo ?? null,
            mensajeId: "",
            llamante: { uid: msg.de.uid, nombre: msg.de.nombre, avatar: null },
            silenciado: false,
            llegada: Date.now(),
            malla: { enlaceId: enlace.id, miembros: msg.miembros, video: msg.video },
        });
        const previa = caducidades.get(msg.s);
        if (previa) clearTimeout(previa);
        caducidades.set(
            msg.s,
            setTimeout(() => {
                caducidades.delete(msg.s);
                quitarTimbre(msg.s);
            }, ESPERA_INVITACION_MS),
        );
        return;
    }
    if (msg.t === "llg.fin") {
        // Solo quien llamó (por su propio enlace) puede parar el timbre.
        const t = leerLlamadas().timbres.find((x) => x.sesionId === msg.s);
        if (t?.malla?.enlaceId === enlace.id && t.llamante.uid === msg.de.uid) quitarTimbre(msg.s);
        return;
    }
    // llg.res: solo la llamada que salió de aquí, y solo por un enlace al que sonó.
    const s = salientes.get(msg.s);
    if (!s || !s.plan.invitados.some((i) => i.enlaceId === enlace.id)) return;
    if (enlace.par.uid && enlace.par.uid !== msg.de.uid) return;
    s.pendientes.delete(enlace.id);
    if (msg.si) {
        s.alcanza.set(enlace.id, { uid: msg.de.uid, nombre: msg.de.nombre, alcanza: msg.alcanza });
        avisarTopologia(s);
        return;
    }
    s.motor.avisar(`${msg.de.nombre} no puede atender ahora${msg.motivo ? ` (${msg.motivo})` : ""}.`);
    const contestada = s.motor.estado().contestada;
    if (!s.pendientes.size && !s.alcanza.size && !contestada) s.motor.colgar("Nadie del grupo puede atender ahora.");
}

let escuchando = false;
const bajasEnlace = new Map<string, () => void>();

/**
 * Escucha las invitaciones de grupo en cada enlace sin internet (los que hay y los que se abran).
 * Idempotente; devuelve la baja.
 */
export function iniciarGrupoMalla(): () => void {
    if (escuchando) return () => undefined;
    escuchando = true;
    const bajaAlta = alRegistrarEnlaceLocal((e) => {
        if (bajasEnlace.has(e.id)) return;
        try {
            bajasEnlace.set(e.id, e.alMensaje((d) => void recibir(e, d)));
        } catch {
            /* enlace sin canal */
        }
    });
    // Un timbre que se va (aceptado, rechazado o caducado) deja de vigilar su caducidad.
    const bajaStore = suscribirLlamadas(() => {
        const vivos = new Set(leerLlamadas().timbres.map((t) => t.sesionId));
        for (const [s, tm] of caducidades) {
            if (!vivos.has(s)) {
                clearTimeout(tm);
                caducidades.delete(s);
            }
        }
    });
    return () => {
        escuchando = false;
        bajaAlta();
        bajaStore();
        for (const b of bajasEnlace.values()) {
            try {
                b();
            } catch {
                /* noop */
            }
        }
        bajasEnlace.clear();
        for (const tm of caducidades.values()) clearTimeout(tm);
        caducidades.clear();
    };
}

/** Solo pruebas. */
export function __estadoGrupoMalla(): { salientes: string[]; escuchando: boolean } {
    return { salientes: Array.from(salientes.keys()), escuchando };
}
