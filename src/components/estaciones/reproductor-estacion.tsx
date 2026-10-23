"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Volume2 } from "lucide-react";
import { FRAME_ALLOW, FRAME_SANDBOX } from "@/components/browser/web-frame";
import { conParent, detectarFormato } from "@/lib/estaciones/formato";
import type { Estacion } from "@/lib/estaciones/tipos";
import {
    anuncio as anuncioMalla, codificar, decodificar, fusionar,
    type AnuncioDisponibilidad, type AnuncioRecibido, type RegistroDisponibilidad,
} from "@/lib/recursos/disponibilidad";
import { crearCargadorMalla, puedeSubirPrestado, type ConexiónCargadorMalla } from "@/lib/recursos/hls-malla-loader";
import type { FragmentLoaderConstructor } from "hls.js";

interface Props {
    estacion: Pick<Estacion, "enlace" | "tipo" | "titulo"> &
        Partial<Pick<Estacion, "en_malla" | "visibilidad" | "owner_id">>;
    /** Cuenta del que mira: para decidir el contexto «de la cuenta». Falta → solo entra lo público. */
    cuentaId?: string | null;
    className?: string;
    compacto?: boolean;
}

/** Barras del ecualizador de la barra de audio; quietas con prefers-reduced-motion. */
function BarrasAudio() {
    return (
        <span aria-hidden className="flex h-4 items-end gap-0.5">
            {[6, 14, 10, 16, 8].map((alto, i) => (
                <span key={i} className="w-1 rounded bg-emerald-400 animate-pulse motion-reduce:animate-none"
                    style={{ height: alto, animationDelay: `${i * 120}ms` }} />
            ))}
        </span>
    );
}

// ─── Malla (architecture/apps-en-la-malla.md §10): pedir y repartir segmentos por la red ───

export type ContextoMalla = "publico" | "cuenta";

/** La malla solo entra si la estación vive en la malla y el contexto es público o de la cuenta. */
export function contextoMalla(
    e: Partial<Pick<Estacion, "en_malla" | "visibilidad" | "owner_id">>,
    cuentaId?: string | null,
): ContextoMalla | null {
    if (!e.en_malla) return null;
    if (e.visibilidad === "publica") return "publico";
    return e.owner_id && e.owner_id === cuentaId ? "cuenta" : null;
}

const CANAL_DISPONIBILIDAD = "hls.disponibilidad";
const CANAL_PEDIDO = "hls.pedido";
const CANAL_TROZO = "hls.trozo";
/** Techo de índices que delimita los mapas de bits: no dice nada del contenido. */
const TOTAL_MALLA = 10_000;
const SEGMENTOS_EN_CACHE = 64;
/** El medidor real del préstamo llega con «Prestar recursos»; mientras, tope prudencial pequeño. */
const TOPE_SUBIDA_PRESTADA_KBPS = 64;
const VENTANA_SUBIDA_MS = 60_000;

/** Id del elemento: un rastro del enlace y nada más; la URL nunca sale por la malla. */
function idElemento(enlace: string): string {
    let h = 5381;
    for (let i = 0; i < enlace.length; i++) h = ((h << 5) + h + enlace.charCodeAt(i)) | 0;
    return `h-${(h >>> 0).toString(36)}`;
}

const servidos = new Map<string, Map<number, Uint8Array>>(); // por elemento: lo que esta neurona ya es transmisor
let subidaUsadaBytes = 0;
let subidaDesde = 0;

function cabeEnElTopePrestado(bytes: number): boolean {
    const t = Date.now();
    if (t - subidaDesde >= VENTANA_SUBIDA_MS) { subidaDesde = t; subidaUsadaBytes = 0; }
    return puedeSubirPrestado(TOPE_SUBIDA_PRESTADA_KBPS, subidaUsadaBytes, VENTANA_SUBIDA_MS, bytes);
}

interface CuerpoPedido { elemento: string; indice: number; pid: string; responde: string }
interface CuerpoTrozo { pid: string; q: string }

/** Anuncio que llegue, con sus campos de verdad; nada del propio nodo (el eco se descarta). */
function esAnuncio(x: unknown, propioNodo: string | undefined): x is AnuncioDisponibilidad {
    const a = x as Partial<AnuncioDisponibilidad> | null;
    return !!a && typeof a.nodo === "string" && !!a.nodo && a.nodo !== propioNodo &&
        typeof a.elemento === "string" && !!a.elemento &&
        typeof a.total === "number" && a.total >= 1 &&
        typeof a.desde === "number" && a.desde >= 0 &&
        typeof a.hasta === "number" && a.hasta >= a.desde &&
        typeof a.bits === "string" && typeof a.t === "number";
}

interface ConexiónMalla { con: ConexiónCargadorMalla; cerrar: () => void }

/** Conexión real para el cargador puro: recibe anuncios y trozos, atiende pedidos y difunde el propio. */
async function conectarMalla(enlace: string): Promise<ConexiónMalla | null> {
    const [{ alRecibirMensaje, enviarMensaje }, { enlacesLocalesVivos }, { identidadDispositivo }] =
        await Promise.all([
            import("@/lib/malla/transporte-universal"),
            import("@/lib/malla/registro-enlaces-locales"),
            import("@/lib/network/identidad-dispositivo"),
        ]);
    const elemento = idElemento(enlace);
    const propioNodo = identidadDispositivo().syncDeviceId || undefined;
    if (!propioNodo) return null;
    const ahora = () => Date.now();
    const esperados = new Map<string, (b: Uint8Array | null) => void>();
    let recibidos: AnuncioRecibido[] = [];
    const bajas: (() => void)[] = [];
    const con: ConexiónCargadorMalla = {
        elemento, registro: new Map() as RegistroDisponibilidad,
        verificar: (bytes) => bytes.byteLength > 0, // el hash por manifiesto llega con los volúmenes (§7)
        anunciar: (indice, bytes) => {
            const trozos = servidos.get(elemento) ?? new Map<number, Uint8Array>();
            trozos.set(indice, bytes);
            if (trozos.size > SEGMENTOS_EN_CACHE) trozos.delete(trozos.keys().next().value ?? 0);
            servidos.set(elemento, trozos);
            difundir([...trozos.keys()]);
        },
        pedir: (nodo, indice) => new Promise((resolver) => {
            const pid = `${indice}-${Math.random().toString(36).slice(2)}`;
            esperados.set(pid, resolver);
            setTimeout(() => { if (esperados.has(pid)) { esperados.delete(pid); resolver(null); } }, 5000);
            void enviarMensaje({ syncDeviceId: nodo }, CANAL_PEDIDO,
                { elemento, indice, pid, responde: propioNodo } satisfies CuerpoPedido);
        }),
        ahora,
        esperar: (ms) => new Promise((r) => { setTimeout(r, ms); }),
    };
    const difundir = (tengo: number[]) => {
        const orden = [...new Set(tengo)].sort((a, b) => a - b);
        for (const pieza of anuncioMalla(propioNodo, elemento, TOTAL_MALLA, orden, ahora())) {
            for (const e of enlacesLocalesVivos()) {
                void enviarMensaje({ enlaceId: e.id }, CANAL_DISPONIBILIDAD, pieza);
            }
        }
    };
    bajas.push(alRecibirMensaje(CANAL_DISPONIBILIDAD, (m) => {
        if (!esAnuncio(m.cuerpo, propioNodo)) return;
        recibidos.push({ anuncio: m.cuerpo, recibidoEn: ahora() });
        if (recibidos.length > 256) recibidos = recibidos.slice(-256);
        con.registro = fusionar(recibidos);
    }));
    bajas.push(alRecibirMensaje(CANAL_PEDIDO, (m) => {
        const p = m.cuerpo as Partial<CuerpoPedido> | null;
        if (!p || p.elemento !== elemento || typeof p.indice !== "number" || p.indice < 0 ||
            typeof p.pid !== "string" || !p.pid || typeof p.responde !== "string") return;
        const bytes = servidos.get(elemento)?.get(p.indice);
        if (!bytes || !cabeEnElTopePrestado(bytes.byteLength)) return; // sin tope (o sin pieza), no se sirve
        subidaUsadaBytes += bytes.byteLength;
        void enviarMensaje({ syncDeviceId: p.responde }, CANAL_TROZO,
            { pid: p.pid, q: codificar(bytes) } satisfies CuerpoTrozo);
    }));
    bajas.push(alRecibirMensaje(CANAL_TROZO, (m) => {
        const t = m.cuerpo as Partial<CuerpoTrozo> | null;
        if (!t || typeof t.pid !== "string" || typeof t.q !== "string") return;
        const resolver = esperados.get(t.pid);
        if (!resolver) return;
        esperados.delete(t.pid);
        try { resolver(decodificar(t.q)); } catch { resolver(null); }
    }));
    return {
        con,
        cerrar: () => { for (const b of bajas) b(); bajas.length = 0; esperados.clear(); servidos.delete(elemento); },
    };
}

/** Reproductor autoadaptable de una estación: nativo, HLS, marco aislado, interno o pestaña. */
export function ReproductorEstacion({ estacion, className, compacto, cuentaId }: Props) {
    const { enlace, tipo, titulo } = estacion;
    const f = useMemo(() => detectarFormato(enlace, tipo), [enlace, tipo]);
    const medio = useRef<HTMLMediaElement | null>(null);
    const [silencio, setSilencio] = useState(true);
    const [forzarPestana, setForzarPestana] = useState(false);

    useEffect(() => {
        if (f.reproductor !== "hls" || !medio.current) return;
        const v = medio.current as HTMLVideoElement;
        if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = enlace; return; }
        let hls: { destroy(): void } | null = null;
        let malla: ConexiónMalla | null = null;
        let vivo = true;
        const porMalla = contextoMalla(estacion, cuentaId);
        import("hls.js").then(async (mo) => {
            if (!vivo) { return; }
            const Hls = mo.default;
            if (!Hls.isSupported()) { setForzarPestana(true); return; }
            let con: ConexiónMalla | null = null;
            if (porMalla) {
                try { con = await conectarMalla(enlace); } catch { con = null; }
                if (!vivo) { con?.cerrar(); return; }
            }
            const instancia = con
                ? new Hls({ fLoader: crearCargadorMalla(con.con, Hls.DefaultConfig.loader as unknown as FragmentLoaderConstructor) })
                : new Hls();
            if (con) {
                // Lo bajado del origen también se anuncia: al tenerlo, ya es transmisor (§10).
                instancia.on(Hls.Events.FRAG_LOADED, (_e, d) => {
                    const sn = d.frag?.sn;
                    if (typeof sn === "number" && sn >= 0) {
                        con.con.anunciar(sn, new Uint8Array(d.payload));
                    }
                });
                malla = con;
            }
            instancia.loadSource(enlace);
            instancia.attachMedia(v);
            hls = instancia;
        }).catch(() => { if (vivo) setForzarPestana(true); });
        return () => { vivo = false; hls?.destroy(); malla?.cerrar(); };
    }, [f.reproductor, enlace, estacion, cuentaId]);

    const activarSonido = () => {
        setSilencio(false);
        const m = medio.current;
        if (m) { m.muted = false; Promise.resolve(m.play()).catch(() => undefined); }
    };

    const urlMarco = f.reproductor === "marco" && f.urlIncrustable
        ? (f.formato === "twitch" && typeof window !== "undefined"
            ? conParent(f.urlIncrustable, window.location.hostname) : f.urlIncrustable)
        : null;

    let cuerpo: React.ReactNode;
    if (forzarPestana || f.reproductor === "pestana") {
        cuerpo = (
            <div data-testid="reproductor-pestana" className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-white/70">{f.motivo}</p>
                <a href={enlace} target="_blank" rel="noopener noreferrer"
                    className="cursor-pointer rounded-full bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-black min-h-[44px]">
                    Abrir en una pestaña
                </a>
            </div>
        );
    } else if (f.reproductor === "interno") {
        cuerpo = (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-white/70">{f.motivo}</p>
                <Link href={enlace} className="cursor-pointer rounded-full bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-black min-h-[44px]">
                    Abrir en StarSeed
                </Link>
            </div>
        );
    } else if (f.reproductor === "marco" && urlMarco) {
        cuerpo = (
            <iframe src={urlMarco} title={titulo} className="aspect-video w-full"
                sandbox={FRAME_SANDBOX} allow={FRAME_ALLOW} allowFullScreen
                loading="lazy" referrerPolicy="no-referrer" />
        );
    } else if (f.reproductor === "nativo-audio" || compacto || f.soloAudio) {
        cuerpo = (
            <div data-testid="barra-audio" className="flex items-center gap-3 p-3">
                <BarrasAudio />
                <audio ref={(n) => { medio.current = n; }} src={enlace} controls muted autoPlay
                    className="min-w-0 flex-1" aria-label={titulo} />
            </div>
        );
    } else {
        cuerpo = (
            <video ref={(n) => { medio.current = n; }} src={f.reproductor === "hls" ? undefined : enlace}
                controls playsInline muted autoPlay className="aspect-video w-full" aria-label={titulo} />
        );
    }

    return (
        <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/60 ${className ?? ""}`}>
            {cuerpo}
            {silencio && (f.reproductor === "nativo-audio" || f.reproductor === "nativo-video" || f.reproductor === "hls") && !forzarPestana && (
                <button type="button" onClick={activarSonido} aria-label="Activar sonido"
                    className="cursor-pointer absolute bottom-3 right-3 flex min-h-[44px] items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black">
                    <Volume2 className="h-4 w-4" aria-hidden /> Activar sonido
                </button>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-1.5">
                <span className="truncate text-xs text-white/60">{f.motivo}</span>
                <a href={enlace} target="_blank" rel="noopener noreferrer"
                    className="cursor-pointer text-xs text-emerald-300 underline underline-offset-2">
                    Abrir en una pestaña
                </a>
            </div>
        </div>
    );
}
