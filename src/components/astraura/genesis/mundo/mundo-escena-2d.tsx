"use client";

/**
 * mundo-escena-2d.tsx — El mismo mundo, en plano. Respaldo digno para
 * cuando no hay contexto WebGL (nunca una pantalla negra): los MISMOS
 * datos ya dispuestos por la física honesta de `mundo-layout.ts` — no una
 * versión aparte "para cuando falla la 3D" con su propia idea de quién
 * está cerca de quién.
 *
 * Cada ser es un `AvatarFallbackSvg` real (mismo ADN, misma silueta por
 * sólido, misma paleta que el cuerpo 3D — ver avatar-fallback-svg.tsx) — no
 * un punto genérico ni las iniciales del nombre. Envuelto en un `<button>`
 * real: la accesibilidad de esta vista es, literalmente, gratis (foco de
 * teclado, orden de tabulación, lector de pantalla) porque es HTML de
 * verdad, no un lienzo — a diferencia de la vista 3D, que necesita su
 * propia lista accesible en paralelo (ver mundo-seres.tsx).
 */

import { useMemo } from "react";
import { AvatarFallbackSvg } from "../avatar/avatar-fallback-svg";
import { adnEfectivo } from "./mundo-adn";
import { contornoEspacio } from "./mundo-espacio-forma";
import { resolveQuantumOrbTheme } from "@/lib/aurora/quantum-orb-theme";
import { cn } from "@/lib/utils";
import type { SerListado } from "@/lib/astraura/genesis-types";
import type { AristaVisible, PosicionMundo, RegionVisible, VistaMundo } from "./mundo-tipos";

const TEMA = resolveQuantumOrbTheme("aurora");
const MARGEN_PORCENTAJE = 12;
const TAMANO_AVATAR_PX = 40;

export interface MundoEscena2DProps {
  seres: readonly SerListado[];
  posiciones: ReadonlyMap<string, PosicionMundo>;
  aristas: readonly AristaVisible[];
  regiones: readonly RegionVisible[];
  seleccion: string | null;
  onSeleccionar: (id: string | null) => void;
  /** "mundo" proyecta (x,z) — vista de planta; "linaje" proyecta (x,y) —
   * columna/generación, ya calculado así por `calcularDisposicionLinaje`. */
  vista: VistaMundo;
  className?: string;
}

interface RegionProyectada {
  readonly region: RegionVisible;
  readonly cxPct: number;
  readonly cyPct: number;
  readonly radioPct: number;
  readonly puntos: string; // "x,y x,y ..." listo para <polygon points=…>
}

function proyectar(pos: PosicionMundo, vista: VistaMundo): readonly [number, number] {
  return vista === "linaje" ? [pos.x, pos.y] : [pos.x, pos.z];
}

/** Mundo vacío digno — mismo lienzo, mensaje en vez de nada. */
function MensajeVacio() {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
      Aún no hay seres en este mundo.
    </div>
  );
}

export function MundoEscena2D({
  seres,
  posiciones,
  aristas,
  regiones,
  seleccion,
  onSeleccionar,
  vista,
  className,
}: MundoEscena2DProps) {
  const { puntosSeres, regionesProyectadas } = useMemo(() => {
    const crudos: Array<readonly [number, number]> = [];
    for (const ser of seres) {
      const p = posiciones.get(ser.id);
      if (p) crudos.push(proyectar(p, vista));
    }
    for (const region of regiones) {
      const [cx, cy] = proyectar(region.centro, vista);
      crudos.push([cx - region.radio, cy - region.radio], [cx + region.radio, cy + region.radio]);
    }

    if (crudos.length === 0) {
      return { puntosSeres: new Map<string, { xPct: number; yPct: number }>(), regionesProyectadas: [] as RegionProyectada[] };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of crudos) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const anchoMundo = Math.max(maxX - minX, 1e-6);
    const altoMundo = Math.max(maxY - minY, 1e-6);
    const escala = (100 - MARGEN_PORCENTAJE * 2) / Math.max(anchoMundo, altoMundo);
    const centroX = (minX + maxX) / 2;
    const centroY = (minY + maxY) / 2;
    const mapear = ([x, y]: readonly [number, number]): readonly [number, number] => [
      50 + (x - centroX) * escala,
      50 + (y - centroY) * escala,
    ];

    const puntosSeres = new Map<string, { xPct: number; yPct: number }>();
    for (const ser of seres) {
      const p = posiciones.get(ser.id);
      if (!p) continue;
      const [xPct, yPct] = mapear(proyectar(p, vista));
      puntosSeres.set(ser.id, { xPct, yPct });
    }

    const regionesProyectadas: RegionProyectada[] = regiones.map((region) => {
      const [cx, cy] = proyectar(region.centro, vista);
      const [cxPct, cyPct] = mapear([cx, cy]);
      const radioPct = region.radio * escala;
      const contorno =
        region.tipo === "espacio" && region.semilla !== null
          ? contornoEspacio(region.semilla, region.radio)
          : Array.from({ length: 40 }, (_, i) => {
              const a = (i / 40) * Math.PI * 2;
              return [Math.cos(a) * region.radio, Math.sin(a) * region.radio] as const;
            });
      const puntos = contorno
        .map(([lx, ly]) => {
          // El contorno vive relativo al centro en las mismas unidades
          // físicas — se proyecta como (lx, ly)→(horiz, vert) igual que
          // cualquier otra posición, y se traslada por el centro ya en %.
          const [px, py] = mapear([cx + lx, cy + ly]);
          return `${px.toFixed(2)},${py.toFixed(2)}`;
        })
        .join(" ");
      return { region, cxPct, cyPct, radioPct, puntos };
    });

    return { puntosSeres, regionesProyectadas };
  }, [seres, posiciones, regiones, vista]);

  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#05070d]", className)}>
      {seres.length === 0 && <MensajeVacio />}

      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {regionesProyectadas.map(({ region, cxPct, cyPct, radioPct, puntos }) =>
          // fillOpacity/strokeOpacity por separado (no un sufijo de alfa
          // pegado al color): `color` puede llegar como "#rrggbb" (por
          // defecto) o como cualquier CSS válido que ponga el dato
          // (nombrado, hsl(...)) — concatenar un sufijo hex solo funciona
          // con hex de 6 dígitos y rompería en silencio con lo demás.
          region.tipo === "espacio" ? (
            <polygon
              key={region.id}
              points={puntos}
              fill={region.color ?? TEMA.core}
              fillOpacity={0.09}
              stroke={region.color ?? TEMA.core}
              strokeOpacity={0.55}
              strokeWidth={0.35}
            />
          ) : (
            <circle
              key={region.id}
              cx={cxPct}
              cy={cyPct}
              r={radioPct}
              fill={region.color ?? TEMA.primary}
              fillOpacity={0.07}
              stroke={region.color ?? TEMA.primary}
              strokeOpacity={0.45}
              strokeWidth={0.3}
            />
          ),
        )}

        {aristas.map((arista) => {
          const a = puntosSeres.get(arista.origenId);
          const b = puntosSeres.get(arista.destinoId);
          if (!a || !b) return null;
          return (
            <line
              key={arista.id}
              x1={a.xPct}
              y1={a.yPct}
              x2={b.xPct}
              y2={b.yPct}
              stroke={arista.tipo === "linaje" ? TEMA.core : TEMA.secondary}
              strokeOpacity={0.25 + arista.intensidad * 0.45}
              strokeWidth={0.25 + arista.intensidad * 0.35}
            />
          );
        })}
      </svg>

      {seres.map((ser) => {
        const p = puntosSeres.get(ser.id);
        if (!p) return null;
        const estaSeleccionado = seleccion === ser.id;
        return (
          <button
            key={ser.id}
            type="button"
            style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 ease-out",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              estaSeleccionado ? "z-10 scale-125" : "hover:scale-110",
            )}
            aria-pressed={estaSeleccionado}
            aria-label={`${ser.nombre} — ${ser.rol}`}
            onClick={() => onSeleccionar(estaSeleccionado ? null : ser.id)}
          >
            <span
              className={cn(
                "block rounded-full ring-2 ring-transparent transition-shadow",
                estaSeleccionado && "shadow-[0_0_0_3px_rgba(255,255,255,0.35)]",
              )}
            >
              <AvatarFallbackSvg adn={adnEfectivo(ser)} tamano={TAMANO_AVATAR_PX} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default MundoEscena2D;
