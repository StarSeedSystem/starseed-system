"use client";

/**
 * MapaSenales — MAPA 3D DE SEÑALES REALES (fusión del Mapa 3D de neuronas activas
 * con el Radar de señales reales).
 * ============================================================================
 * UN solo instrumento para todo lo que esta neurona percibe de verdad: «Tú» en el centro, tus
 * otros aparatos con sus medios abiertos y el enlace real que los une (P2P en red local, por
 * internet, TURN, directo sin internet o relé, con su latencia), nodos LoRa, Bluetooth, Wi-Fi,
 * faros de otras cuentas (anónimos) y lo que oyen tus otras neuronas. Cada marca dice su
 * posición (GPS real, estimada por RF o solo sector) y cada valor, de dónde sale.
 *
 *   · «Mapa 3D» — lienzo R3F con altura que significa algo.
 *   · «Plano»   — el MISMO modelo en SVG: móviles y equipos modestos, y red de seguridad si el
 *                 navegador no puede abrir WebGL.
 *   · «Espectro» — eje de frecuencias con barras por señal, filtros y ficha (MAP1116B).
 *
 * Modelo puro: `src/lib/senales/` (`modelo.ts`). Escena (único archivo con three): `escena-3d.tsx`,
 * cargada perezosa. SOP: `architecture/mapa-3d-senales-reales.md`.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { Loader2, Radar, Signal } from "lucide-react";
import { cn } from "@/lib/utils";
import { webglDisponible } from "@/lib/senales/webgl";
import {
  guardarPreferenciasMapa, leerPreferenciasMapa, PREFERENCIAS_POR_DEFECTO,
  type PreferenciasMapa,
} from "@/lib/senales/preferencias-mapa";
import { SelectorVista } from "./barra-mapa";
import { ContenidoMapa } from "./contenido-mapa";
import { useCompacto } from "./use-compacto";
import { useMapaVivo } from "./use-mapa-vivo";
import type { FiltroEspectro } from "@/lib/senales/espectro/filtros";
import { filtrarConCuenta, FILTRO_VACIO } from "@/lib/senales/espectro/filtros";
import { filtroEspectroASenales, filtroSenalesAEspectro } from "./geo/panel-filtros-senales-tipos";
import type { FiltroSenales } from "./geo/panel-filtros-senales-tipos";
import type { SenalEspectro, SinFuente, Compatibilidad } from "@/lib/senales/espectro/tipos";

const PanelFiltrosSenalesDinamico = dynamic(
  () => import("./geo/panel-filtros-senales").then((m) => m.PanelFiltrosSenales),
  { ssr: false, loading: () => null }
);
const VistaEspectroDinamica = dynamic(
  () => import("./vista-espectro").then((m) => m.VistaEspectro),
  { ssr: false, loading: () => null }
);
const FichaSenalEspectroDinamica = dynamic(
  () => import("./ficha-senal-espectro").then((m) => m.FichaSenalEspectro),
  { ssr: false, loading: () => null }
);

export interface MapaSenalesProps {
  className?: string;
  /** Abrir la Red Mesh desde la ficha de una señal (pestaña o navegación del contenedor). */
  onOpenMesh?: () => void;
  /** Fuerza el modo compacto (o el completo); por defecto sigue el ancho de la pantalla. */
  compacto?: boolean;
  /** Superficies ligeras (sin WebGL): solo la vista plana, sin selector ni lienzo 3D. */
  soloPlano?: boolean;
}

export function MapaSenales({ className, onOpenMesh, compacto: compactoForzado, soloPlano = false }: MapaSenalesProps) {
  const reducido = useReducedMotion() ?? false;
  const compacto = useCompacto(compactoForzado);
  const [prefs, setPrefs] = useState<PreferenciasMapa>(PREFERENCIAS_POR_DEFECTO);
  const [hidratado, setHidratado] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [vistaEspectro, setVistaEspectro] = useState(false);
  const [filtroSenales, setFiltroSenales] = useState<FiltroSenales>(() => filtroEspectroASenales(leerPreferenciasMapa().filtroEspectro));
  const [senalElegida, setSenalElegida] = useState<SenalEspectro | null>(null);

  const { red, senalesEspectroBluetooth } = useMapaVivo({ verPublicos: prefs.verPublicos });

  // Preferencias de este dispositivo: se leen DESPUÉS de montar (el HTML del
  // servidor no las conoce y así no hay desajuste de hidratación).
  useEffect(() => {
    setPrefs(leerPreferenciasMapa());
    setHidratado(true);
    setWebgl(soloPlano ? false : webglDisponible());
  }, []);
  useEffect(() => {
    if (hidratado) guardarPreferenciasMapa(prefs);
  }, [prefs, hidratado]);

  const cambiar = (parcial: Partial<PreferenciasMapa>) => setPrefs((p) => ({ ...p, ...parcial }));

  const guardarFiltroEspectro = useCallback((nuevo: FiltroSenales) => {
    setFiltroSenales(nuevo);
    cambiar({ filtroEspectro: filtroSenalesAEspectro(nuevo) });
  }, [cambiar]);

  const sinFuente = useMemo<SinFuente[]>(() => {
    const arr: SinFuente[] = [];
    const bt = senalesEspectroBluetooth;
    if (bt && "medio" in bt) arr.push(bt);
    return arr;
  }, [senalesEspectroBluetooth]);

  const senalesFiltradas = useMemo(() => filtrarConCuenta(red.senales, filtroSenales).visibles, [red.senales, filtroSenales]);
  const ocultasSinDato = useMemo(() => filtrarConCuenta(red.senales, filtroSenales).ocultasSinDato, [red.senales, filtroSenales]);

  const quiere3d = prefs.vista === "3d" && !soloPlano && !vistaEspectro;
  const aviso = quiere3d
    ? webgl === false
      ? "Este navegador no puede abrir WebGL, así que se muestra el plano con las mismas señales."
      : fallo
        ? `El mapa 3D dejó de pintar (${fallo}), así que se muestra el plano con las mismas señales.`
        : null
    : null;
  const en3d = quiere3d && webgl === true && !fallo;
  const esperando = !hidratado || (quiere3d && webgl === null);

  const totalSenales = red.senales.length;
  const otrasCuentas = red.otrasCuentasPublicando;
  const mediosSinFuente = sinFuente.length;

  return (
    <div className={cn("w-full min-w-0 max-w-full overflow-x-clip rounded-2xl border border-white/10 bg-black/30 p-2.5 sm:p-3", className)}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-white/90">
            <Radar className="h-4 w-4 shrink-0 text-sky-300" /> <span className="min-w-0 break-words">Mapa 3D de señales reales</span>
          </h3>
          {!compacto && (
            <p className="mt-0.5 max-w-2xl text-[10px] leading-snug text-white/45">
              Tú en el centro, tus otros aparatos con lo que tienen abierto y cómo llegan hasta ti, y todo lo que esta neurona oye de
              verdad. Cada marca declara cuánto se sabe de ella y de dónde sale cada valor; lo que no se puede medir se dice.
            </p>
          )}
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          {soloPlano ? null : (
            <SelectorVista
              vista={en3d || (quiere3d && webgl === null) ? "3d" : "plano"}
              onVista={(vista) => {
                setFallo(null);
                setVistaEspectro(false);
                cambiar({ vista });
              }}
            />
          )}
          <button
            type="button"
            aria-pressed={vistaEspectro}
            onClick={() => setVistaEspectro((v) => !v)}
            className={cn(
              "inline-flex max-w-full shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors duration-200",
              vistaEspectro ? "border-sky-400/40 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/90"
            )}
            title="Espectro de frecuencias con filtros y ficha"
          >
            <Signal className="h-3 w-3 shrink-0" /> Espectro
          </button>
        </div>
      </div>

      {vistaEspectro ? (
        <div className="space-y-3" data-testid="pestana-espectro">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/60">
            <span className="font-mono tabular-nums text-white/80">{totalSenales}</span>
            <span>señales ·</span>
            <span className="font-mono tabular-nums text-white/80">{otrasCuentas}</span>
            <span>publicadas por otros dueños ·</span>
            <span className="font-mono tabular-nums text-white/80">{mediosSinFuente}</span>
            <span>medios sin fuente</span>
          </div>
          <PanelFiltrosSenalesDinamico
            filtro={filtroSenales}
            onCambiar={guardarFiltroEspectro}
            visibles={senalesFiltradas.length}
            ocultasSinDato={ocultasSinDato}
          />
          <VistaEspectroDinamica
            senales={senalesFiltradas}
            sinFuente={sinFuente}
            onElegir={(id) => {
              const s = red.senales.find((x) => x.id === id) ?? null;
              setSenalElegida(s);
            }}
          />
          {senalElegida && (
            <FichaSenalEspectroDinamica
              senal={senalElegida}
              onAccion={() => { /* la acción la maneja el contenedor */ }}
            />
          )}
        </div>
      ) : esperando ? (
        <div className="flex h-[240px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/40 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparando el mapa…
        </div>
      ) : (
        <ContenidoMapa
          vista={en3d ? "3d" : "plano"}
          prefs={prefs}
          onPrefs={cambiar}
          reducido={reducido}
          compacto={compacto}
          onOpenMesh={onOpenMesh}
          onFallo={setFallo}
          aviso={aviso}
        />
      )}
    </div>
  );
}

export default MapaSenales;