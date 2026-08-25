"use client";

/**
 * oficina-seres.tsx — `<OficinaSeres estado={} seres={} />`: la oficina 3D de
 * StarSeed, portada de Hermes3D (MIT, © 2026 Luke The Dev — atribución
 * íntegra en `LICENSE-hermes3d.md`, en esta misma carpeta). Componente de
 * PRESENTACIÓN puro — recibe `estado`/`seres` por props y nunca llama al
 * backend, exactamente como pide el encargo y como ya hace `MundoSeres` en
 * `genesis/mundo/mundo-seres.tsx` (la plantilla arquitectónica de esta pieza:
 * misma estructura — sonda de WebGL, `prefers-reduced-motion`, pestaña en
 * segundo plano, lista accesible en paralelo — para que el mundo y la
 * oficina se comporten igual ante las mismas condiciones del navegador).
 *
 * LO QUE AÑADE ESTA PIEZA QUE `MundoSeres` NO TENÍA:
 *   - Honestidad de la escena: `estado.datosReales` decide TODO lo que se
 *     anima (ver `oficina-honestidad.ts`) — con `false`, ni un solo ocupante
 *     se mueve, y la barra superior lo dice, no solo lo insinúa.
 *   - Pantalla completa real (Fullscreen API + respaldo interno por CSS si
 *     el navegador la deniega) — ver `oficina-fullscreen.ts`.
 *   - Una segunda lista accesible, "Salas", presente SIEMPRE (con o sin
 *     WebGL) — a diferencia de la lista "Seres" (que, como en `MundoSeres`,
 *     solo hace falta en la rama 3D: en 2D cada ocupante YA es un `<button>`
 *     real). Las salas, en cambio, son polígonos `aria-hidden` decorativos
 *     en LAS DOS escenas — así que sin esta lista no habría ninguna forma no
 *     visual de saber qué salas existen ni de "viajar" a una.
 */

import { useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTieneWebGL, usePrefiereMovimientoReducido } from "../avatar/hooks";
import { LimiteErrorWebGL } from "../avatar/webgl-error-boundary";
import { disponerSalas } from "./oficina-salas";
import { agruparPorSala, contarPorSala, describirOcupante, parametrosActividad, posicionOcupante } from "./oficina-ocupantes";
import { actividadVisible, debeAnimarOficina, mensajeHonestidad } from "./oficina-honestidad";
import { useOficinaPantallaCompleta } from "./oficina-fullscreen";
import { OficinaEscena3D } from "./oficina-escena-3d";
import { OficinaEscena2D } from "./oficina-escena-2d";
import { cn } from "@/lib/utils";
import type { OcupanteResuelto, OficinaSeresProps } from "./oficina-tipos";

/** Tab en segundo plano = nadie lo ve: mismo patrón que `useVisibilidadDocumento`
 * interno de `mundo-seres.tsx` — instancia propia porque ese no se exporta
 * desde allí (es un detalle interno de ese módulo, no vocabulario público). */
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

export function OficinaSeres({ estado, seres, className, onSeleccionCambia, controlesExtra }: OficinaSeresProps) {
  const hayWebGL = useTieneWebGL();
  const movimientoReducido = usePrefiereMovimientoReducido();
  const documentoVisible = useVisibilidadDocumento();
  const animarEfectivo = debeAnimarOficina({ datosReales: estado.datosReales, documentoVisible, movimientoReducido });

  const { modo, contenedorRef, alternar } = useOficinaPantallaCompleta();

  // ── Plano de la oficina: salas dispuestas + ocupantes agrupados ────────
  const idsSalasValidas = useMemo(() => new Set(estado.salas.map((s) => s.id)), [estado.salas]);
  const agrupado = useMemo(() => agruparPorSala(estado.ocupantes, idsSalasValidas), [estado.ocupantes, idsSalasValidas]);
  const conteoPorSala = useMemo(() => contarPorSala(agrupado), [agrupado]);
  const ocupantesSinSala = agrupado.get(null)?.length ?? 0;
  const disposicion = useMemo(
    () => disponerSalas(estado.salas, conteoPorSala, ocupantesSinSala),
    [estado.salas, conteoPorSala, ocupantesSinSala],
  );

  const mapaSeres = useMemo(() => new Map(seres.map((s) => [s.id, s] as const)), [seres]);

  const ocupantesResueltos = useMemo((): OcupanteResuelto[] => {
    const resultado: OcupanteResuelto[] = [];
    for (const grupo of agrupado.values()) {
      grupo.forEach((oc, indice) => {
        resultado.push({
          serId: oc.serId,
          ser: mapaSeres.get(oc.serId) ?? null,
          salaId: oc.salaId,
          actividad: oc.actividad,
          detalle: oc.detalle ?? null,
          desde: oc.desde,
          objetivo: posicionOcupante(oc, indice, grupo.length, disposicion),
          animacion: parametrosActividad(oc.actividad, estado.datosReales),
        });
      });
    }
    return resultado;
  }, [agrupado, disposicion, mapaSeres, estado.datosReales]);

  // ── Selección: ocupante (detalle + cámara) y sala enfocada (cámara) ────
  const [ocupanteSeleccionado, setOcupanteSeleccionado] = useState<string | null>(null);
  const seleccionarOcupante = (id: string | null) => {
    setOcupanteSeleccionado(id);
    onSeleccionCambia?.(id);
  };
  const [salaEnfocada, setSalaEnfocada] = useState<string | null>(null);
  const enfocarSala = (id: string | null) => setSalaEnfocada(id);
  const ciclarSala = (direccion: 1 | -1) => {
    const ids = disposicion.idsOrdenados;
    if (ids.length === 0) return;
    const indiceActual = salaEnfocada ? ids.indexOf(salaEnfocada) : -1;
    const siguiente = indiceActual === -1 ? (direccion === 1 ? 0 : ids.length - 1) : (indiceActual + direccion + ids.length) % ids.length;
    setSalaEnfocada(ids[siguiente]);
  };

  // ── Anuncio para lector de pantalla: solo el ocupante seleccionado — el
  // mensaje de honestidad va en la insignia visible (también accesible, ver
  // abajo `aria-live` en la propia insignia) para no duplicar ni competir. ──
  const ocupanteSeleccionadoObj = ocupantesResueltos.find((o) => o.serId === ocupanteSeleccionado) ?? null;
  const anuncio =
    ocupanteSeleccionadoObj?.ser ? describirOcupante(ocupanteSeleccionadoObj, ocupanteSeleccionadoObj.ser.nombre, Date.now()) : "";

  const salasOrdenadas = disposicion.idsOrdenados.map((id) => disposicion.salas.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
  const seresOrdenados = [...ocupantesResueltos]
    .filter((o): o is OcupanteResuelto & { ser: NonNullable<OcupanteResuelto["ser"]> } => o.ser !== null)
    .sort((a, b) => a.ser.nombre.localeCompare(b.ser.nombre));

  const escena2D = (
    <OficinaEscena2D
      className={modo === "normal" ? "aspect-[4/3] w-full" : "min-h-0 w-full flex-1"}
      disposicion={disposicion}
      ocupantes={ocupantesResueltos}
      datosReales={estado.datosReales}
      ocupanteSeleccionado={ocupanteSeleccionado}
      onSeleccionarOcupante={seleccionarOcupante}
    />
  );

  return (
    <div
      ref={contenedorRef}
      className={cn(
        "flex flex-col gap-3",
        modo === "interno" && "fixed inset-0 z-50 overflow-y-auto bg-[#05070d] p-4",
        modo === "nativo" && "h-full w-full bg-[#05070d] p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
            estado.datosReales ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", estado.datosReales ? "bg-emerald-400" : "bg-amber-400")} aria-hidden="true" />
          {mensajeHonestidad(estado.datosReales)}
        </span>

        <div className="flex items-center gap-2">
          {controlesExtra}
          <button
            type="button"
            onClick={() => void alternar()}
            aria-pressed={modo !== "normal"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {modo === "normal" ? <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {modo === "normal" ? "Pantalla completa" : "Salir de pantalla completa"}
          </button>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {anuncio}
      </div>

      {/* Salas — SIEMPRE presente, con o sin WebGL: en las dos escenas cada
          sala es un polígono decorativo (`aria-hidden`), así que esta es la
          única forma de saber qué salas existen y de enfocar una sin ratón. */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
        <h3 className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-white/40">Salas ({disposicion.salas.size})</h3>
        {salasOrdenadas.length === 0 ? (
          <p className="px-1 py-2 text-sm text-white/50">Aún no hay salas en esta oficina.</p>
        ) : (
          <ul role="list" className="flex max-h-40 flex-col overflow-y-auto">
            {salasOrdenadas.map((sala) => {
              const enfocada = salaEnfocada === sala.id;
              const actividad = actividadVisible(sala.actividad, estado.datosReales);
              return (
                <li key={sala.id}>
                  <button
                    type="button"
                    aria-pressed={enfocada}
                    aria-label={`${sala.nombre}, ${sala.ocupantes} ${sala.ocupantes === 1 ? "ser" : "seres"}, ${Math.round(actividad * 100)} por ciento de actividad`}
                    onClick={() => enfocarSala(enfocada ? null : sala.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                      enfocada ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sala.color }} aria-hidden="true" />
                    <span className="flex-1 truncate">{sala.nombre}</span>
                    <span className="text-white/40">{sala.ocupantes}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hayWebGL ? (
        // Igual que en `mundo-seres.tsx`: la sonda de WebGL no es garantía
        // absoluta, así que la escena 3D vive dentro del mismo límite de
        // error que ya construyó el subagente del avatar — si el montaje
        // real falla, cae entero al respaldo 2D, sin listas huérfanas.
        <LimiteErrorWebGL respaldo={escena2D}>
          <OficinaEscena3D
            className={cn(modo === "normal" ? "h-[520px]" : "min-h-0 flex-1", "w-full overflow-hidden rounded-xl border border-white/10")}
            disposicion={disposicion}
            ocupantes={ocupantesResueltos}
            datosReales={estado.datosReales}
            animar={animarEfectivo}
            ocupanteSeleccionado={ocupanteSeleccionado}
            salaEnfocada={salaEnfocada}
            onSeleccionarOcupante={seleccionarOcupante}
            onEnfocarSala={enfocarSala}
            onCiclarSala={ciclarSala}
          />

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
            <h3 className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-white/40">Seres ({seresOrdenados.length})</h3>
            {seresOrdenados.length === 0 ? (
              <p className="px-1 py-2 text-sm text-white/50">Aún no hay seres en esta oficina.</p>
            ) : (
              <ul role="list" className="max-h-48 overflow-y-auto">
                {seresOrdenados.map((ocupante) => (
                  <li key={ocupante.serId}>
                    <button
                      type="button"
                      aria-pressed={ocupanteSeleccionado === ocupante.serId}
                      aria-label={describirOcupante(ocupante, ocupante.ser.nombre, Date.now())}
                      onClick={() => seleccionarOcupante(ocupanteSeleccionado === ocupante.serId ? null : ocupante.serId)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                        ocupanteSeleccionado === ocupante.serId ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      {ocupante.ser.nombre} <span className="text-white/40">· {ocupante.ser.rol}</span>
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

export default OficinaSeres;
