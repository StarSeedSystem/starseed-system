"use client";

/**
 * Controles del mapa: filtros por familia de antena y por cuenta (con su recuento real), eje
 * de altura, etiquetas, giro y vistas de cámara. Todo es estado de vista: nada de
 * esto toca los datos, solo cómo se leen.
 */

import { Box, LocateFixed, Radar, RotateCw, Tag, View, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANTENNA_COLOR, ANTENNA_LABEL, type AntennaKind } from "@/ai/astraura/mesh/signals";
import {
  FAMILIAS, MODOS_ALTURA, SECTOR_CORTO,
  type ModoAltura, type ModoEtiquetas, type ResumenMapa,
} from "@/lib/senales/mapa-3d";
import { ICONO_DE_FAMILIA } from "@/lib/senales/iconos";
import type { VistaMapa } from "@/lib/senales/preferencias-mapa";
import { ETIQUETA_CUENTA, FILTROS_CUENTA, type FiltroCuenta } from "@/lib/senales/tipos-vivo";
import { GlifoIcono } from "./icono-2d";
import type { VistaCamara } from "./escena-3d";

const SEGMENTO = "inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5";
const BOTON_SEG = "inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors duration-200";
const SEG_ACTIVO = "bg-sky-500/20 text-sky-100";
const SEG_INACTIVO = "text-white/55 hover:text-white/90";
const BOTON_ICONO = "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors duration-200";

export function SelectorVista({ vista, onVista }: { vista: VistaMapa; onVista: (v: VistaMapa) => void }) {
  return (
    <div className={SEGMENTO} role="group" aria-label="Tipo de vista">
      <button type="button" aria-pressed={vista === "3d"} onClick={() => onVista("3d")} className={cn(BOTON_SEG, vista === "3d" ? SEG_ACTIVO : SEG_INACTIVO)}>
        <Box className="h-3 w-3" /> Mapa 3D
      </button>
      <button
        type="button"
        aria-pressed={vista === "plano"}
        onClick={() => onVista("plano")}
        title="El mismo mapa en plano: más ligero para móviles y equipos modestos"
        className={cn(BOTON_SEG, vista === "plano" ? SEG_ACTIVO : SEG_INACTIVO)}
      >
        <Radar className="h-3 w-3" /> Plano
      </button>
    </div>
  );
}

export interface FiltrosFamiliaProps {
  resumen: ResumenMapa;
  ocultas: readonly AntennaKind[];
  onFamilia: (f: AntennaKind) => void;
  onTodas: () => void;
}

export function FiltrosFamilia({ resumen, ocultas, onFamilia, onTodas }: FiltrosFamiliaProps) {
  const ninguna = ocultas.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por familia de antena">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Antena</span>
      <button
        type="button"
        aria-pressed={ninguna}
        onClick={onTodas}
        className={cn(BOTON_ICONO, ninguna ? "border-sky-400/40 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/90")}
      >
        Todas ({resumen.total})
      </button>
      {FAMILIAS.map((f) => {
        const oculta = ocultas.includes(f);
        const n = resumen.porFamilia[f];
        return (
          <button
            key={f}
            type="button"
            aria-pressed={!oculta}
            title={`${oculta ? "Mostrar" : "Ocultar"}: ${ANTENNA_LABEL[f]}`}
            onClick={() => onFamilia(f)}
            className={cn(
              BOTON_ICONO,
              oculta ? "border-white/5 bg-transparent text-white/30 line-through" : "border-white/12 bg-white/[0.04] text-white/80 hover:border-white/30",
              !oculta && n === 0 && "text-white/45",
            )}
          >
            <GlifoIcono id={ICONO_DE_FAMILIA[f]} color={oculta || n === 0 ? "#64748b" : ANTENNA_COLOR[f]} size={11} />
            {SECTOR_CORTO[f]} <span className="tabular-nums text-white/45">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

const AYUDA_CUENTA: Record<FiltroCuenta, string> = {
  todas: "Todo lo que se oye",
  propia: "Tus aparatos y los enlaces que son de tu cuenta",
  otra: "Faros de otras cuentas: anónimos, la red no revela quiénes son",
  ninguna: "Lo que no declara cuenta StarSeed: Bluetooth, Wi-Fi, nodos LoRa ajenos, serie…",
};

export interface FiltrosCuentaProps {
  porCuenta: Record<FiltroCuenta, number>;
  cuenta: FiltroCuenta;
  onCuenta: (c: FiltroCuenta) => void;
  ocultarDesconectados: boolean;
  desconectados: number;
  onDesconectados: () => void;
}

export function FiltrosCuenta({ porCuenta, cuenta, onCuenta, ocultarDesconectados, desconectados, onDesconectados }: FiltrosCuentaProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por cuenta">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">De quién</span>
      <div className={SEGMENTO}>
        {FILTROS_CUENTA.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cuenta === c}
            title={AYUDA_CUENTA[c]}
            onClick={() => onCuenta(c)}
            className={cn(BOTON_SEG, cuenta === c ? SEG_ACTIVO : SEG_INACTIVO)}
          >
            {ETIQUETA_CUENTA[c]} <span className="tabular-nums text-white/45">{porCuenta[c]}</span>
          </button>
        ))}
      </div>
      {desconectados > 0 && (
        <button
          type="button"
          aria-pressed={ocultarDesconectados}
          onClick={onDesconectados}
          title="Quita de la vista los aparatos de tu cuenta que ahora están desconectados"
          className={cn(BOTON_ICONO, ocultarDesconectados ? "border-sky-400/40 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/90")}
        >
          <WifiOff className="h-3 w-3" /> Ocultar desconectados <span className="tabular-nums text-white/45">{desconectados}</span>
        </button>
      )}
    </div>
  );
}

export interface ControlesVista3DProps {
  altura: ModoAltura;
  onAltura: (a: ModoAltura) => void;
  etiquetas: ModoEtiquetas;
  onEtiquetas: (e: ModoEtiquetas) => void;
  girar: boolean;
  onGirar: () => void;
  reducido: boolean;
  onCamara: (v: VistaCamara) => void;
}

export function ControlesVista3D(p: ControlesVista3DProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Altura</span>
        <div className={SEGMENTO} role="group" aria-label="Qué significa la altura">
          {MODOS_ALTURA.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={p.altura === m.id}
              title={m.ayuda}
              onClick={() => p.onAltura(m.id)}
              className={cn(BOTON_SEG, p.altura === m.id ? SEG_ACTIVO : SEG_INACTIVO)}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5" role="group" aria-label="Cámara y etiquetas">
        <button type="button" onClick={() => p.onCamara("inclinada")} title="Vista inclinada, centrada en esta neurona"
          className={cn(BOTON_ICONO, "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white/90")}>
          <LocateFixed className="h-3 w-3" /> Recentrar
        </button>
        <button type="button" onClick={() => p.onCamara("cenital")} title="Desde arriba: se lee como el radar plano"
          className={cn(BOTON_ICONO, "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white/90")}>
          <View className="h-3 w-3" /> Desde arriba
        </button>
        <button
          type="button"
          aria-pressed={p.etiquetas === "todas"}
          onClick={() => p.onEtiquetas(p.etiquetas === "todas" ? "seleccion" : "todas")}
          title={p.etiquetas === "todas" ? "Mostrar solo la etiqueta de la señal elegida" : "Mostrar las etiquetas de las señales principales"}
          className={cn(BOTON_ICONO, p.etiquetas === "todas" ? "border-sky-400/40 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/90")}
        >
          <Tag className="h-3 w-3" /> Etiquetas
        </button>
        {!p.reducido && (
          <button
            type="button"
            aria-pressed={p.girar}
            onClick={p.onGirar}
            title="Girar el mapa despacio"
            className={cn(BOTON_ICONO, p.girar ? "border-sky-400/40 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/90")}
          >
            <RotateCw className="h-3 w-3" /> Girar
          </button>
        )}
      </div>
    </div>
  );
}
