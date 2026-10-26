"use client";
/**
 * Desarrollo del agente (Ola 1025U · U2) — sección de SOLO LECTURA de la pestaña «Identidad».
 * Muestra lo que de verdad hay: las memorias recientes que el agente puede ver y cómo han movido sus rasgos la
 * experiencia (con tope diario). Sin datos lo dice; no inventa actividad. Lo único que se puede hacer aquí es
 * deshacer un paso de evolución.
 */
import { History, Sprout, Undo2 } from "lucide-react";
import { ETIQUETA_ALCANCE, haceCuanto, type VistaDesarrollo } from "@/lib/avatares/agente/desarrollo";
import { DERIVA_MAX, ETIQUETA_RASGO } from "@/lib/avatares/agente/percepcion";
import { BotonFicha, Bloque, num } from "./ui-ficha";

export interface SeccionDesarrolloProps {
  vista: VistaDesarrollo;
  ahora: number;
  alDeshacer: (idPaso: string) => void;
}

const conSigno = (x: number): string => (x > 0 ? `+${num(x)}` : x < 0 ? `-${num(Math.abs(x))}` : num(0));

export function SeccionDesarrollo({ vista, ahora, alDeshacer }: SeccionDesarrolloProps) {
  return (
    <Bloque
      icono={Sprout}
      titulo="Desarrollo"
      id="ficha-desarrollo"
      ayuda="Solo lectura. Lo que pasa con este agente con el tiempo: lo que recuerda y cómo la experiencia mueve sus rasgos. Lo que fijas tú en «Percepción» no cambia nunca por su cuenta."
    >
      {vista.sinDatos && (
        <p data-testid="desarrollo-sin-datos" className="mb-3 break-words rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
          Sin datos todavía: este agente aún no guarda recuerdos ni ha evolucionado. Cuando lo haga, aparecerá aquí.
        </p>
      )}

      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Memorias recientes</h4>
      {vista.memorias.length === 0 ? (
        <p data-testid="desarrollo-sin-memorias" className="mb-3 break-words text-xs text-muted-foreground">
          No hay recuerdos guardados que este agente pueda ver.
        </p>
      ) : (
        <>
          <ul className="mb-1 space-y-1.5" aria-label="Memorias recientes">
            {vista.memorias.map((m) => (
              <li key={m.id} className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="break-words text-sm text-foreground">{m.texto}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full border border-white/15 px-1.5 py-px">{ETIQUETA_ALCANCE[m.alcance]}</span>
                  <span className="break-words">{m.origen}</span>
                  <span>{haceCuanto(m.at, ahora)}</span>
                  {m.fijado && <span>fijado</span>}
                </p>
              </li>
            ))}
          </ul>
          <p className="mb-3 text-[11px] text-muted-foreground">
            {vista.memorias.length} de {vista.totalMemorias} recuerdos.
          </p>
        </>
      )}

      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evolución de rasgos</h4>
      {!vista.hayEvolucion ? (
        <p data-testid="desarrollo-sin-evolucion" className="break-words text-xs text-muted-foreground">
          Aún no ha evolucionado. La experiencia mueve estos rasgos poco a poco: como mucho {num(vista.topeDiario)} por rasgo y día, nunca más de{" "}
          {num(DERIVA_MAX)} de lo que fijaste, y cada paso se puede deshacer.
        </p>
      ) : (
        <>
          <ul className="mb-2 space-y-1.5" aria-label="Evolución por rasgo">
            {vista.evolucion.map((f) => (
              <li key={f.rasgo} className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-sm text-foreground">{ETIQUETA_RASGO[f.rasgo].nombre}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {num(f.base)} → <strong className="text-foreground">{num(f.efectivo)}</strong> ({conSigno(f.deriva)})
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Hoy se ha movido {num(f.usadoHoy)} de {num(vista.topeDiario)}; le quedan {num(f.restanteHoy)}.
                </p>
              </li>
            ))}
          </ul>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="h-3.5 w-3.5" aria-hidden="true" /> Últimos pasos
          </h4>
          <ul className="space-y-1.5" aria-label="Últimos pasos de evolución">
            {vista.pasos.map((p) => (
              <li key={p.id} data-deshecho={p.deshecha ? "true" : undefined} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 pl-3">
                <span className="min-w-0 py-1.5 text-xs">
                  <span className={p.deshecha ? "text-muted-foreground line-through" : "text-foreground"}>
                    {ETIQUETA_RASGO[p.rasgo].nombre} {conSigno(p.delta)}
                  </span>
                  <span className="block break-words text-[11px] text-muted-foreground">
                    {p.motivo || "sin motivo anotado"} · {haceCuanto(p.at, ahora)}
                    {p.deshecha ? " · deshecho" : ""}
                  </span>
                </span>
                {!p.deshecha && (
                  <BotonFicha icono={Undo2} aria-label={`Deshacer ${ETIQUETA_RASGO[p.rasgo].nombre} ${conSigno(p.delta)}`} onClick={() => alDeshacer(p.id)} className="shrink-0 border-transparent">
                    <span className="sr-only sm:not-sr-only">Deshacer</span>
                  </BotonFicha>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">Deshacer devuelve el rasgo, pero no devuelve el cupo del día: el tope sigue contando.</p>
        </>
      )}
    </Bloque>
  );
}
