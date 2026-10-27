"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Volume2 } from "lucide-react";
import { FRAME_ALLOW, FRAME_SANDBOX } from "@/components/browser/web-frame";
import { conParent, detectarFormato } from "@/lib/estaciones/formato";
import type { Estacion } from "@/lib/estaciones/tipos";
import { anuncio as anuncioMalla, codificar, decodificar, fusionar, type AnuncioDisponibilidad, type AnuncioRecibido, type RegistroDisponibilidad } from "@/lib/recursos/disponibilidad";
import { armarArbol, recolocar } from "@/lib/recursos/arbol-relevo";
import { contextoMalla, crearCargadorMalla, puedeSubirPrestado, type ConexiónCargadorMalla } from "@/lib/recursos/hls-malla-loader";
import type { FragmentLoaderConstructor } from "hls.js";

interface Props {
    estacion: Pick<Estacion, "enlace" | "tipo" | "titulo"> &
        Partial<Pick<Estacion, "en_malla" | "visibilidad" | "owner_id">>;
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

// ─── Malla (§10): pedir y repartir segmentos por la red; el origen queda de respaldo ───
const CANAL_DISPONIBILIDAD = "hls.disponibilidad", CANAL_PEDIDO = "hls.pedido", CANAL_TROZO = "hls.trozo";
const TOTAL_MALLA = 10_000, SEGMENTOS_EN_CACHE = 64, TOPE_SUBIDA_KBPS = 64, VENTANA_SUBIDA_MS = 60_000;
const servidos = new Map<string, Map<number, Uint8Array>>(); let subidaBytes = 0, subidaDesde = 0;
/** Id del elemento: un rastro del enlace; la URL nunca sale por la malla. */
function idElemento(enlace: string): string {
    let h = 5381; for (let i = 0; i < enlace.length; i++) h = ((h << 5) + h + enlace.charCodeAt(i)) | 0;
    return `h-${(h >>> 0).toString(36)}`;
}
function cabeEnElTope(bytes: number): boolean {
    const t = Date.now();
    if (t - subidaDesde >= VENTANA_SUBIDA_MS) { subidaDesde = t; subidaBytes = 0; }
    return puedeSubirPrestado(TOPE_SUBIDA_KBPS, subidaBytes, VENTANA_SUBIDA_MS, bytes);
}
function esAnuncio(x: unknown, propio: string, elemento: string): x is AnuncioDisponibilidad {
    const a = x as Partial<AnuncioDisponibilidad> | null;
    return !!a && typeof a.nodo === "string" && a.nodo !== propio && a.elemento === elemento &&
        typeof a.total === "number" && a.total >= 1 && a.total <= 1_000_000 && typeof a.desde === "number" &&
        a.desde >= 0 && typeof a.hasta === "number" && a.hasta >= a.desde && typeof a.bits === "string" && typeof a.t === "number";
}
type ConexiónMalla = { con: ConexiónCargadorMalla; cerrar: () => void };
/** Conexión real para el cargador puro: anuncios y trozos por los enlaces vivos. */
async function conectarMalla(enlace: string, contexto: "publico" | "cuenta"): Promise<ConexiónMalla | null> {
    const [tu, reg, id, meshMod] = await Promise.all([
        import("@/lib/malla/transporte-universal"), import("@/lib/malla/registro-enlaces-locales"),
        import("@/lib/network/identidad-dispositivo"), import("@/lib/network/lan-sync"),
    ]);
    const mesh = meshMod.getSharedMesh(), vecinos = reg.enlacesLocalesVivos().length > 0 || (mesh?.getPeers().some((p) => p.state === "connected" && p.channelOpen) ?? false);
    if (!vecinos) return null;
    const propio = id.identidadDispositivo().syncDeviceId || mesh?.myDeviceId; if (!propio) return null;
    const fuentes = reg.enlacesLocalesVivos()
        .map((e) => ({
            nodoId: e.par.syncDeviceId ?? "",
            subidaKbps: e.capacidadKbps() ?? undefined,
            latenciaMs: e.rttMs() ?? undefined,
        }))
        .filter((n) => n.nodoId !== "" && n.nodoId !== propio);
    const arbol = fuentes.length > 0
        ? armarArbol({ nodoId: propio, subidaKbps: TOPE_SUBIDA_KBPS }, fuentes, TOPE_SUBIDA_KBPS)
        : undefined;
    const elemento = idElemento(enlace), soloCuenta = contexto === "cuenta", ahora = () => Date.now();
    const esperados = new Map<string, (b: Uint8Array | null) => void>(); let recibidos: AnuncioRecibido[] = [];
    const bajas: (() => void)[] = [];
    const con: ConexiónCargadorMalla = {
        elemento, registro: new Map() as RegistroDisponibilidad,
        ...(arbol ? { arbol, receptor: propio } : {}),
        verificar: (bytes) => bytes.byteLength > 0,
        anunciar: (indice, bytes) => {
            const trozos = servidos.get(elemento) ?? new Map<number, Uint8Array>();
            if (trozos.has(indice)) return;
            trozos.set(indice, bytes);
            if (trozos.size > SEGMENTOS_EN_CACHE) trozos.delete(trozos.keys().next().value ?? 0);
            servidos.set(elemento, trozos);
            const piezas = anuncioMalla(propio, elemento, TOTAL_MALLA, [...trozos.keys()].sort((a, b) => a - b), ahora());
            for (const pieza of piezas) {
                for (const e of reg.enlacesLocalesVivos()) if (!soloCuenta) void tu.enviarMensaje({ enlaceId: e.id }, CANAL_DISPONIBILIDAD, pieza);
                for (const p of mesh?.getPeers() ?? []) if (p.channelOpen) void tu.enviarMensaje({ syncDeviceId: p.deviceId }, CANAL_DISPONIBILIDAD, pieza);
            }
        },
        pedir: (nodo, indice) => new Promise((resolver) => {
            const pid = `${indice}-${Math.random().toString(36).slice(2)}`;
            esperados.set(pid, resolver);
            setTimeout(() => { if (esperados.delete(pid)) resolver(null); }, 5_000);
            void tu.enviarMensaje({ syncDeviceId: nodo }, CANAL_PEDIDO, { elemento, indice, pid, responde: propio });
        }),
        ahora,
        esperar: (ms) => new Promise((r) => { setTimeout(r, ms); }),
    };
    const conocidos = new Set(fuentes.map((f) => f.nodoId));
    bajas.push(reg.suscribirEnlacesLocales(() => {
        const vivos = new Set(reg.enlacesLocalesVivos().map((e) => e.par.syncDeviceId).filter((x): x is string => !!x));
        for (const id of Array.from(conocidos)) {
            if (vivos.has(id)) continue;
            conocidos.delete(id);
            const actual = con.arbol;
            if (actual) con.arbol = recolocar(actual, id);
        }
    }));
    bajas.push(tu.alRecibirMensaje(CANAL_DISPONIBILIDAD, (m) => {
        if (soloCuenta && m.origen.tipo !== "cuenta") return;
        if (!esAnuncio(m.cuerpo, propio, elemento)) return;
        recibidos.push({ anuncio: m.cuerpo, recibidoEn: ahora() });
        if (recibidos.length > 256) recibidos = recibidos.slice(-256);
        try { con.registro = fusionar(recibidos); } catch { recibidos.pop(); }
    }));
    bajas.push(tu.alRecibirMensaje(CANAL_PEDIDO, (m) => {
        if (soloCuenta && m.origen.tipo !== "cuenta") return;
        const p = m.cuerpo as { elemento?: string; indice?: number; pid?: string; responde?: string } | null;
        if (!p || p.elemento !== elemento || typeof p.indice !== "number" || p.indice < 0 ||
            typeof p.pid !== "string" || !p.pid || typeof p.responde !== "string") return;
        const bytes = servidos.get(elemento)?.get(p.indice);
        if (!bytes || !cabeEnElTope(bytes.byteLength)) return;
        subidaBytes += bytes.byteLength;
        void tu.enviarMensaje({ syncDeviceId: p.responde }, CANAL_TROZO, { pid: p.pid, q: codificar(bytes) });
    }));
    bajas.push(tu.alRecibirMensaje(CANAL_TROZO, (m) => {
        const t = m.cuerpo as { pid?: string; q?: string } | null;
        if (!t || typeof t.pid !== "string" || typeof t.q !== "string" || t.q.length > 12_000_000) return;
        const resolver = esperados.get(t.pid);
        if (!resolver) return;
        esperados.delete(t.pid);
        try { resolver(decodificar(t.q)); } catch { resolver(null); }
    }));
    return { con, cerrar: () => { for (const b of bajas) b(); esperados.clear(); servidos.delete(elemento); } };
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
        let hls: { destroy(): void } | null = null, malla: ConexiónMalla | null = null;
        let vivo = true;
        import("hls.js").then(async (m) => {
            if (!vivo) { return; }
            const Hls = m.default;
            if (!Hls.isSupported()) { setForzarPestana(true); return; }
            const est = { enMalla: estacion.en_malla, visibilidad: estacion.visibilidad, ownerId: estacion.owner_id };
            let porMalla = contextoMalla(est, cuentaId);
            if (!porMalla && est.enMalla && est.visibilidad !== "publica") {
                const uid = await import("@/lib/consumo/usuario").then((u) => u.uidActual()).catch(() => null);
                porMalla = contextoMalla(est, uid);
            }
            let con: ConexiónMalla | null = null;
            if (porMalla) {
                try { con = await conectarMalla(enlace, porMalla); } catch { con = null; }
                if (!vivo) { con?.cerrar(); return; }
            }
            const instancia = con
                ? new Hls({ fLoader: crearCargadorMalla(con.con, Hls.DefaultConfig.loader as unknown as FragmentLoaderConstructor) })
                : new Hls();
            if (con) {
                instancia.on(Hls.Events.FRAG_LOADED, (_e, d) => {
                    const sn = d.frag?.sn;
                    if (typeof sn === "number" && sn >= 0) con.con.anunciar(sn, new Uint8Array(d.payload));
                });
                malla = con;
            }
            instancia.loadSource(enlace);
            instancia.attachMedia(v);
            hls = instancia;
        }).catch(() => { if (vivo) setForzarPestana(true); });
        return () => { vivo = false; hls?.destroy(); malla?.cerrar(); };
    }, [f.reproductor, enlace, estacion.en_malla, estacion.visibilidad, estacion.owner_id, cuentaId]);

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
