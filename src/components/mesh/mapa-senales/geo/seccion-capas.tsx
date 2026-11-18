"use client";

/**
 * Sección «Señales de mi cuenta» del panel de capas del mapa (MAP1114C). Mismo patrón que «Clima real»:
 * por capa, un interruptor, un deslizador de opacidad y su leyenda. Cada capa dice de dónde sale su dato.
 * Incluye el panel de filtros de señales (AQ03): banda, ancho, capa, medio, origen y texto.
 */

import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { EstadoLectura } from "@/lib/senales/espectro/leer-senales";
import {
  CAPAS_SENALES, GRUPOS_CAPA, NOTA_ALCANCE, NOTA_PARCHE, OPACIDAD_POR_DEFECTO, leyendaDe, motivoSenalesPublicadas,
  type CapaSenal, type EstadoCapas, type ItemLeyenda,
} from "@/lib/senales/geo/capas";
import type { EstadoCanalPosicion } from "@/lib/senales/geo/canal-posicion";
import type { PermisoUbicacion } from "./use-marcas-geo";
import { PanelFiltrosSenales, type FiltroSenales } from "./panel-filtros-senales";
import { filtrarSenales, contarSinDatoFrecuencia } from "@/lib/senales/espectro/filtrar";
import type { SenalEspectro } from "@/lib/senales/espectro/tipos";

export function Muestra({ i }: { i: ItemLeyenda }) {
  const base = "inline-block size-3 shrink-0 rounded-full";
  if (i.estilo === "rayado") return <span className={base} style={{ border: `1.5px dashed ${i.color}`, background: `repeating-linear-gradient(45deg, ${i.color}99 0 1.5px, ${i.color}1f 1.5px 4px)` }} aria-hidden />;
  if (i.estilo === "relleno") return <span className={base} style={{ background: `radial-gradient(circle, ${i.color} 35%, ${i.color}66 100%)` }} aria-hidden />;
  return <span className={base} style={{ border: `2px ${i.estilo === "hueco" ? "dashed" : "solid"} ${i.color}` }} aria-hidden />;
}

/** `soloDibujado`: en la leyenda del mapa, las capas de alcance solo muestran lo que se dibuja (el campo estimado), no «radio apagada». */
export function LeyendaCapa({ capa, className, soloDibujado }: { capa: CapaSenal; className?: string; soloDibujado?: boolean }) {
  const items = leyendaDe(capa).filter((i) => !(soloDibujado && (capa.tipo === "alcance" || capa.tipo === "enlaces") && i.estilo === "hueco"));
  return (
    <ul className={className} aria-label={`Leyenda de ${capa.etiqueta}`}>
      {items.map((i) => (
        <li key={i.etiqueta} className="flex items-center gap-1.5 text-[10px] text-white/70"><Muestra i={i} />{i.etiqueta}</li>
      ))}
    </ul>
  );
}

export interface PublicacionCapa {
  publica: boolean;
  comunidad: boolean;
  privada: boolean;
}

export interface SeccionCapasProps {
  estado: EstadoCapas;
  onAlternar: (id: string, on: boolean) => void;
  onOpacidad: (id: string, o: number) => void;
  permiso: PermisoUbicacion;
  compartir: boolean;
  /** (MAP1114D) Estado de la unión al canal privado de posición. */
  canal: Pick<EstadoCanalPosicion, "union" | "motivo">;
  onCompartir: (on: boolean) => void;
  onUbicarme: () => void;
  /** (AUD1117) Lectura de las señales publicadas de la red: si falló, el panel dice el motivo en vez de pintar cero. */
  publicadas?: { estado: EstadoLectura; motivo?: string };
  /** (AUD1117) Publicación de mis señales: interruptores por capa (apagados de fábrica). */
  publicacion?: PublicacionCapa;
  onPublicacion?: (capa: "publica" | "comunidad" | "privada", on: boolean) => void;
  /** (AQ03) Todas las señales publicadas de todas las marcas, para el panel de filtros. */
  todasLasSenales?: readonly SenalEspectro[];
  /** (AQ03) Filtro actual de señales. */
  filtroSenales?: FiltroSenales;
  /** (AQ03) Callback cuando cambia el filtro de señales. */
  onCambiarFiltroSenales?: (filtro: FiltroSenales) => void;
}

const TEXTO_PERMISO: Record<PermisoUbicacion, string> = {
  concedido: "Ubicación de este aparato: en vivo.",
  denegado: "Ubicación bloqueada en el navegador o el sistema.",
  "por-pedir": "Este aparato aún no dio su ubicación.",
  desconocido: "No se sabe si este aparato dio su ubicación.",
};

export function SeccionCapas({ estado, onAlternar, onOpacidad, permiso, compartir, canal, onCompartir, onUbicarme, publicadas, publicacion, onPublicacion, todasLasSenales = [], filtroSenales, onCambiarFiltroSenales }: SeccionCapasProps) {
  // (AUD1117) Si la lectura de las señales publicadas falló, el panel de capas dice el motivo: las capas
  // grupo «red» pintarían cero y el panel explica por qué, en vez de callarse.
  const motivoPublicadas = motivoSenalesPublicadas(publicadas?.estado ?? "ok", publicadas?.motivo);

  const { visibles, ocultasSinDato } = useMemo(() => {
    const filtradas = filtrarSenales(todasLasSenales, filtroSenales ?? {
      frecuencia: { minKhz: null, maxKhz: null },
      ancho: { minKhz: null, maxKhz: null },
      capas: [],
      medios: [],
      origenes: [],
      soloCompatibles: false,
      texto: "",
    });
    return { visibles: filtradas.length, ocultasSinDato: contarSinDatoFrecuencia(todasLasSenales) };
  }, [todasLasSenales, filtroSenales]);

  return (
    <div className="space-y-3" data-testid="seccion-senales">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Señales de mi cuenta</p>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <p className="text-[11px] leading-snug text-white/70">{TEXTO_PERMISO[permiso]}</p>
        {permiso !== "concedido" && permiso !== "denegado" && (
          <button type="button" onClick={onUbicarme} className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 text-[11px] text-emerald-100 hover:bg-emerald-500/20">Usar mi ubicación</button>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-white/80">Compartir la ubicación de este aparato con mi cuenta</span>
          <Switch checked={compartir} onCheckedChange={onCompartir} aria-label="Compartir la ubicación de este aparato con mi cuenta" />
        </div>
        {compartir && canal.union !== "unido" && (
          <p className="text-[10px] leading-snug text-amber-300" data-testid="aviso-envio-en-pausa">
            {canal.union === "uniendo" ? "Uniéndose al canal privado de posición de tu cuenta…" : `Envío en pausa: ${canal.motivo ?? "el canal privado de posición no está unido"}. Las demás neuronas figuran «desconocida».`}
          </p>
        )}
        {compartir && canal.union === "unido" && (
          <p className="text-[10px] leading-snug text-emerald-300" data-testid="aviso-canal-unido">Canal privado de posición unido: la posición solo viaja entre las neuronas de tu cuenta.</p>
        )}
      </div>

      {onCambiarFiltroSenales && (
        <PanelFiltrosSenales
          filtro={filtroSenales ?? {
            frecuencia: { minKhz: null, maxKhz: null },
            ancho: { minKhz: null, maxKhz: null },
            capas: [],
            medios: [],
            origenes: [],
            soloCompatibles: false,
            texto: "",
          }}
          onCambiar={onCambiarFiltroSenales}
          visibles={visibles}
          ocultasSinDato={ocultasSinDato}
        />
      )}

      <p className="text-[10px] leading-snug text-white/45">{NOTA_PARCHE} {NOTA_ALCANCE} Gris hueco = sin medir.</p>

      {publicacion && onPublicacion && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5" data-testid="seccion-publicacion">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Publicar mis señales</p>
          <p className="text-[10px] leading-snug text-white/50">Cada interruptor controla qué señales de este aparato salen al espectrómetro. Apagado de fábrica: no sale nada.</p>
          <div className="space-y-2">
            <div className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/80">Capa pública</span>
                <Switch
                  checked={publicacion.publica}
                  onCheckedChange={(v) => onPublicacion!("publica", v)}
                  aria-label="Publicar mis señales en la capa pública del espectrómetro"
                />
              </div>
              {publicacion.publica && (
                <p className="text-[10px] leading-snug text-emerald-300">
                  Sale: medio, banda, frecuencia, ancho, fuerza, calidad, origen (medida/declarada/estimada), zona aproximada (≤5 caracteres), hora. Sin nombres, coordenadas exactas ni ficha personal.
                </p>
              )}
            </div>
            <div className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/80">Capa comunidad</span>
                <Switch
                  checked={publicacion.comunidad}
                  onCheckedChange={(v) => onPublicacion!("comunidad", v)}
                  aria-label="Publicar mis señales en la capa de comunidad del espectrómetro"
                />
              </div>
              {publicacion.comunidad && (
                <p className="text-[10px] leading-snug text-sky-300">
                  Sale: lo mismo que la capa pública, más la etiqueta de comunidad. Visible solo para miembros de la misma comunidad.
                </p>
              )}
            </div>
            <div className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/80">Capa privada (mi cuenta)</span>
                <Switch
                  checked={publicacion.privada}
                  onCheckedChange={(v) => onPublicacion!("privada", v)}
                  aria-label="Publicar mis señales en la capa privada de mi cuenta"
                />
              </div>
              {publicacion.privada && (
                <p className="text-[10px] leading-snug text-violet-300">
                  Sale: lo mismo que la capa pública, pero solo viaja por el canal privado de posición entre las neuronas de tu cuenta. Requiere canal unido.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {GRUPOS_CAPA.map((g) => (
        <div key={g.id} className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{g.titulo}</p>
          {g.id === "red" && motivoPublicadas && (
            <p className="text-[10px] leading-snug text-amber-300" data-testid="motivo-publicadas-panel" role="status">{motivoPublicadas}</p>
          )}
          {CAPAS_SENALES.filter((c) => c.grupo === g.id).map((c) => {
            const on = estado.activas.includes(c.id);
            const op = estado.opacidad[c.id] ?? OPACIDAD_POR_DEFECTO;
            return (
              <div key={c.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5" data-testid={`capa-${c.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-xs text-white/80" title={c.descripcion}>
                    {c.etiqueta}
                    {c.estado === "sin-fuente" && <span className="ml-1.5 rounded-full border border-amber-400/40 px-1.5 py-px text-[9px] text-amber-200">sin fuente</span>}
                    {c.estado === "estimado" && <span className="ml-1.5 rounded-full border border-sky-400/40 px-1.5 py-px text-[9px] text-sky-200">alcance estimado</span>}
                    {c.estado === "parcial" && <span className="ml-1.5 rounded-full border border-white/20 px-1.5 py-px text-[9px] text-white/55">parcial</span>}
                  </span>
                  <Switch checked={on} onCheckedChange={(v) => onAlternar(c.id, v)} aria-label={`Capa ${c.etiqueta}`} />
                </div>
                {on && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-[10px] text-white/40">Opacidad</span>
                      <Slider value={[Math.round(op * 100)]} min={10} max={100} step={5} onValueChange={(v) => onOpacidad(c.id, (v[0] ?? 80) / 100)} className="flex-1" aria-label={`Opacidad de ${c.etiqueta}`} />
                      <span className="w-8 text-right text-[10px] tabular-nums text-white/50">{Math.round(op * 100)}%</span>
                    </div>
                    <LeyendaCapa capa={c} className="flex flex-wrap gap-x-3 gap-y-1" />
                    <p className={c.estado === "sin-fuente" ? "text-[10px] leading-snug text-amber-300" : "text-[10px] leading-snug text-white/40"}>{c.fuente}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}