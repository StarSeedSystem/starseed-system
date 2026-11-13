"use client";

/**
 * Chats de Genesis · cabecera del hilo y estado del espejo (GEN1113D · 2026-11-13)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que se ve en un chat de dirección o de un puente de Telegram es una COPIA que la Mac (o el
 * A1) sube a la puerta de datos del A1. La cabecera dice siempre de dónde viene y si está viva:
 * «En vivo» solo con un latido de ≤ 90 s (contrato §5.3 y §8). Nada se supone.
 *
 * Aquí viven también los dos ganchos que comparten los hilos: `useFeedEspejo` (lectura con espera
 * larga contra la puerta) y `useEnvios` (lo escrito desde aquí y su acuse). La cabecera resume
 * justo ese estado, por eso van juntos.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, Loader2, Lock, Radio, TimerOff } from "lucide-react";

import { AvisoSesion } from "@/components/auth/aviso-sesion";
import { estadoEspejo, TEXTO_SIN_SESION, type ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import { fusionarFeed } from "@/lib/mando/chat-director-feed";
import { cn } from "@/lib/utils";

type RespuestaFeed = Awaited<ReturnType<ClienteChatsGenesis["feed"]>>;
/** Un registro del espejo: un mensaje del feed ya tachado, con su fuente y sus entregas. */
export type RegistroEspejo = Extract<RespuestaFeed, { ok: true }>["registros"][number];
export type Latido = Extract<RespuestaFeed, { ok: true }>["latido"];
/** Lo que se manda a la puerta (sin versión, nonce ni hora: los pone el cliente). */
export type EntradaEnvio = Parameters<ClienteChatsGenesis["enviar"]>[0];
export type Origen = "mac" | "a1";

// ── Horas legibles ───────────────────────────────────────────────────────────

/** «12 s» (hasta 119 s), «4 min», «3 h», «2 días». */
export function haceTexto(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 120) return `${s} s`;
    const min = Math.floor(s / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 48) return `${h} h`;
    return `${Math.floor(h / 24)} días`;
}

/** «las 14:02» si es hoy; «el 13-11 a las 02:10» si es otro día. */
export function momentoTexto(ms: number, ahora: number): string {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "una hora desconocida";
    const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === new Date(ahora).toDateString()) return `las ${hora}`;
    const dia = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `el ${dia} a las ${hora}`;
}

/** Reloj de la cabecera: vuelve a pintar cada `cadaMs` para que «hace N s» no mienta. */
export function useAhora(cadaMs = 1000): number {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setAhora(Date.now()), cadaMs);
        return () => window.clearInterval(id);
    }, [cadaMs]);
    return ahora;
}

// ── Lectura del espejo (espera larga contra la puerta) ───────────────────────

export interface FalloFeed {
    estado: 401 | 403 | 503 | 0;
    error: string;
    /** Desde cuándo falla (ms), para decir «desde las HH:MM». */
    desde: number;
}

export interface EstadoFeed {
    registros: RegistroEspejo[];
    latido: Latido;
    cargado: boolean;
    fallo: FalloFeed | null;
}

const MAX_REGISTROS = 500;
const ESPERAS_FALLO_MS = [2_000, 5_000, 15_000, 60_000];
const VACIO: EstadoFeed = { registros: [], latido: null, cargado: false, fallo: null };

function dormir(ms: number, senal: AbortSignal): Promise<void> {
    return new Promise((resolver) => {
        if (senal.aborted) return resolver();
        const id = setTimeout(resolver, ms);
        senal.addEventListener("abort", () => { clearTimeout(id); resolver(); }, { once: true });
    });
}

/**
 * Lee `fuente` del espejo: primero los últimos 500 y después solo lo nuevo, con espera larga de
 * 25 s (la puerta contesta en cuanto llega algo). Sin permiso (401/403) no insiste; sin puerta
 * reintenta con 2 → 5 → 15 → 60 s. Nunca toca Supabase: todo va por la puerta del A1.
 */
export function useFeedEspejo(cliente: ClienteChatsGenesis, fuente: string): EstadoFeed & { releer: () => void } {
    const [estado, setEstado] = useState<EstadoFeed>(VACIO);
    const [vuelta, setVuelta] = useState(0);
    useEffect(() => {
        const ctl = new AbortController();
        setEstado(VACIO);
        let cursor: number | undefined;
        let fallos = 0;
        void (async () => {
            while (!ctl.signal.aborted) {
                const t0 = Date.now();
                let r: RespuestaFeed;
                try {
                    r = cursor === undefined
                        ? await cliente.feed({ fuente, limite: MAX_REGISTROS }, ctl.signal)
                        : await cliente.feed({ fuente, desde: cursor, esperar: 25 }, ctl.signal);
                } catch {
                    r = { ok: false, estado: 0, error: "sin respuesta de la puerta" };
                }
                if (ctl.signal.aborted) return;
                if (r.ok) {
                    const ok = r;
                    fallos = 0;
                    cursor = ok.cursor;
                    setEstado((previo) => ({
                        registros: ok.registros.length > 0
                            ? (fusionarFeed(ok.registros, previo.registros) as RegistroEspejo[]).slice(-MAX_REGISTROS)
                            : previo.registros,
                        latido: ok.latido,
                        cargado: true,
                        fallo: null,
                    }));
                    // Una puerta que contesta al momento sin esperar no se martillea.
                    if (Date.now() - t0 < 1_000) await dormir(1_000, ctl.signal);
                    continue;
                }
                const malo = r;
                setEstado((previo) => ({
                    ...previo,
                    cargado: true,
                    fallo: previo.fallo && previo.fallo.estado === malo.estado
                        ? previo.fallo
                        : { estado: malo.estado, error: malo.error, desde: Date.now() },
                }));
                if (malo.estado === 401 || malo.estado === 403) return;
                await dormir(ESPERAS_FALLO_MS[Math.min(fallos, ESPERAS_FALLO_MS.length - 1)]!, ctl.signal);
                fallos += 1;
            }
        })();
        return () => ctl.abort();
    }, [cliente, fuente, vuelta]);
    const releer = useCallback(() => setVuelta((v) => v + 1), []);
    return { ...estado, releer };
}

// ── Lo escrito desde aquí y su acuse ─────────────────────────────────────────

export type EstadoEnvio = "enviando" | "en-cola" | "entregado" | "hecho" | "rechazado" | "caducado" | "fallo" | "no-enviado";

export interface EnvioLocal {
    clave: string;
    /** Id que dio la puerta (null mientras se envía o si no se envió). */
    id: number | null;
    /** Lo que se ve en el hilo: el texto o la orden. */
    texto: string;
    iniciado: number;
    estado: EstadoEnvio;
    detalle?: string;
    entrada: EntradaEnvio;
}

const ACUSES_CADA_MS = 3_000;
const ACUSES_VALIDOS = new Set<EstadoEnvio>(["entregado", "hecho", "rechazado", "caducado", "fallo"]);

/** Palabras para un envío que la puerta no aceptó (el servidor decide; aquí solo se traduce). */
export function motivoNoEnviado(r: { estado: number; codigo?: string; error: string }): string {
    if (r.estado === 403 && r.codigo === "solo-dueno") return "Esta orden solo la puede dar un dueño de MetaGenesis";
    if (r.estado === 403) return "Tu cuenta no tiene acceso a MetaGenesis";
    if (r.estado === 401) return TEXTO_SIN_SESION;
    if (r.estado === 409) return "Ese envío ya estaba en la puerta; no se mandó otra vez";
    if (r.estado === 429) return "Demasiados envíos seguidos; espera un minuto y vuelve a intentarlo";
    if (r.estado === 503) return "No se pudo comprobar tu permiso; no se envió nada";
    if (r.estado === 400) return `La puerta no aceptó la forma del mensaje${r.error ? `: ${r.error}` : ""}`;
    if (r.estado === 0) return "La puerta de datos del A1 no responde; no se envió nada";
    return r.error || "No se envió";
}

/** Lo que dice cada envío en el hilo. `destino` es quién lo recoge: la Mac o el A1. */
export function textoEnvio(e: EnvioLocal, ahora: number, destino: Origen): string {
    const quien = destino === "a1" ? "al A1" : "a la Mac";
    const recoge = destino === "a1" ? "El A1" : "La Mac";
    if (e.estado === "enviando") return "Enviando a la puerta del A1…";
    if (e.estado === "en-cola") return `En la puerta del A1 · esperando ${quien} desde ${momentoTexto(e.iniciado, ahora)}`;
    if (e.estado === "entregado") return `${recoge} lo recogió · en marcha`;
    if (e.estado === "hecho") return `Hecho${e.detalle ? ` · ${e.detalle}` : ""}`;
    if (e.estado === "rechazado") return `${recoge} lo rechazó${e.detalle ? `: ${e.detalle}` : ""}`;
    if (e.estado === "caducado") return `Caducó sin ejecutarse (${destino === "a1" ? "el A1 no lo recogió" : "la Mac estaba apagada"}); vuelve a enviarla si aún la quieres`;
    if (e.estado === "fallo") return `Falló al ejecutarse${e.detalle ? `: ${e.detalle}` : ""}`;
    return `No enviado: ${e.detalle ?? "sin motivo"}`;
}

/**
 * Envía por la puerta (nunca por una cola local: si falla, se dice y el borrador se queda) y sigue
 * el acuse de cada envío cada 3 s mientras espera. «Hecho» solo con el acuse `hecho` (§8).
 */
export function useEnvios(cliente: ClienteChatsGenesis) {
    const [envios, setEnvios] = useState<EnvioLocal[]>([]);
    const contador = useRef(0);

    const enviar = useCallback(async (entrada: EntradaEnvio, texto: string): Promise<{ ok: true } | { ok: false; motivo: string }> => {
        contador.current += 1;
        const clave = `local-${Date.now()}-${contador.current}`;
        const base: EnvioLocal = { clave, id: null, texto, iniciado: Date.now(), estado: "enviando", entrada };
        setEnvios((l) => [...l, base]);
        let r: Awaited<ReturnType<ClienteChatsGenesis["enviar"]>>;
        try {
            r = await cliente.enviar(entrada);
        } catch {
            r = { ok: false, estado: 0, error: "sin respuesta" };
        }
        if (r.ok) {
            const id = r.id;
            setEnvios((l) => l.map((e) => (e.clave === clave ? { ...e, id, estado: "en-cola" } : e)));
            return { ok: true };
        }
        const motivo = motivoNoEnviado(r);
        setEnvios((l) => l.map((e) => (e.clave === clave ? { ...e, estado: "no-enviado", detalle: motivo } : e)));
        return { ok: false, motivo };
    }, [cliente]);

    const quitar = useCallback((clave: string) => setEnvios((l) => l.filter((e) => e.clave !== clave)), []);

    const pendientes = envios.filter((e) => e.id !== null && (e.estado === "en-cola" || e.estado === "entregado")).map((e) => e.id as number);
    const firma = pendientes.join(",");
    useEffect(() => {
        if (firma === "") return;
        const ids = firma.split(",").map(Number);
        let vivo = true;
        const mirar = async () => {
            try {
                const acuses = await cliente.acuses(ids);
                if (!vivo) return;
                setEnvios((l) => l.map((e) => {
                    const a = e.id !== null ? acuses[e.id] : undefined;
                    if (!a || !ACUSES_VALIDOS.has(a.estado as EstadoEnvio)) return e;
                    return { ...e, estado: a.estado as EstadoEnvio, detalle: a.detalle };
                }));
            } catch { /* sin puerta: el envío sigue «en la puerta» y se vuelve a mirar */ }
        };
        void mirar();
        const id = window.setInterval(() => void mirar(), ACUSES_CADA_MS);
        return () => { vivo = false; window.clearInterval(id); };
    }, [cliente, firma]);

    return { envios, enviar, quitar };
}

// ── La cabecera ──────────────────────────────────────────────────────────────

export interface CabeceraEspejoProps {
    latido: Latido;
    fallo: FalloFeed | null;
    cargado: boolean;
    /** Quién sube la copia: la Mac (dirección, puentes A y C) o el A1 (puente B). */
    origen: Origen;
    /** Qué se lee: cambia la frase de cuando la puerta cae. */
    queEs: "direccion" | "puente";
    ahora: number;
    onReintentar?: () => void;
}

type Tono = "vivo" | "viejo" | "caido" | "neutro";

/** Frase y tono de la cabecera (puro: lo prueban las pruebas sin montar nada). */
export function lineaCabecera(p: Omit<CabeceraEspejoProps, "onReintentar">): { tono: Tono; texto: string } {
    const nombre = p.origen === "a1" ? "el A1" : "la Mac";
    const Nombre = p.origen === "a1" ? "El A1" : "La Mac";
    if (p.fallo?.estado === 401) return { tono: "neutro", texto: TEXTO_SIN_SESION };
    if (p.fallo?.estado === 403) {
        return { tono: "neutro", texto: p.queEs === "puente" ? "Este puente solo lo puede leer un dueño de MetaGenesis" : "Tu cuenta no tiene acceso a MetaGenesis" };
    }
    if (p.fallo?.estado === 503) return { tono: "caido", texto: "No se pudo comprobar tu permiso para leer este chat; se reintenta solo" };
    if (p.fallo?.estado === 0) {
        const desde = momentoTexto(p.fallo.desde, p.ahora);
        return {
            tono: "caido",
            texto: p.queEs === "direccion"
                ? `La puerta de datos del A1 no responde desde ${desde}. Desde aquí no se pueden leer ni escribir los chats de dirección; en la Mac siguen en /genesis`
                : `La puerta de datos del A1 no responde desde ${desde}. Desde aquí no se puede leer ni escribir este puente; en Telegram sigue funcionando`,
        };
    }
    if (!p.cargado) return { tono: "neutro", texto: "Leyendo la copia en la puerta del A1…" };
    if (!p.latido) return { tono: "viejo", texto: `La puerta del A1 no tiene ningún latido de ${nombre}: todavía no hay copia en vivo` };
    const { vivo, haceMs } = estadoEspejo(p.latido, p.ahora);
    if (vivo) return { tono: "vivo", texto: `En vivo desde ${nombre} · copia de hace ${haceTexto(haceMs ?? 0)}` };
    const t = Date.parse(p.latido.t);
    return {
        tono: "viejo",
        texto: `${Nombre} no responde desde ${momentoTexto(t, p.ahora)} (hace ${haceTexto(haceMs ?? p.ahora - t)}). Ves la última copia. Lo que escribas espera en la puerta del A1; las órdenes caducan a los 30 min`,
    };
}

const ESTILO: Record<Tono, string> = {
    vivo: "border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-100",
    viejo: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    caido: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    neutro: "border-white/10 bg-white/[0.03] text-white/70",
};

/** Siempre visible encima del hilo: de dónde viene lo que se ve y si está vivo. */
export function CabeceraEspejo(props: CabeceraEspejoProps) {
    const { tono, texto } = lineaCabecera(props);
    // Sin sesión: el aviso común, con «Iniciar sesión» y la guía (GUI1021N), no una frase suelta.
    if (props.fallo?.estado === 401) {
        return (
            <div data-testid="cabecera-espejo" data-tono={tono} className="shrink-0">
                <AvisoSesion compacto texto={texto} />
            </div>
        );
    }
    const Icono = tono === "vivo" ? Radio : tono === "caido" ? CloudOff : props.fallo?.estado === 403 ? Lock : props.cargado ? TimerOff : Loader2;
    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="cabecera-espejo"
            data-tono={tono}
            className={cn("flex min-w-0 shrink-0 items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-snug", ESTILO[tono])}
        >
            <Icono className={cn("mt-0.5 size-3.5 shrink-0", tono === "vivo" && "motion-safe:animate-pulse", Icono === Loader2 && "motion-safe:animate-spin")} aria-hidden />
            <span className="min-w-0 flex-1 break-words">{texto}</span>
            {props.onReintentar && tono === "caido" ? (
                <button
                    type="button"
                    onClick={props.onReintentar}
                    className="shrink-0 cursor-pointer rounded-md border border-white/20 px-2 py-0.5 text-[11px] opacity-90 transition-opacity hover:opacity-100"
                >
                    Reintentar
                </button>
            ) : null}
        </div>
    );
}
