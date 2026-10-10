"use client";

/*
 * MinicontrolEstacion (2026-10-10) — la estación en vivo sigue sonando en TODO el OS: barra
 * flotante con su estado, la precisión medida del reloj común, pausar (para todos si tienes el
 * control; si no, silenciar aquí), volumen y salir de la estación. La carga perezosa la hace
 * `montaje-estacion-vivo.tsx`. SOP: architecture/estaciones-en-vivo-parametricas.md §5.3.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headphones, Pause, Play, Radio, Volume2, VolumeX, X } from "lucide-react";
import { estacionGlobal, useEstacionGlobal } from "@/lib/estaciones/estacion-global";
import { posicionEn, PREFIJO_VIVO } from "@/lib/estaciones/transmision-parametrica";
import { formatearMs, textoReloj } from "./formato-en-vivo";

const icono = "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white";

export function MinicontrolEstacion() {
  const g = useEstacionGlobal();
  const ruta = usePathname();
  const [, setTic] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);

  // Tras recargar: vuelve a sintonizar la estación que había (el sonido espera a un toque).
  useEffect(() => {
    const est = estacionGlobal();
    if (est.sesionActual()) return;
    const recordada = est.recordada();
    if (recordada) void est.sintonizar(recordada);
  }, []);

  useEffect(() => {
    const h = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, []);

  const s = g.sesion;
  if (!s) return null;
  if (ruta?.startsWith(`${PREFIJO_VIVO}${s.ficha.id}`)) return null; // ya está el panel completo

  const sesion = estacionGlobal().sesionActual();
  const pos = posicionEn(s.estado, sesion ? sesion.ahora() : 0);
  const sonando = pos.fase === "sonando";
  const reloj = textoReloj(s.reloj);
  const esOmni = s.ficha.fuente === "omnifrecuencias";

  const pausar = async () => {
    if (s.control) {
      const r = await estacionGlobal().controlar(sonando ? "pausar" : pos.fase === "pausada" ? "reanudar" : "iniciar");
      setAviso(r.ok ? null : r.motivo ?? null);
    } else {
      estacionGlobal().silenciar(!g.silenciada);
    }
  };

  return (
    <div
      role="region"
      aria-label="Estación en vivo"
      className="fixed bottom-24 left-3 z-[89] flex max-w-[calc(100vw-1.5rem)] items-center gap-1.5 rounded-full border border-white/15 bg-black/75 py-1 pl-3 pr-1.5 text-white shadow-2xl backdrop-blur-xl sm:bottom-6 sm:left-6 sm:max-w-sm"
    >
      <Radio className={`h-4 w-4 shrink-0 ${sonando ? "text-emerald-300" : "text-white/50"}`} aria-hidden />
      <Link href={g.href ?? `${PREFIJO_VIVO}${s.ficha.id}`} className="min-w-0 cursor-pointer px-1">
        <span className="block truncate text-xs font-medium">{s.ficha.titulo}</span>
        <span className="block truncate text-[11px] text-white/60">
          {sonando ? `En vivo · ${formatearMs(pos.posicionMs)}` : pos.fase === "pausada" ? "En pausa" : pos.fase === "terminada" ? "Terminada" : "Esperando"}
          {" · "}
          {reloj.corto}
        </span>
      </Link>
      {esOmni && g.motor.necesitaGesto ? (
        <button type="button" className={icono} onClick={() => void estacionGlobal().escuchar()} aria-label="Escuchar aquí" title="Escuchar aquí">
          <Headphones className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          className={icono}
          onClick={() => void pausar()}
          aria-label={s.control ? (sonando ? "Pausar para todos" : "Reanudar para todos") : g.silenciada ? "Activar sonido aquí" : "Silenciar aquí"}
          title={s.control ? (sonando ? "Pausar para todos" : "Reanudar para todos") : g.silenciada ? "Activar sonido aquí" : "Silenciar aquí"}
        >
          {s.control ? (sonando ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />)
            : g.silenciada ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        </button>
      )}
      {esOmni && !g.motor.necesitaGesto && (
        <input
          type="range" min={0} max={1} step={0.01} value={g.volumen}
          onChange={(e) => estacionGlobal().volumen(Number(e.target.value))}
          className="hidden w-20 cursor-pointer accent-emerald-400 sm:block"
          aria-label="Volumen en este aparato"
        />
      )}
      <button type="button" className={icono} onClick={() => estacionGlobal().salir()} aria-label="Salir de la estación" title="Salir de la estación">
        <X className="h-4 w-4" aria-hidden />
      </button>
      {aviso && (
        <span role="status" className="absolute -top-9 left-2 max-w-[90vw] truncate rounded-full border border-white/10 bg-black/85 px-3 py-1 text-[11px] text-amber-200">
          {aviso}
        </span>
      )}
    </div>
  );
}

export default MinicontrolEstacion;
