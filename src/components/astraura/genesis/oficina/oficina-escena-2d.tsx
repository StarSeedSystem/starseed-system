"use client";

/**
 * oficina-escena-2d.tsx — La misma oficina, en plano. Respaldo digno cuando
 * no hay contexto WebGL (nunca una pantalla negra), leyendo exactamente los
 * mismos `SalaDispuesta`/`OcupanteResuelto` que ya calculó `oficina-salas.ts`
 * / `oficina-ocupantes.ts` — no una versión aparte "para cuando falla la 3D"
 * con su propia idea de dónde está cada sala. Mismo espíritu que
 * `genesis/mundo/mundo-escena-2d.tsx`, del que esta pieza copia el patrón:
 * regiones decorativas (`aria-hidden`) + ENTIDADES como `<button>` reales —
 * la accesibilidad de esta vista es, literalmente, gratis (foco de teclado,
 * orden de tabulación, lector de pantalla) porque es HTML de verdad.
 *
 * Cada ocupante es un `AvatarFallbackSvg` real con el ADN de su ser — mismo
 * cuerpo (silueta, paleta, órbitas) que vería en la escena 3D, nunca un
 * punto genérico ni las iniciales del nombre.
 */

import { useMemo } from "react";
import { AvatarFallbackSvg } from "../avatar/avatar-fallback-svg";
import { adnEfectivo } from "@/components/astraura/genesis/mundo";
import { actividadVisible } from "./oficina-honestidad";
import { describirOcupante } from "./oficina-ocupantes";
import { cn } from "@/lib/utils";
import type { DisposicionOficina, OcupanteResuelto } from "./oficina-tipos";

const TAMANO_AVATAR_PX = 34;
const MARGEN_PORCENTAJE = 10;

export interface OficinaEscena2DProps {
  disposicion: DisposicionOficina;
  ocupantes: readonly OcupanteResuelto[];
  datosReales: boolean;
  ocupanteSeleccionado: string | null;
  onSeleccionarOcupante: (id: string | null) => void;
  className?: string;
}

function MensajeVacio() {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
      Aún no hay salas en esta oficina.
    </div>
  );
}

export function OficinaEscena2D({
  disposicion,
  ocupantes,
  datosReales,
  ocupanteSeleccionado,
  onSeleccionarOcupante,
  className,
}: OficinaEscena2DProps) {
  const ocupantesRenderizables = useMemo(() => ocupantes.filter((o) => o.ser !== null), [ocupantes]);

  const { salasProyectadas, puntosOcupantes } = useMemo(() => {
    const salas = [...disposicion.salas.values()];
    const crudos: Array<readonly [number, number]> = [];
    for (const sala of salas) {
      crudos.push([sala.centro.x - sala.radio, sala.centro.z - sala.radio], [sala.centro.x + sala.radio, sala.centro.z + sala.radio]);
    }
    for (const ocupante of ocupantesRenderizables) crudos.push([ocupante.objetivo.x, ocupante.objetivo.z]);
    if (disposicion.radioVestibulo > 0) {
      crudos.push(
        [disposicion.centroVestibulo.x - disposicion.radioVestibulo, disposicion.centroVestibulo.z - disposicion.radioVestibulo],
        [disposicion.centroVestibulo.x + disposicion.radioVestibulo, disposicion.centroVestibulo.z + disposicion.radioVestibulo],
      );
    }

    if (crudos.length === 0) {
      return { salasProyectadas: [] as Array<{ id: string; puntos: string; color: string; actividad: number; nombre: string }>, puntosOcupantes: new Map<string, { xPct: number; yPct: number }>() };
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
    const ancho = Math.max(maxX - minX, 1e-6);
    const alto = Math.max(maxY - minY, 1e-6);
    const escala = (100 - MARGEN_PORCENTAJE * 2) / Math.max(ancho, alto);
    const centroX = (minX + maxX) / 2;
    const centroY = (minY + maxY) / 2;
    const mapear = (x: number, y: number): readonly [number, number] => [50 + (x - centroX) * escala, 50 + (y - centroY) * escala];

    const salasProyectadas = salas.map((sala) => {
      const contornoCerrado = [...sala.contorno, sala.contorno[0]];
      const puntos = contornoCerrado
        .map(([lx, lz]) => {
          const [px, py] = mapear(sala.centro.x + lx, sala.centro.z + lz);
          return `${px.toFixed(2)},${py.toFixed(2)}`;
        })
        .join(" ");
      return { id: sala.id, puntos, color: sala.color, actividad: actividadVisible(sala.actividad, datosReales), nombre: sala.nombre };
    });

    const puntosOcupantes = new Map<string, { xPct: number; yPct: number }>();
    for (const ocupante of ocupantesRenderizables) {
      const [xPct, yPct] = mapear(ocupante.objetivo.x, ocupante.objetivo.z);
      puntosOcupantes.set(ocupante.serId, { xPct, yPct });
    }

    return { salasProyectadas, puntosOcupantes };
  }, [disposicion, ocupantesRenderizables, datosReales]);

  const vacia = disposicion.salas.size === 0 && ocupantes.length === 0;

  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#05070d]", className)}>
      {vacia && <MensajeVacio />}

      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {salasProyectadas.map((sala) => (
          <polygon
            key={sala.id}
            points={sala.puntos}
            fill={sala.color}
            fillOpacity={0.06 + sala.actividad * 0.22}
            stroke={sala.color}
            strokeOpacity={0.55}
            strokeWidth={0.35}
          />
        ))}
      </svg>

      {ocupantesRenderizables.map((ocupante) => {
        const p = puntosOcupantes.get(ocupante.serId);
        if (!p || !ocupante.ser) return null;
        const seleccionado = ocupanteSeleccionado === ocupante.serId;
        return (
          <button
            key={ocupante.serId}
            type="button"
            style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 ease-out",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              seleccionado ? "z-10 scale-125" : "hover:scale-110",
            )}
            aria-pressed={seleccionado}
            aria-label={describirOcupante(ocupante, ocupante.ser.nombre, Date.now())}
            onClick={() => onSeleccionarOcupante(seleccionado ? null : ocupante.serId)}
          >
            <span
              className={cn(
                "block rounded-full ring-2 ring-transparent transition-shadow",
                seleccionado && "shadow-[0_0_0_3px_rgba(255,255,255,0.35)]",
              )}
            >
              <AvatarFallbackSvg adn={adnEfectivo(ocupante.ser)} tamano={TAMANO_AVATAR_PX} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default OficinaEscena2D;
