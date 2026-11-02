"use client";
/** Panel «Contenido vivo» (CVV1028, tarea H · contrato `architecture/contenido-vivo.md` §1 y §3).
 *  Con el ADN StarSeed: tokens Trinity, centrado y adaptable a móvil. Tres tarjetas, una por nivel
 *  (3D vivo, película e imágenes, gráficos vivos), cada una con su interruptor. Por cada tarea activa
 *  se enseña la tabla de `compararRutas` con la elegida marcada y el selector para cambiarla; en un
 *  externo sin conectar aparece «Conectar» con su enlace. La cotización total y el botón «Generar»
 *  respetan la regla dura: ningún gasto sin cotización y sin un «sí». */
import { useState } from "react";
import { Activity, Clapperboard, Cuboid } from "lucide-react";
import { CATALOGO_RUTAS, TAREAS_VIVAS } from "@/lib/contenido-vivo/catalogo-rutas";
import {
  TAREAS_SIEMPRE_LOCALES, compararRutas, elegirRuta, razonCandidato, servicioConectado, servicioDeRuta, valorarRuta,
  type ContextoVivo,
} from "@/lib/contenido-vivo/rutas";
import type { TareaViva } from "@/lib/contenido-vivo/tipos";

/** Una fila de la cotización: tarea, ruta elegida y lo que cuesta. */
export interface CotizacionViva { tarea: TareaViva; rutaId: string; creditos: number; }

/** Conexiones, cupos y tope del ámbito; `onConfirmar` se llama con la cotización solo tras el «Sí» (y sin coste, directamente). */
export interface PanelContenidoVivoProps { contexto: ContextoVivo; onConfirmar: (cotizacion: CotizacionViva[]) => void; }

const NIVELES = [
  { nivel: 1, nombre: "3D vivo", icono: Cuboid, tareas: ["escena-3d"] as TareaViva[] },
  { nivel: 2, nombre: "Película e imágenes", icono: Clapperboard, tareas: ["clip-pelicula", "fotograma-clave", "foto", "foto-viva"] as TareaViva[] },
  { nivel: 3, nombre: "Gráficos vivos", icono: Activity, tareas: ["grafico-vivo"] as TareaViva[] },
];

/** El candidato de la tarea: el elegido en el panel (valorado aquí) o, si aún no hay, la propuesta de `elegirRuta`. */
function deLaTarea(tarea: TareaViva, contexto: ContextoVivo, elegidas: Partial<Record<TareaViva, string>>) {
  const elegida = elegidas[tarea];
  if (elegida) {
    const ruta = CATALOGO_RUTAS.find((r) => r.id === elegida && r.tareas.includes(tarea));
    const valorada = ruta ? valorarRuta(ruta, tarea, contexto) : null;
    if (valorada?.disponible) return valorada;
  }
  return elegirRuta(tarea, contexto);
}

/** La cotización de las tareas de los niveles encendidos, en el orden del catálogo. */
function cotizar(contexto: ContextoVivo, encendidos: Record<number, boolean>, elegidas: Partial<Record<TareaViva, string>>): CotizacionViva[] {
  return TAREAS_VIVAS.flatMap((tarea) => {
    const nivel = NIVELES.find((r) => r.tareas.includes(tarea));
    const elegida = nivel && encendidos[nivel.nivel] ? deLaTarea(tarea, contexto, elegidas) : null;
    return elegida ? [{ tarea, rutaId: elegida.ruta.id, creditos: elegida.ruta.creditosPorUnidad }] : [];
  });
}

export function PanelContenidoVivo({ contexto, onConfirmar }: PanelContenidoVivoProps) {
  const [encendidos, setEncendidos] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true });
  const [elegidas, setElegidas] = useState<Partial<Record<TareaViva, string>>>({});
  const [pendiente, setPendiente] = useState(false);
  const cotizacion = cotizar(contexto, encendidos, elegidas);
  const total = cotizacion.reduce((suma, linea) => suma + linea.creditos, 0);
  // Todo local no gasta: genera al momento; con créditos, primero pregunta y solo el «sí» mueve.
  const generar = () => (total > 0 ? setPendiente(true) : onConfirmar(cotizacion));
  const confirmar = () => { setPendiente(false); onConfirmar(cotizacion); };
  return (
    <section aria-label="Contenido vivo" className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 text-foreground sm:px-6">
      {NIVELES.map(({ nivel, nombre, icono: Icono, tareas }) => (
        <article key={nivel} className="rounded-xl border border-[#007FFF]/25 bg-background/70 p-4 backdrop-blur">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icono className="size-4 text-[#007FFF]" aria-hidden /> Nivel {nivel} · {nombre}</h3>
            <button type="button" role="switch" aria-checked={encendidos[nivel]} aria-label={`Interruptor del nivel ${nivel}`} data-testid={`interruptor-nivel-${nivel}`}
              onClick={() => setEncendidos((p) => ({ ...p, [nivel]: !p[nivel] }))}
              className={"cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition " +
                (encendidos[nivel] ? "border-[#39FF14]/50 bg-[#39FF14]/15 text-emerald-300" : "border-muted bg-muted/30 text-muted-foreground")}>
              {encendidos[nivel] ? "Encendido" : "Apagado"}
            </button>
          </header>
          {encendidos[nivel] && (
            <ul className="mt-3 space-y-4">
              {tareas.map((tarea) => (
                <TablaRutas key={tarea} tarea={tarea} contexto={contexto} elegidas={elegidas} alElegir={(id) => setElegidas((prev) => ({ ...prev, [tarea]: id }))} />
              ))}
            </ul>
          )}
        </article>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/30 bg-background/70 p-4">
        <p className="text-sm">Cotización total: <strong data-testid="total-creditos">{total}</strong> créditos</p>
        <button type="button" onClick={generar}
          className="cursor-pointer rounded-lg bg-[#007FFF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#007FFF]/85">Generar</button>
      </div>
      {pendiente && (
        <div role="alertdialog" aria-label="Confirmar la generación" data-testid="confirmacion-generar" className="rounded-xl border border-[#FFBF00]/40 bg-background p-4 text-sm">
          <p>Se van a gastar <strong>{total}</strong> créditos. ¿Seguro?</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={confirmar} className="cursor-pointer rounded-lg bg-[#007FFF] px-3 py-1.5 font-semibold text-white hover:bg-[#007FFF]/85">Sí, generar</button>
            <button type="button" onClick={() => setPendiente(false)} className="cursor-pointer rounded-lg border border-muted px-3 py-1.5 hover:bg-muted/30">Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Tabla de comparación de una tarea (contrato §3): ruta, local o externo, créditos y por qué, con
 *  un radio por candidato que marca la elegida y permite cambiarla; cada externo sin conectar lleva su «Conectar». */
function TablaRutas({ tarea, contexto, elegidas, alElegir }: {
  tarea: TareaViva; contexto: ContextoVivo; elegidas: Partial<Record<TareaViva, string>>; alElegir: (rutaId: string) => void;
}) {
  const idElegida = elegidas[tarea] ?? elegirRuta(tarea, contexto)?.ruta.id ?? "";
  const siempreLocal = TAREAS_SIEMPRE_LOCALES.includes(tarea);
  return (
    <li className="rounded-lg border border-muted bg-muted/10 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tarea: {tarea}{siempreLocal ? " · Siempre local" : ""}</p>
      <ul className="space-y-1.5 text-xs">
        {compararRutas(tarea, contexto).map((c) => (
          <li key={c.ruta.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
            <label className="flex flex-1 cursor-pointer items-start gap-2">
              <input type="radio" name={`ruta-${tarea}`} aria-label={c.ruta.nombre} checked={c.disponible && c.ruta.id === idElegida}
                disabled={!c.disponible} onChange={() => alElegir(c.ruta.id)} className="mt-0.5 cursor-pointer accent-[#007FFF]" />
              <span className="flex flex-1 flex-wrap gap-x-2">
                <span className="font-medium">{c.ruta.nombre}</span>
                <span className="text-muted-foreground">
                  {c.ruta.tipo === "local" ? "Local" : `Externo · ${servicioDeRuta(c.ruta)}`} · {c.ruta.creditosPorUnidad} créditos
                </span>
                <span className="text-muted-foreground">{razonCandidato(c.ruta, tarea, c.disponible ? null : c.motivoNoDisponible ?? null)}</span>
              </span>
            </label>
            {c.ruta.tipo === "externo" && !servicioConectado(c.ruta, contexto) && (
              <a href={c.ruta.enlaceConectar ?? c.ruta.fuente} target="_blank" rel="noreferrer" className="cursor-pointer whitespace-nowrap rounded-md border border-[#007FFF]/40 px-2 py-0.5 text-[11px] font-semibold text-[#007FFF] hover:bg-[#007FFF]/10">Conectar</a>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}
