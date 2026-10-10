"use client";

/*
 * TarjetaEstacion (Ola 1010E · ES1010I) — tarjeta pública de una estación:
 * imagen o degradado por tipo, insignia de directo u hora, tipo, licencia,
 * ámbito, espectadores, insignia de malla y menú de acciones (dueño o visita).
 */

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AudioLines, Clapperboard, Headset, CalendarDays, Megaphone, Gamepad2,
  Presentation, Gauge, Tv, LayoutGrid, Layers, Eye, EllipsisVertical, Radio,
  Flag, EyeOff, Pencil, Pause, Play, Square, TriangleAlert, Waves,
} from "lucide-react";
import { estadoDirecto } from "@/lib/estaciones/directo";
import { esEnlaceEnVivo } from "@/lib/estaciones/transmision-parametrica";
import {
  ETIQUETA_TIPO, ETIQUETA_LICENCIA,
  type Estacion, type EstadoDirecto, type TipoEstacion,
} from "@/lib/estaciones/tipos";

const ICONO_TIPO: Record<TipoEstacion, LucideIcon> = {
  audio: AudioLines, video: Clapperboard, xr: Headset, evento: CalendarDays,
  anuncio: Megaphone, juego: Gamepad2, pizarra: Presentation,
  dashboard: Gauge, programa: Tv, app: LayoutGrid, mixto: Layers,
};

const DEGRADADO_TIPO: Record<TipoEstacion, string> = {
  audio: "from-emerald-500/30 to-teal-900/40",
  video: "from-rose-500/30 to-purple-900/40",
  xr: "from-indigo-500/30 to-sky-900/40",
  evento: "from-amber-500/30 to-orange-900/40",
  anuncio: "from-yellow-500/30 to-amber-900/40",
  juego: "from-lime-500/30 to-green-900/40",
  pizarra: "from-cyan-500/30 to-blue-900/40",
  dashboard: "from-sky-500/30 to-slate-900/40",
  programa: "from-fuchsia-500/30 to-violet-900/40",
  app: "from-violet-500/30 to-purple-900/40",
  mixto: "from-white/20 to-white/5",
};

const ETIQUETA_ESTADO: Record<EstadoDirecto, string> = {
  "en-directo": "● EN DIRECTO",
  programada: "Programada",
  pausada: "Pausada",
  terminada: "Terminada",
};

export interface TarjetaEstacionProps {
  estacion: Estacion & { oidaPorMalla?: boolean };
  ahora?: number;
  esMia?: boolean;
  denuncias?: number;
  onAbrir?(id: string): void;
  onDenunciar?(id: string): void;
  onOcultar?(id: string): void;
  onEditar?(id: string): void;
  onPausar?(id: string, pausada: boolean): void;
  onTerminar?(id: string): void;
}

// Hora local en español para las estaciones programadas.
export function horaProgramada(iso: string): string {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(iso));
}

export function TarjetaEstacion({
  estacion: e, ahora = Date.now(), esMia = false, denuncias = 0,
  onAbrir, onDenunciar, onOcultar, onEditar, onPausar, onTerminar,
}: TarjetaEstacionProps) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const estado = estadoDirecto(e, ahora);
  const Icono = ICONO_TIPO[e.tipo];
  const item = "flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-xs text-white/80 hover:bg-white/10";

  return (
    <article className="relative flex flex-col gap-2 rounded-xl border border-white/10 bg-black/30 backdrop-blur transition-colors hover:border-white/20">
      <button type="button" onClick={() => onAbrir?.(e.id)} aria-label={`Abrir ${e.titulo}`}
        className="relative flex h-28 w-full cursor-pointer items-center justify-center overflow-hidden rounded-t-xl">
        {e.imagen
          ? <img src={e.imagen} alt="" className="h-full w-full object-cover" />
          : <>
              <div className={`absolute inset-0 bg-gradient-to-br ${DEGRADADO_TIPO[e.tipo]}`} />
              <Icono className="relative h-8 w-8 text-white/50" />
            </>}
        <span className={"absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
          (estado === "en-directo"
            ? "bg-red-500/20 text-red-200"
            : "bg-black/50 text-white/80 backdrop-blur-sm")}>
          {estado === "programada" && e.empieza_en
            ? `${ETIQUETA_ESTADO.programada} · ${horaProgramada(e.empieza_en)}`
            : ETIQUETA_ESTADO[estado]}
        </span>
        {esEnlaceEnVivo(e.enlace) && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-cyan-200 backdrop-blur-sm">
            <Waves className="h-3 w-3" aria-hidden /> sincronizada
          </span>)}
        {e.oidaPorMalla && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-emerald-200 backdrop-blur-sm">
            <Radio className="h-3 w-3" /> malla
          </span>)}
      </button>

      <div className="flex min-w-0 flex-col gap-1.5 px-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{e.titulo}</h3>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Eye className="h-3 w-3" /> {e.espectadores}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
            <Icono className="h-3 w-3" /> {ETIQUETA_TIPO[e.tipo]}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">{ETIQUETA_LICENCIA[e.licencia]}</span>
          {e.ambito_tipo === "entidad" && e.entidad_ref && <span>de {e.entidad_ref}</span>}
          {esMia && denuncias > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/15 px-2 py-0.5 text-red-200">
              <TriangleAlert className="h-3 w-3" /> {denuncias} denuncia{denuncias === 1 ? "" : "s"}
            </span>)}
        </div>
      </div>

      <div className="absolute right-2 top-2">
        <button type="button" aria-label="Opciones de la estación" aria-expanded={menuAbierto}
          onClick={(ev) => { ev.stopPropagation(); setMenuAbierto((v) => !v); }}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm hover:bg-black/70">
          <EllipsisVertical className="h-4 w-4" />
        </button>
        {menuAbierto && (
          <div role="menu" className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-white/10 bg-black/85 backdrop-blur">
            {esMia && onEditar && (
              <button role="menuitem" className={item} onClick={() => { setMenuAbierto(false); onEditar(e.id); }}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>)}
            {esMia && onPausar && (
              <button role="menuitem" className={item} onClick={() => { setMenuAbierto(false); onPausar(e.id, !e.pausada); }}>
                {e.pausada ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {e.pausada ? " Reanudar" : " Pausar"}
              </button>)}
            {esMia && onTerminar && (
              <button role="menuitem" className={item} onClick={() => { setMenuAbierto(false); onTerminar(e.id); }}>
                <Square className="h-3.5 w-3.5" /> Terminar
              </button>)}
            {!esMia && onDenunciar && (
              <button role="menuitem" className={item} onClick={() => { setMenuAbierto(false); onDenunciar(e.id); }}>
                <Flag className="h-3.5 w-3.5" /> Denunciar
              </button>)}
            {!esMia && onOcultar && (
              <button role="menuitem" className={item} onClick={() => { setMenuAbierto(false); onOcultar(e.id); }}>
                <EyeOff className="h-3.5 w-3.5" /> Ocultar
              </button>)}
          </div>)}
      </div>
    </article>
  );
}
