"use client";

/**
 * EspectroVista — pestaña «Espectro» del mapa de señales (MAP1116B).
 * Junta PanelFiltrosSenales, VistaEspectro y FichaSenalEspectro con los datos de `red`.
 * Puro cliente: sin red, sin `node:*`.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { filtrarSenales, contarSinDatoFrecuencia } from "@/lib/senales/espectro/filtrar";
import type { FiltroSenales } from "@/components/mesh/mapa-senales/geo/panel-filtros-senales-tipos";
import { MEDIOS } from "@/components/mesh/mapa-senales/geo/panel-filtros-senales-tipos";
import { PanelFiltrosSenales } from "@/components/mesh/mapa-senales/geo/panel-filtros-senales";
import { VistaEspectro } from "./vista-espectro";
import { FichaSenalEspectro } from "./ficha-senal-espectro";
import type { MapaVivoRed } from "@/lib/senales/tipos-vivo";
import type { SenalEspectro, SinFuente } from "@/lib/senales/espectro/tipos";

const FILTRO_INICIAL: FiltroSenales = {
  frecuencia: { minKhz: null, maxKhz: null },
  ancho: { minKhz: null, maxKhz: null },
  capas: [],
  medios: [],
  origenes: [],
  soloCompatibles: false,
  texto: "",
};

interface EspectroVistaProps {
  red: MapaVivoRed;
  mediosSinFuente: number;
}

export function EspectroVista({ red, mediosSinFuente }: EspectroVistaProps) {
  const [filtro, setFiltro] = useState<FiltroSenales>(FILTRO_INICIAL);
  const [senalElegida, setSenalElegida] = useState<SenalEspectro | null>(null);

  const senalesFiltradas = useMemo(
    () => filtrarSenales(red.senales, filtro),
    [red.senales, filtro]
  );
  const ocultasSinDato = useMemo(
    () => contarSinDatoFrecuencia(senalesFiltradas),
    [senalesFiltradas]
  );

  // Construir sinFuente: medios sin señal en red.senales
  const mediosConSenales = useMemo(
    () => new Set(red.senales.map((s: SenalEspectro) => s.medio)),
    [red.senales]
  );
  const sinFuente: SinFuente[] = useMemo(
    () =>
      MEDIOS.filter((m) => !mediosConSenales.has(m)).map((medio) => ({
        medio,
        motivo: "este aparato no tiene radio para este medio",
      })),
    [mediosConSenales]
  );

  const otrasCuentas = red.otrasCuentasPublicando ?? 0;
  const totalSenales = red.senales.length;

  return (
    <div className="space-y-3" data-testid="espectro-vista">
      {/* Línea de estado honesta */}
      <p className="flex items-center gap-2 text-[11px] text-white/60" data-testid="estado-espectro">
        <span className="font-mono tabular-nums text-white/80">{totalSenales}</span>
        <span>señales ·</span>
        <span className="font-mono tabular-nums text-white/80">{otrasCuentas}</span>
        <span>publicadas por otros dueños ·</span>
        <span className="font-mono tabular-nums text-white/80">{mediosSinFuente}</span>
        <span>medios sin fuente</span>
        {red.motivo && (
          <>
            <span>·</span>
            <span className="text-amber-300">{red.motivo}</span>
          </>
        )}
      </p>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Panel de filtros + Vista del espectro */}
        <div className="space-y-3 min-w-0">
          <PanelFiltrosSenales
            filtro={filtro}
            onCambiar={setFiltro}
            visibles={senalesFiltradas.length}
            ocultasSinDato={ocultasSinDato}
          />
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 min-h-[320px]">
            <VistaEspectro
              senales={senalesFiltradas}
              sinFuente={sinFuente}
              onElegir={(id: string) => {
                const s = senalesFiltradas.find((x) => x.id === id) ?? null;
                setSenalElegida(s);
              }}
            />
          </div>
        </div>

        {/* Ficha de la señal elegida */}
        <aside className="min-h-0 lg:max-h-[480px] lg:overflow-y-auto lg:pr-1" aria-label="Ficha de señal">
          {senalElegida ? (
            <FichaSenalEspectro
              senal={senalElegida}
              onAccion={() => {}}
            />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center text-white/50">
              <p className="text-[13px] font-medium text-white/80">Elige una señal</p>
              <p className="mt-1 text-[11px]">Pulsa una barra o una fila del espectro para ver su ficha</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default EspectroVista;