"use client";

/*
 * PanelEnVivo (2026-10-10) — una estación EN VIVO sincronizada de Omnifrecuencias o Audiomorphic:
 * estado de la sesión, reloj común con la precisión MEDIDA (± ms y su cota), canales reales,
 * escuchar aquí, y los botones que mandan a TODOS (iniciar, pausar, reanudar, terminar) cuando
 * este medio tiene el control. SOP: architecture/estaciones-en-vivo-parametricas.md §6.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Copy, ExternalLink, Headphones, KeyRound, Lock, Pause, Play, Radio, RotateCcw, Square,
  Timer, Volume2, VolumeX, Waves, Orbit, Wifi, WifiOff, Cable, Server,
} from "lucide-react";
import { PanelParametros } from "@/components/protomolecula/panel-parametros";
import { ATOMO_ESTACION, parametrosDeSesion, sesionDeParametros } from "@/lib/protomolecula/adaptador-estaciones";
import { claveDe } from "@/lib/protomolecula/parametros";
import type { Operacion } from "@/lib/protomolecula/tipos";
import { estacionGlobal, useEstacionGlobal } from "@/lib/estaciones/estacion-global";
import { registroDe } from "@/lib/estaciones/llaves-locales";
import {
  ETIQUETA_FUENTE_TRANSMISION,
  enlaceDeSesion,
  posicionEn,
  type FaseSesion,
} from "@/lib/estaciones/transmision-parametrica";
import { estadoCanalInternet, type EstadoCanalEstacion } from "@/lib/estaciones/canales-estacion";
import { estadoCanalRele } from "@/lib/estaciones/canal-rele";
import { formatearMs, textoReloj } from "./formato-en-vivo";
import { BotonFondoAudiomorphic } from "./boton-fondo-audiomorphic";

const AudiomorphicCanvas = dynamic(
  () => import("@/components/audiomorphic/audiomorphic-canvas").then((m) => m.AudiomorphicCanvas),
  { ssr: false },
);

const ETIQUETA_FASE: Record<FaseSesion, string> = {
  esperando: "Esperando a que empiece",
  sonando: "En vivo",
  pausada: "En pausa",
  terminada: "Terminada",
};

type CanalFoto = { tipo: string; etiqueta: string; abierto: boolean };

function tieneEstado(c: CanalFoto): c is CanalFoto & { estado: () => EstadoCanalEstacion } {
  return typeof (c as { estado?: unknown }).estado === "function";
}

/**
 * Fase y motivo del canal (S1010-ES2): de su propio `estado()` si lo trae; si es el de internet o el
 * del relé propio, del canal vivo de la pestaña (la foto de la sesión solo copia tipo, etiqueta y
 * abierto); si no, null.
 */
function estadoDeCanal(c: CanalFoto): EstadoCanalEstacion | null {
  try {
    if (tieneEstado(c)) return c.estado();
    if (c.tipo === "internet") return estadoCanalInternet();
    if (c.tipo === "rele") return estadoCanalRele();
    return null;
  } catch {
    return null;
  }
}

/** Lo que se dice si un canal en error no trae motivo: nombra al canal que falla, no a otro. */
const SIN_MOTIVO: Record<string, string> = {
  internet: "Supabase Realtime no dio motivo",
  rele: "el relé propio no dio motivo",
};

function IconoCanal({ tipo }: { tipo: string }) {
  if (tipo === "internet") return <Wifi className="h-4 w-4" aria-hidden />;
  if (tipo === "rele") return <Server className="h-4 w-4" aria-hidden />;
  return <Cable className="h-4 w-4" aria-hidden />;
}

const boton =
  "inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 text-sm text-white/85 transition-colors duration-200 hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40";
const botonFuerte =
  "inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-emerald-500/90 px-4 text-sm font-semibold text-black transition-colors duration-200 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";

export function PanelEnVivo({ href }: { href: string }) {
  const g = useEstacionGlobal();
  const [tic, setTic] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void estacionGlobal()
      .sintonizar(href)
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) setAviso(r.motivo ?? "No se pudo sintonizar la estación.");
        // El minicontrol global aparece para seguir oyéndola al cambiar de página.
        window.dispatchEvent(new CustomEvent("starseed:estacion-sintonizar", { detail: { href } }));
      });
    return () => {
      vivo = false;
    };
  }, [href]);

  useEffect(() => {
    const h = setInterval(() => setTic((n) => n + 1), 500);
    return () => clearInterval(h);
  }, []);

  const s = g.sesion;
  const sesion = estacionGlobal().sesionActual();
  const ahora = sesion ? sesion.ahora() : 0;
  const pos = useMemo(() => (s ? posicionEn(s.estado, ahora) : null), [s, ahora, tic]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = pos?.params ?? null;
  // La entonación se pinta con el MISMO modelo de parámetros que el panel de la Protomolécula.
  const lienzo = useMemo(() => (params ? parametrosDeSesion(params) : null), [params]);
  const controles = useMemo(
    () => (lienzo ? lienzo.parametros.map((p) => ({ ref: { atomoId: ATOMO_ESTACION, parametroId: p.id }, parametro: p, atomo: "Estación" })) : []),
    [lienzo],
  );

  if (!s || !pos) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-white/70" aria-live="polite">
        {aviso ?? (g.cargando ? "Conectando con la estación…" : g.error ?? "Preparando la estación…")}
      </section>
    );
  }

  const f = s.ficha;
  const Icono = f.fuente === "omnifrecuencias" ? Waves : Orbit;
  const registro = registroDe(f.id);
  const enlaceCompartir = enlaceDeSesion(f, { token: registro?.token ?? undefined });
  const sonando = pos.fase === "sonando";
  const reloj = textoReloj(s.reloj);

  const copiar = async (texto: string, que: string) => {
    try {
      await navigator.clipboard.writeText(new URL(texto, window.location.origin).toString());
      setCopiado(que);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setAviso("El portapapeles no responde en este navegador.");
    }
  };

  const mandar = async (tipo: "iniciar" | "pausar" | "reanudar" | "terminar") => {
    const r = await estacionGlobal().controlar(tipo);
    setAviso(r.ok ? null : r.motivo ?? "No se pudo mandar la orden.");
  };

  const copiarControl = async () => {
    const c = registroDe(f.id)?.control;
    if (!c) return;
    await copiar(enlaceDeSesion(f, { token: registro?.token ?? undefined, control: c }), "control");
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/40 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <Icono className="h-5 w-5 text-cyan-300" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{f.titulo}</h2>
            <p className="text-xs text-white/60">{ETIQUETA_FUENTE_TRANSMISION[f.fuente]}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${sonando ? "border-emerald-400/40 text-emerald-300" : "border-white/10 text-white/70"}`}>
            <Radio className="h-3.5 w-3.5" aria-hidden /> {ETIQUETA_FASE[pos.fase]}
            {sonando || pos.fase === "pausada" ? ` · ${formatearMs(pos.posicionMs)}` : ""}
          </span>
          {f.privada && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 px-2.5 py-1 text-amber-200">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Privada · cifrada
            </span>
          )}
        </div>
      </header>

      {f.fuente === "audiomorphic" && pos.params.tipo === "audiomorphic" && (
        <>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <AudiomorphicCanvas params={pos.params.visual as never} withBackground paused={!sonando} className="absolute inset-0" />
          </div>
          <BotonFondoAudiomorphic visual={pos.params.visual} />
        </>
      )}

      {pos.params.tipo === "omnifrecuencias" && (
        <ul className="flex flex-wrap gap-2" aria-label="Entonación">
          {pos.params.entonacion.osciladores.map((o) => (
            <li key={o.id} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/75">
              {o.nombre ? `${o.nombre} · ` : ""}{o.f.toLocaleString("es", { maximumFractionDigits: 3 })} Hz
              {o.trans ? ` → ${o.trans.b.f.toLocaleString("es", { maximumFractionDigits: 3 })} Hz` : ""}
              {o.pulso ? ` · pulsos ${o.pulso} Hz` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
            <Timer className="h-3.5 w-3.5" aria-hidden /> Reloj común
          </p>
          <p className="mt-1 text-sm text-white/85" data-testid="precision-reloj">{reloj.principal}</p>
          {reloj.detalle && <p className="mt-0.5 text-xs text-white/55">{reloj.detalle}</p>}
          {g.motor.latenciaMs !== null && (
            <p className="mt-0.5 text-xs text-white/55">
              Salida de audio: {g.motor.latenciaMs.toLocaleString("es", { maximumFractionDigits: 1 })} ms de latencia compensada
              {g.motor.baseTiempo === "salida" ? " (medida por el navegador en el altavoz)" : " (la que declara el navegador; los auriculares Bluetooth pueden añadir más)"}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
            <Cable className="h-3.5 w-3.5" aria-hidden /> Por dónde llega
          </p>
          {s.canales.length === 0 ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-white/70"><WifiOff className="h-4 w-4" aria-hidden /> Sin canales abiertos</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5 text-sm text-white/80">
              {s.canales.map((c, i) => {
                const e = estadoDeCanal(c);
                const abierto = e ? e.fase === "abierto" : c.abierto;
                return (
                  <li key={`${c.etiqueta}-${i}`} className={`flex items-center gap-2 ${e?.fase === "error" ? "flex-wrap" : ""}`}>
                    <IconoCanal tipo={c.tipo} />
                    <span className="truncate">{c.etiqueta}</span>
                    {e?.fase === "error" ? (
                      <span role="status" className="basis-full break-words pl-6 text-xs text-amber-200/90">
                        sin conexión: {e.motivo ?? SIN_MOTIVO[c.tipo] ?? "el canal no dio motivo"}
                      </span>
                    ) : (
                      <span className={`ml-auto text-xs ${abierto ? "text-emerald-300" : "text-white/45"}`}>
                        {abierto ? "abierto" : e?.fase === "cerrado" ? "cerrado" : e ? "conectando…" : "conectando"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1 text-xs text-white/55">
            {s.oyentes === null ? "Conectados: sin dato de presencia" : `Conectados además de ti: ${s.oyentes}`}
            {!s.control && (s.anfitrionVisto === null ? " · aún no se ha oído al anfitrión" : " · anfitrión presente")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {f.fuente === "omnifrecuencias" && (g.motor.necesitaGesto ? (
          <button type="button" className={botonFuerte} onClick={() => void estacionGlobal().escuchar()}>
            <Headphones className="h-4 w-4" aria-hidden /> Escuchar aquí
          </button>
        ) : (
          <button type="button" className={boton} onClick={() => estacionGlobal().silenciar(!g.silenciada)} aria-pressed={g.silenciada}>
            {g.silenciada ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            {g.silenciada ? "Activar sonido aquí" : "Silenciar aquí"}
          </button>
        ))}
        {f.fuente === "omnifrecuencias" && (
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-white/70">
            <span>Volumen aquí</span>
            <input type="range" min={0} max={1} step={0.01} value={g.volumen}
              onChange={(e) => estacionGlobal().volumen(Number(e.target.value))}
              className="w-28 cursor-pointer accent-emerald-400" aria-label="Volumen en este aparato" />
          </label>
        )}
      </div>

      {s.control && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
          <p className="text-xs text-emerald-200/90">
            Tienes el control: cada orden se programa 0,6 s por delante en el reloj común para que suene a la vez en todos los medios.
          </p>
          <div className="flex flex-wrap gap-2">
            {(pos.fase === "esperando" || pos.fase === "terminada") && (
              <button type="button" className={botonFuerte} onClick={() => void mandar("iniciar")}>
                <Play className="h-4 w-4" aria-hidden /> Iniciar para todos
              </button>
            )}
            {pos.fase === "sonando" && (
              <button type="button" className={boton} onClick={() => void mandar("pausar")}>
                <Pause className="h-4 w-4" aria-hidden /> Pausar para todos
              </button>
            )}
            {pos.fase === "pausada" && (
              <button type="button" className={botonFuerte} onClick={() => void mandar("reanudar")}>
                <Play className="h-4 w-4" aria-hidden /> Reanudar para todos
              </button>
            )}
            {(pos.fase === "sonando" || pos.fase === "pausada") && (
              <>
                <button type="button" className={boton} onClick={() => void mandar("iniciar")}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Empezar de nuevo
                </button>
                <button type="button" className={boton} onClick={() => void mandar("terminar")}>
                  <Square className="h-4 w-4" aria-hidden /> Terminar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={boton} onClick={() => void copiar(enlaceCompartir, "enlace")}>
          <Copy className="h-4 w-4" aria-hidden />
          {copiado === "enlace" ? "Enlace copiado" : f.privada ? "Copiar invitación" : "Copiar enlace"}
        </button>
        {s.control && registro?.control && (
          <button type="button" className={boton} onClick={() => void copiarControl()} title="Lleva la llave de la estación: solo para tus otros aparatos">
            <KeyRound className="h-4 w-4" aria-hidden />
            {copiado === "control" ? "Enlace de control copiado" : "Controlar desde otro aparato"}
          </button>
        )}
        {f.enlace.startsWith("/") ? (
          <Link href={f.enlace} className={boton}>
            <ExternalLink className="h-4 w-4" aria-hidden /> Abrir en su app
          </Link>
        ) : (
          <a href={f.enlace} target="_blank" rel="noopener noreferrer" className={boton}>
            <ExternalLink className="h-4 w-4" aria-hidden /> Abrir en {f.fuente === "omnifrecuencias" ? "Omnifrecuencias" : "Audiomorphic"}
          </a>
        )}
      </div>

      {s.descartados > 0 && (
        <p className="text-xs text-amber-200/90">
          Se descartaron {s.descartados} mensajes con firma o datos no válidos (nadie más que el anfitrión puede mandar a esta estación).
        </p>
      )}
      {(aviso || g.error || g.motor.error) && (
        <p className="text-xs text-amber-200/90" role="status">{aviso ?? g.error ?? g.motor.error}</p>
      )}
      {f.fuente === "audiomorphic" && (
        <p className="text-xs text-white/50">
          La configuración de la espiral está sincronizada; la imagen se genera en cada aparato y reacciona a su propio sonido, así que no es idéntica fotograma a fotograma.
        </p>
      )}
    </section>
  );
}
