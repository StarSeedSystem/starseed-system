"use client";

/**
 * SignalsRadar — mini radar de señales reales (Adenda 99b · 150 · fusionado el 2026-10-10).
 * ============================================================================
 * Ya NO es un instrumento aparte: es la VISTA PLANA del Mapa 3D de señales reales
 * (`./mapa-senales/`), con el mismo modelo, la misma colocación y las mismas fichas, para los
 * sitios donde no cabe el mapa completo (widgets del escritorio, paneles estrechos). Conserva su
 * API de siempre.
 *
 * Honestidad: sin barrido giratorio ni ondas de adorno. Solo late lo oído hace menos de 30 s (y no
 * con `prefers-reduced-motion`); los anillos de distancia solo existen donde hay distancia (GPS de
 * ambos extremos, o RF marcada «≈»), y cada valor de la ficha dice de dónde sale.
 */

import { useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SignalSource } from "@/ai/astraura/mesh";
import { cuentaDe } from "@/lib/senales/cuentas";
import { fichaDeSenal } from "@/lib/senales/fichas";
import { lineaResumen } from "@/lib/senales/mapa-3d";
import { fichaDeYo } from "@/lib/senales/medios";
import { construirModeloMapa } from "@/lib/senales/modelo";
import type { ClaseEnlace } from "@/lib/senales/tipos-vivo";
import { LeyendaMapa } from "./mapa-senales/leyenda-mapa";
import { FichaPanel } from "./mapa-senales/secciones-ficha";
import { useAntenasPropias } from "./mapa-senales/use-antenas-propias";
import { useMapaVivo } from "./mapa-senales/use-mapa-vivo";
import { VistaPlana } from "./mapa-senales/vista-plana";
import { SignalDetailCard } from "./signal-detail";

const SIN_FILTROS = { ocultas: [], cuenta: "todas", ocultarDesconectados: false } as const;

export interface SignalsRadarProps {
  /** Alto del SVG en px. */
  height?: number;
  compact?: boolean;
  showLegend?: boolean;
  className?: string;
  /** Señales-antena de ESTA neurona (opcional). Si no se pasan, se autodetectan. */
  signals?: SignalSource[];
  /** Mostrar la FICHA completa al pulsar una marca. Por defecto activa fuera del modo compacto. */
  showDetail?: boolean;
  /** Abrir la Red Mesh desde la ficha (pestaña o navegación del contenedor). */
  onOpenMesh?: () => void;
  /** Consultar el registro de neuronas de la cuenta (única fuente que sale a la red). Apagado en compacto. */
  accountRegistry?: boolean;
}

export function SignalsRadar({
  height = 180, compact = false, showLegend = true, className, signals,
  showDetail, onOpenMesh, accountRegistry,
}: SignalsRadarProps) {
  const reducido = useReducedMotion() ?? false;
  const [sel, setSel] = useState<string | null>(null);
  const [apuntada, setApuntada] = useState<string | null>(null);
  const withDetail = showDetail ?? !compact;

  const { senales, vivo, yo, ahora } = useMapaVivo({ accountRegistry: accountRegistry ?? !compact });
  const fuentesAntenas = useAntenasPropias(signals);
  const modelo = useMemo(
    () => construirModeloMapa({ senales, vivo, filtros: SIN_FILTROS, altura: "plano", ahora, fuentesAntenas }),
    [senales, vivo, ahora, fuentesAntenas],
  );

  const senal = modelo.visibles.find((s) => s.id === sel) ?? null;
  const medio = modelo.medios.find((m) => m.id === sel)?.medio ?? null;
  const enYo = sel === "yo";
  const seleccionValida = !!senal || !!medio || enYo;
  const clases = useMemo(
    () => Array.from(new Set(modelo.marcadores.map((m) => m.enlaceMapa?.clase).filter((c): c is ClaseEnlace => !!c))),
    [modelo.marcadores],
  );
  const conectada = yo.radio.estado === "ready" || yo.radio.estado === "degraded";
  const cerrar = () => setSel(null);
  const oidas = senales.filter((s) => s.id.startsWith("remoto:")).length;

  return (
    <div className={cn("relative", className)}>
      <VistaPlana
        modelo={modelo}
        seleccionId={seleccionValida ? sel : null}
        apuntadaId={apuntada}
        onSeleccionar={setSel}
        onApuntar={setApuntada}
        reducido={reducido}
        alto={height}
        mini={compact}
        etiquetaCentro={conectada ? (yo.radio.gps ? "con GPS del radio" : "el radio no comparte GPS") : "sin radio"}
        descripcion={`Radar de señales: ${modelo.resumen.total} señal(es) detectada(s)`}
      />

      {/* Estado honesto abajo (sin tapar las antenas locales, que siempre existen) */}
      {senales.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center justify-center">
          <span className="px-4 text-center text-[9px] text-muted-foreground/55">
            {conectada
              ? "Malla lista · ninguna señal externa detectada todavía"
              : "Sin radio LoRa · se muestran las antenas de esta neurona; conecta la malla o escanea BLE para detectar señales"}
          </span>
        </div>
      )}

      {/* Ficha de lo elegido: la completa, con la fuente de cada valor */}
      {seleccionValida && withDetail && (
        <div className="mt-2">
          {senal ? (
            <SignalDetailCard
              signal={senal}
              ficha={fichaDeSenal(senal, { ahora, cuenta: cuentaDe(senal), vivo })}
              onClose={cerrar}
              onOpenMesh={onOpenMesh}
            />
          ) : medio ? (
            <FichaPanel ficha={medio.ficha} color="#c084fc" onCerrar={cerrar} />
          ) : (
            <FichaPanel ficha={fichaDeYo(yo, oidas)} color="#38bdf8" onCerrar={cerrar} />
          )}
        </div>
      )}
      {/* En compacto, una línea honesta con lo esencial (la ficha no cabe) */}
      {seleccionValida && !withDetail && (
        <div className="mt-1 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-2.5 py-1.5 text-[10px]">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-black">{senal?.label ?? medio?.etiqueta ?? "Tú"}</span>
            <span className="tabular-nums text-muted-foreground/70">
              {senal ? lineaResumen(senal) : medio ? (medio.visible ? "a la vista" : "en segundo plano") : "esta neurona"}
            </span>
          </div>
        </div>
      )}

      {showLegend && !compact && (
        <div className="mt-1.5">
          <LeyendaMapa
            altura="plano"
            gpsAhora={modelo.resumenVisible.gps}
            clases={clases}
            hayAparatos={modelo.vivoVisible.aparatos > 0}
            hayMedios={modelo.medios.length > 0}
            compacto
          />
        </div>
      )}
    </div>
  );
}

export default SignalsRadar;
