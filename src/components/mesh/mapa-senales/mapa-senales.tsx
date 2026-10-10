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
 *
 * Modelo puro: `src/lib/senales/` (`modelo.ts`). Escena (único archivo con three): `escena-3d.tsx`,
 * cargada perezosa. SOP: `architecture/mapa-3d-senales-reales.md`.
 */

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Loader2, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { webglDisponible } from "@/lib/senales/webgl";
import {
  guardarPreferenciasMapa, leerPreferenciasMapa, PREFERENCIAS_POR_DEFECTO,
  type PreferenciasMapa,
} from "@/lib/senales/preferencias-mapa";
import { SelectorVista } from "./barra-mapa";
import { ContenidoMapa } from "./contenido-mapa";
import { useCompacto } from "./use-compacto";

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

  const quiere3d = prefs.vista === "3d" && !soloPlano;
  const aviso = quiere3d
    ? webgl === false
      ? "Este navegador no puede abrir WebGL, así que se muestra el plano con las mismas señales."
      : fallo
        ? `El mapa 3D dejó de pintar (${fallo}), así que se muestra el plano con las mismas señales.`
        : null
    : null;
  const en3d = quiere3d && webgl === true && !fallo;
  const esperando = !hidratado || (quiere3d && webgl === null);

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/30 p-3", className)}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-white/90">
            <Radar className="h-4 w-4 text-sky-300" /> Mapa 3D de señales reales
          </h3>
          {!compacto && (
            <p className="mt-0.5 max-w-2xl text-[10px] leading-snug text-white/45">
              Tú en el centro, tus otros aparatos con lo que tienen abierto y cómo llegan hasta ti, y todo lo que esta neurona oye de
              verdad. Cada marca declara cuánto se sabe de ella y de dónde sale cada valor; lo que no se puede medir se dice.
            </p>
          )}
        </div>
        {soloPlano ? null : (
          <SelectorVista
            vista={en3d || (quiere3d && webgl === null) ? "3d" : "plano"}
            onVista={(vista) => {
              setFallo(null);
              cambiar({ vista });
            }}
          />
        )}
      </div>

      {esperando ? (
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
