"use client";

/*
 * PiezasCampana — el hueco «Piezas de campaña» (2026-10-10).
 * Lista las piezas que prepara el Estudio creativo audiovisual (imagen, vídeo, animación 3D, anuncio, cartel,
 * carrusel), agrupadas por campaña y por medio, con vista previa (imagen o vídeo) y los botones aprobar / descartar
 * para los dueños. Una pieza no se publica sin su aprobación. Si la tabla aún no existe, lo dice con claridad.
 * Contrato del Estudio: architecture/metageminis-estudio.md.
 */

import { useState } from "react";
import { BadgeCheck, Check, Film, ImageOff, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { agruparPiezas, fechaCorta, leerFormato, vistaPrevia } from "@/lib/metageminis/cola";
import type { RespuestaOp } from "@/lib/metageminis/datos";
import { ETIQUETA_TIPO_PIEZA, type Campana, type EstadoPieza, type Pieza } from "@/lib/metageminis/tipos";
import { AvisoSinTabla } from "./aviso-sin-tabla";

export interface AccionesPiezas {
  aprobar: (id: string) => Promise<RespuestaOp>;
  descartar: (id: string, motivo: string) => Promise<RespuestaOp>;
  marcarPublicada: (id: string) => Promise<RespuestaOp>;
}

const ETIQUETA_ESTADO: Record<EstadoPieza, string> = {
  para_aprobar: "Para aprobar",
  aprobado: "Aprobada",
  publicado: "Publicada",
  descartado: "Descartada",
};

const COLOR_ESTADO: Record<EstadoPieza, string> = {
  para_aprobar: "border-amber-400/40 text-amber-200",
  aprobado: "border-emerald-400/40 text-emerald-200",
  publicado: "border-cyan-400/40 text-cyan-200",
  descartado: "border-white/20 text-white/45",
};

/** «1080x1920@15s» → «1080×1920 · 15 s». */
export function textoFormato(f: string): string {
  const x = leerFormato(f);
  if (!x) return f;
  return `${x.ancho}×${x.alto}${x.segundos !== null ? ` · ${x.segundos} s` : ""}`;
}

function Previa({ p }: { p: Pieza }) {
  const v = vistaPrevia(p);
  const nombre = `${ETIQUETA_TIPO_PIEZA[p.tipo]} para ${p.medio} (${textoFormato(p.formato)})`;
  if (v.tipo === "imagen" && v.src) {
    // eslint-disable-next-line @next/next/no-img-element -- las piezas vienen de rutas o URL arbitrarias del Estudio
    return <img src={v.src} alt={nombre} loading="lazy" className="h-40 w-full rounded-lg bg-black/40 object-contain" />;
  }
  if (v.tipo === "video" && v.src) {
    return (
      <video src={v.src} controls muted playsInline preload="metadata" aria-label={nombre} className="h-40 w-full rounded-lg bg-black/40 object-contain" />
    );
  }
  return (
    <div className="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-black/20 p-2 text-center text-[11px] text-white/45">
      <ImageOff className="h-5 w-5" aria-hidden />
      <span>Sin vista previa</span>
      {p.ruta ? <code className="max-w-full truncate text-[10px] text-white/35">{p.ruta}</code> : null}
    </div>
  );
}

function TarjetaPieza({ p, esDueno, acciones, alCambiar }: { p: Pieza; esDueno: boolean; acciones: AccionesPiezas; alCambiar?: () => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const ejecutar = async (clave: string, accion: () => Promise<RespuestaOp>, bien: string) => {
    setOcupado(clave);
    const r = await accion();
    setOcupado(null);
    if (r.ok) {
      toast.success(bien);
      setDescartando(false);
      setMotivo("");
      alCambiar?.();
    } else toast.error(r.motivo ?? "No se pudo completar.");
  };

  const metricas = Object.entries(p.metricas ?? {});
  return (
    <li data-testid="pieza" data-estado={p.estado} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
      <Previa p={p} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {ETIQUETA_TIPO_PIEZA[p.tipo]}
        </Badge>
        <Badge variant="outline" className="text-[10px] text-white/70">
          {textoFormato(p.formato)}
        </Badge>
        <Badge variant="outline" className={cn("ml-auto text-[10px]", COLOR_ESTADO[p.estado])}>
          {ETIQUETA_ESTADO[p.estado]}
        </Badge>
      </div>
      <p className="text-[11px] text-white/45">
        {fechaCorta(p.creado_en)}
        {p.sha256 ? <span title={p.sha256}> · huella {p.sha256.slice(0, 8)}</span> : null}
      </p>
      {metricas.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/60" aria-label="Métricas reales">
          {metricas.map(([k, v]) => (
            <li key={k}>
              {k}: <span className="text-white/85">{String(v)}</span>
            </li>
          ))}
        </ul>
      )}
      {p.estado === "aprobado" && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-200">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Aprobada el {fechaCorta(p.aprobado_en)}.
        </p>
      )}
      {p.estado === "descartado" && p.motivo_descarte ? <p className="text-[11px] text-white/45">Motivo: {p.motivo_descarte}</p> : null}

      {!esDueno ? (
        p.estado === "para_aprobar" ? <p className="text-[11px] text-white/45">Solo los dueños de MetaGenesis aprueban o descartan.</p> : null
      ) : p.estado === "para_aprobar" ? (
        descartando ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`motivo-pieza-${p.id}`}>
              Motivo del descarte
            </label>
            <input
              id={`motivo-pieza-${p.id}`}
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (opcional)"
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 p-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            />
            <Button size="sm" variant="ghost" className="cursor-pointer text-rose-200" disabled={ocupado !== null} onClick={() => void ejecutar("descartar", () => acciones.descartar(p.id, motivo), "Pieza descartada.")}>
              {ocupado === "descartar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              Confirmar descarte
            </Button>
            <Button size="sm" variant="ghost" className="cursor-pointer" disabled={ocupado !== null} onClick={() => setDescartando(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="cursor-pointer gap-1" disabled={ocupado !== null} onClick={() => void ejecutar("aprobar", () => acciones.aprobar(p.id), "Pieza aprobada.")}>
              {ocupado === "aprobar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
              Aprobar
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer gap-1" disabled={ocupado !== null} onClick={() => setDescartando(true)}>
              <X className="h-3.5 w-3.5" aria-hidden /> Descartar
            </Button>
          </div>
        )
      ) : p.estado === "aprobado" ? (
        <Button size="sm" variant="outline" className="cursor-pointer gap-1" disabled={ocupado !== null} onClick={() => void ejecutar("publicada", () => acciones.marcarPublicada(p.id), "Marcada como publicada.")}>
          {ocupado === "publicada" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          Ya la publiqué
        </Button>
      ) : null}
    </li>
  );
}

interface Props {
  piezas: readonly Pieza[];
  campanas: readonly Campana[];
  /** true = la tabla de piezas aún no existe (migración sin aplicar). */
  sinTabla: boolean;
  /** Motivo si la tabla existe pero no se pudo leer. */
  error?: string;
  esDueno: boolean;
  acciones: AccionesPiezas;
  alCambiar?: () => void;
}

export function PiezasCampana({ piezas, campanas, sinTabla, error, esDueno, acciones, alCambiar }: Props) {
  if (sinTabla) {
    return (
      <div className="space-y-2" data-testid="piezas-campana">
        <AvisoSinTabla que="Piezas de campaña" tabla="metageminis_piezas" />
        <p className="text-xs text-white/55">
          Aquí aparecerán, por campaña y por medio, las imágenes, vídeos, animaciones 3D, anuncios y carteles del Estudio MetaGeminis, con su vista
          previa y los botones de aprobar y descartar.
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" data-testid="piezas-campana" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
        No se pudieron leer las piezas de campaña: {error}
      </p>
    );
  }
  const nombres = Object.fromEntries(campanas.map((c) => [c.id, c.nombre]));
  const grupos = agruparPiezas(piezas, nombres);
  if (grupos.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-xs text-white/60" data-testid="piezas-campana">
        <Film className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-hidden />
        <p>Todavía no hay piezas. Cuando el Estudio convierta un brief en piezas por formato, saldrán aquí para que las apruebes antes de publicarlas.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5" data-testid="piezas-campana">
      {grupos.map((g) => (
        <section key={g.campana} aria-label={`Campaña ${g.campana}`} className="space-y-3">
          <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
            {g.campana}
            <span className="text-xs font-normal text-white/45">{g.total} {g.total === 1 ? "pieza" : "piezas"}</span>
            {g.paraAprobar > 0 && (
              <Badge variant="outline" className="border-amber-400/40 text-[10px] text-amber-200">
                {g.paraAprobar} para aprobar
              </Badge>
            )}
          </h4>
          {g.medios.map((m) => (
            <div key={m.medio} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-white/50">{m.medio.replace(/_/g, " ")}</p>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {m.piezas.map((p) => (
                  <TarjetaPieza key={p.id} p={p} esDueno={esDueno} acciones={acciones} alCambiar={alCambiar} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
