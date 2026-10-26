"use client";

/**
 * Cabecera del Centro de Control (Logic · ámbar): el símbolo del nodo, el nombre, pantalla completa y
 * la X común; debajo, el estado vivo de ESTE aparato (batería, red, neurona, sesión) y, solo mientras
 * hay una grabación en marcha, una franja para volver a ella desde cualquier sección.
 * Solo se pinta lo que el navegador da: sin batería no hay chip de batería.
 */
import { Battery, BatteryCharging, BatteryLow, ChevronRight, CircuitBoard, Cpu, Maximize2, Minimize2, ShieldCheck, ShieldOff, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { cn } from "@/lib/utils";
import { rotuloDeFase } from "@/lib/grabacion/texto";
import type { Instantanea } from "@/lib/grabacion/tipos";
import { Cronometro } from "./grabar/cronometro";
import { CLASES_TONO, construirChips, type ChipEstado, type EstadoAparato } from "./estado-aparato";

function iconoDelChip(c: ChipEstado): LucideIcon {
  switch (c.id) {
    case "bateria":
      return c.variante === "cargando" ? BatteryCharging : c.variante === "baja" ? BatteryLow : Battery;
    case "red":
      return c.tono === "alerta" ? WifiOff : Wifi;
    case "neurona":
      return Cpu;
    case "sesion":
      return c.tono === "aviso" ? ShieldOff : ShieldCheck;
  }
}

interface Props {
  aparato: EstadoAparato;
  grabadora: Instantanea;
  /** La sección Grabar ya está a la vista: la franja sobra. */
  grabarVisible: boolean;
  /** ¿La sección Grabar está entre las visibles? Si no, la franja solo informa (sin botón muerto). */
  puedeVerGrabacion: boolean;
  onVerGrabacion: () => void;
  pantallaCompleta: { soportada: boolean; activa: boolean; alternar: () => void };
  onCerrar: () => void;
}

export function CabeceraControl({ aparato, grabadora, grabarVisible, puedeVerGrabacion, onVerGrabacion, pantallaCompleta, onCerrar }: Props) {
  const chips = construirChips(aparato);
  const franja = grabarVisible ? null : rotuloDeFase(grabadora);
  const conReloj = grabadora.fase === "grabando" || grabadora.fase === "pausada";

  return (
    <header className="shrink-0 border-b border-amber-300/15 bg-gradient-to-b from-amber-400/[0.07] to-transparent px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top,0px))] md:px-5 md:pt-5">
      <div className="flex items-center gap-3">
        <div
          data-ss-coreo="logo"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-amber-300/50 bg-amber-400/15 shadow-[0_0_24px_-4px_rgba(255,191,0,0.55)]"
        >
          <CircuitBoard className="h-5 w-5 text-amber-200" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-headline text-[17px] font-light uppercase leading-[1.15] tracking-[0.12em] text-amber-50">Centro de Control</h2>
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200/60">Panel de Lógica · StarSeed OS</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pantallaCompleta.soportada && (
            <button
              type="button"
              onClick={pantallaCompleta.alternar}
              title={pantallaCompleta.activa ? "Salir pantalla completa" : "Pantalla completa del programa"}
              aria-label={pantallaCompleta.activa ? "Salir de la pantalla completa" : "Poner el programa en pantalla completa"}
              aria-pressed={pantallaCompleta.activa}
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-amber-100/60 outline-none transition-colors duration-150 hover:bg-white/10 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/70"
            >
              {pantallaCompleta.activa ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
          {/* X común, visible en todos los tamaños y alineada con los demás controles. */}
          <BotonCerrar etiqueta="Cerrar el Centro de Control" acento="#FFBF00" atajo="Esc" onClick={onCerrar} />
        </div>
      </div>

      <ul aria-label="Estado de este aparato" data-testid="chips-estado" className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const Icono = iconoDelChip(c);
          return (
            <li
              key={c.id}
              data-chip={c.id}
              title={c.descripcion}
              className={cn("inline-flex min-h-[26px] max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium leading-none", CLASES_TONO[c.tono])}
            >
              <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span aria-hidden="true" className="truncate">
                {c.texto}
              </span>
              <span className="sr-only">{c.descripcion}</span>
            </li>
          );
        })}
      </ul>

      {franja && (
        puedeVerGrabacion ? (
          <button
            type="button"
            onClick={onVerGrabacion}
            data-testid="franja-grabacion"
            className="mt-3 flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-xl border border-red-400/50 bg-red-500/15 px-3 text-left outline-none transition-colors duration-150 hover:bg-red-500/25 focus-visible:ring-2 focus-visible:ring-amber-300/70"
          >
            <ContenidoFranja franja={franja} grabadora={grabadora} conReloj={conReloj} conVer />
          </button>
        ) : (
          <div role="status" data-testid="franja-grabacion" className="mt-3 flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border border-red-400/50 bg-red-500/15 px-3">
            <ContenidoFranja franja={franja} grabadora={grabadora} conReloj={conReloj} conVer={false} />
          </div>
        )
      )}
    </header>
  );
}

function ContenidoFranja({ franja, grabadora, conReloj, conVer }: { franja: string; grabadora: Instantanea; conReloj: boolean; conVer: boolean }) {
  return (
    <>
      <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_#DC143C]", grabadora.fase === "grabando" && "motion-safe:animate-pulse")} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-red-50">{franja}</span>
      {conReloj && <Cronometro estado={grabadora} className="font-mono text-[12px] tabular-nums text-red-50" />}
      {conVer ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-red-100/80">
          Ver <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-red-100/70">Sección Grabar oculta</span>
      )}
    </>
  );
}
