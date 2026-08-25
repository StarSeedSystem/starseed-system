"use client";

/**
 * mundo-seres.tsx — `<MundoSeres>`: el entorno 3D compartido de Astraura.
 * Componente de PRESENTACIÓN puro — recibe seres/vínculos/comunidades/
 * espacios (y opcionalmente linaje) por props, nunca llama al backend.
 *
 * QUÉ HACE ESTE FICHERO (todo lo demás vive en ficheros más pequeños y se
 * importa aquí):
 *   - Decide 3D vs 2D: SIN WebGL, siempre 2D (nunca pantalla negra) — ver
 *     `useTieneWebGL` en avatar/hooks.ts, reutilizado tal cual.
 *   - `prefers-reduced-motion` CALMA el mundo, no lo apaga: con WebGL
 *     disponible se sigue mostrando la escena 3D real, solo que quieta
 *     (cámara sin inercia de retargeting, avatares sin pulso/rotación) —
 *     es una lectura deliberada de un encargo que menciona el respaldo 2D
 *     y "calma, no apaga" en la misma frase; forzar 2D por movimiento
 *     reducido tiraría el cuerpo 3D real por una razón que no lo pide.
 *   - Calcula la disposición (mundo o linaje) UNA vez por cambio de datos
 *     (`useMemo`, no en cada fotograma) y la convierte a las posiciones que
 *     cada escena necesita.
 *   - Es la única fuente de verdad de "qué ser está seleccionado", y la
 *     reparte a la escena visual Y a la lista accesible en paralelo.
 *   - Cuando la escena es 3D (un `<canvas>` opaco para un lector de
 *     pantalla) monta ADEMÁS una lista real de `<button>` — uno por ser,
 *     con su nombre — para seleccionar y anunciar sin depender del ratón
 *     ni de la vista. Con la escena 2D no hace falta: cada ser YA es un
 *     `<button>` real ahí (ver mundo-escena-2d.tsx).
 */

import { useEffect, useMemo, useState } from "react";
import { useTieneWebGL, usePrefiereMovimientoReducido } from "../avatar/hooks";
import { LimiteErrorWebGL } from "../avatar/webgl-error-boundary";
import { calcularDisposicionMundo, vinculosAAristasVisibles } from "./mundo-layout";
import { calcularDisposicionLinaje } from "./mundo-linaje";
import { MundoEscena3D } from "./mundo-escena-3d";
import { MundoEscena2D } from "./mundo-escena-2d";
import { cn } from "@/lib/utils";
import type { MundoSeresProps, PosicionMundo, RegionVisible, VistaMundo } from "./mundo-tipos";

/** Tab en segundo plano = nadie lo ve: se pausa el pulso de los avatares y
 * el retargeting de cámara, igual que ya hace `quantum-orb.tsx` con su
 * propio `docVisible` — mismo patrón, instancia propia (no hay nada que
 * exportar de allí: es un `useEffect` interno a ese componente). */
function useVisibilidadDocumento(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const actualizar = () => setVisible(!document.hidden);
    actualizar();
    document.addEventListener("visibilitychange", actualizar);
    return () => document.removeEventListener("visibilitychange", actualizar);
  }, []);
  return visible;
}

function posicionLinajeAMundo(p: { x: number; y: number }): PosicionMundo {
  // Igual que en mundo-layout.ts: el linaje es un árbol plano (x=columna,
  // y=generación) — aquí se acuesta en el plano X/Y del mundo (Z≈0) en vez
  // de inventarle profundidad que no significa nada.
  return { x: p.x, y: p.y, z: 0 };
}

export function MundoSeres({
  seres,
  vinculos,
  comunidades,
  espacios,
  linaje = [],
  className,
  onSeleccionCambia,
  controlesExtra,
}: MundoSeresProps) {
  const hayWebGL = useTieneWebGL();
  const movimientoReducido = usePrefiereMovimientoReducido();
  const documentoVisible = useVisibilidadDocumento();
  const animar = documentoVisible && !movimientoReducido;

  const hayLinaje = linaje.length > 0;
  const [vista, setVista] = useState<VistaMundo>("mundo");
  const vistaEfectiva: VistaMundo = hayLinaje ? vista : "mundo";

  const [seleccion, setSeleccion] = useState<string | null>(null);
  const seleccionar = (id: string | null) => {
    setSeleccion(id);
    onSeleccionCambia?.(id);
  };

  // ── Disposición del mundo (grafo de fuerzas honesto) ──────────────────
  const disposicionMundo = useMemo(
    () => calcularDisposicionMundo(seres, vinculos, comunidades, espacios),
    [seres, vinculos, comunidades, espacios],
  );

  // ── Disposición del linaje (árbol, no nube) ────────────────────────────
  const disposicionLinaje = useMemo(() => calcularDisposicionLinaje(linaje), [linaje]);

  const posiciones = useMemo((): ReadonlyMap<string, PosicionMundo> => {
    if (vistaEfectiva === "linaje") {
      const mapa = new Map<string, PosicionMundo>();
      for (const [id, p] of disposicionLinaje.posiciones) mapa.set(id, posicionLinajeAMundo(p));
      return mapa;
    }
    return disposicionMundo.seres;
  }, [vistaEfectiva, disposicionLinaje, disposicionMundo]);

  const aristas = useMemo(() => {
    if (vistaEfectiva === "linaje") return disposicionLinaje.aristas;
    return vinculosAAristasVisibles(vinculos, disposicionMundo.seres);
  }, [vistaEfectiva, disposicionLinaje, vinculos, disposicionMundo]);

  const regiones = useMemo((): readonly RegionVisible[] => {
    if (vistaEfectiva === "linaje") return [];
    const resultado: RegionVisible[] = [];
    for (const comunidad of comunidades) {
      const dispuesta = disposicionMundo.comunidades.get(comunidad.id);
      if (!dispuesta) continue;
      resultado.push({ ...dispuesta, tipo: "comunidad", nombre: comunidad.nombre, color: comunidad.color ?? null, semilla: null });
    }
    for (const espacio of espacios) {
      const dispuesta = disposicionMundo.espacios.get(espacio.id);
      if (!dispuesta) continue;
      resultado.push({ ...dispuesta, tipo: "espacio", nombre: espacio.nombre, color: null, semilla: espacio.semilla });
    }
    return resultado;
  }, [vistaEfectiva, comunidades, espacios, disposicionMundo]);

  // ── Anuncio para lector de pantalla ────────────────────────────────────
  const nombrePorComunidad = useMemo(() => new Map(comunidades.map((c) => [c.id, c.nombre] as const)), [comunidades]);
  const serSeleccionado = useMemo(() => seres.find((s) => s.id === seleccion) ?? null, [seres, seleccion]);
  const anuncio = useMemo(() => {
    if (!serSeleccionado) return "";
    const nombresComunidades = serSeleccionado.comunidades.map((id) => nombrePorComunidad.get(id)).filter((n): n is string => !!n);
    const partes = [`${serSeleccionado.nombre}, ${serSeleccionado.rol}.`];
    partes.push(nombresComunidades.length > 0 ? `Comunidades: ${nombresComunidades.join(", ")}.` : "Sin comunidad.");
    return partes.join(" ");
  }, [serSeleccionado, nombrePorComunidad]);

  const serosOrdenados = useMemo(() => [...seres].sort((a, b) => a.nombre.localeCompare(b.nombre)), [seres]);

  // Se construye una sola vez: la usa tanto la rama "sin WebGL" como el
  // `respaldo` del límite de error de la rama "con WebGL, pero falló al
  // montar" — un solo camino de respaldo, no dos que puedan divergir.
  const escena2D = (
    <MundoEscena2D
      className="aspect-[4/3] w-full"
      seres={seres}
      posiciones={posiciones}
      aristas={aristas}
      regiones={regiones}
      seleccion={seleccion}
      onSeleccionar={seleccionar}
      vista={vistaEfectiva}
    />
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {(hayLinaje || controlesExtra) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hayLinaje && (
            // Botones simples con `aria-pressed`, no `role="tablist"/"tab"`:
            // ese patrón ARIA promete navegación con flechas entre pestañas,
            // y aquí serían dos botones normales — prometerlo sin cablearlo
            // sería peor que no anunciarlo (el foco/Tab/Enter nativos ya
            // bastan para dos botones).
            <div role="group" aria-label="Vista del mundo" className="inline-flex overflow-hidden rounded-lg border border-white/10 text-xs">
              {(["mundo", "linaje"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vista === v}
                  onClick={() => setVista(v)}
                  className={cn(
                    "px-3 py-1.5 capitalize transition-colors",
                    vista === v ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          {controlesExtra}
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {anuncio}
      </div>

      {hayWebGL ? (
        // `useTieneWebGL` prueba un contexto ANTES de montar el Canvas real,
        // pero esa sonda no es garantía absoluta (contexto perdido justo al
        // crear el real, driver que falla solo con ciertos flags…) — por eso
        // la escena 3D Y su lista accesible viven DENTRO del mismo límite de
        // error que ya construyó el subagente del avatar: si el montaje real
        // falla, cae entero al mismo respaldo 2D digno, sin dejar un hueco
        // roto ni una lista accesible huérfana apuntando a un Canvas que ya
        // no está.
        <LimiteErrorWebGL respaldo={escena2D}>
          <MundoEscena3D
            className="h-[520px] w-full overflow-hidden rounded-xl border border-white/10"
            seres={seres}
            posiciones={posiciones}
            aristas={aristas}
            regiones={regiones}
            seleccion={seleccion}
            onSeleccionar={seleccionar}
            animar={animar}
          />

          {/* Lista accesible en paralelo: el <canvas> de arriba es opaco
              para un lector de pantalla, así que esta es la única forma de
              seleccionar/escuchar un ser sin ratón. La escena 2D no la
              necesita — ahí cada ser YA es un <button> real. */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
            <h3 className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-white/40">
              Seres ({seres.length})
            </h3>
            {seres.length === 0 ? (
              <p className="px-1 py-2 text-sm text-white/50">Aún no hay seres en este mundo.</p>
            ) : (
              <ul role="list" className="max-h-48 overflow-y-auto">
                {serosOrdenados.map((ser) => (
                  <li key={ser.id}>
                    <button
                      type="button"
                      aria-pressed={seleccion === ser.id}
                      aria-label={`${ser.nombre}, ${ser.rol}`}
                      onClick={() => seleccionar(seleccion === ser.id ? null : ser.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                        seleccion === ser.id ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      {ser.nombre} <span className="text-white/40">· {ser.rol}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </LimiteErrorWebGL>
      ) : (
        escena2D
      )}
    </div>
  );
}

export default MundoSeres;
