"use client";

/**
 * Panel «Contenido vivo» (CVV1028, tarea H).
 * Contrato architecture/contenido-vivo.md §§1-3. La lógica pura vive en
 * `src/lib/contenido-vivo/panel.ts`.
 */

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { compararRutas, type CandidatoRuta, type ContextoVivo } from "@/lib/contenido-vivo/rutas";
import {
  NIVELES_PANEL, cotizarSeleccion, elegidasIniciales, necesitaConectar, tareasDeNiveles,
  type ConfirmacionContenidoVivo, type SeleccionRutas,
} from "@/lib/contenido-vivo/panel";
import type { NivelVivo, TareaViva } from "@/lib/contenido-vivo/tipos";

export interface PanelContenidoVivoProps { contexto: ContextoVivo; onConfirmar: (confirmacion: ConfirmacionContenidoVivo) => void; }

interface FilaTareaProps { tarea: TareaViva; contexto: ContextoVivo; elegida: string | undefined; onElegir: (idRuta: string) => void; }

function FilaTarea({ tarea, contexto, elegida, onElegir }: FilaTareaProps) {
  const candidatos = compararRutas(tarea, contexto);
  return (
    <div className="rounded-2xl border border-border/70 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="font-mono text-sm text-foreground">{tarea}</h4>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Ruta elegida
          <select aria-label={`Elegir ruta para ${tarea}`} value={elegida ?? ""} onChange={(evento) => onElegir(evento.target.value)} className="cursor-pointer rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">
            {candidatos.map(({ ruta, disponible }) => <option key={ruta.id} value={ruta.id} disabled={!disponible}>{ruta.nombre}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead><tr className="text-muted-foreground"><th className="pb-1">Ruta</th><th className="pb-1">Local o externo</th><th className="pb-1">Créditos</th><th className="pb-1">Por qué</th><th className="pb-1" /></tr></thead>
          <tbody>
            {candidatos.map((candidato) => <FilaRuta key={candidato.ruta.id} candidato={candidato} contexto={contexto} elegida={candidato.ruta.id === elegida} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaRuta({ candidato, contexto, elegida }: { candidato: CandidatoRuta; contexto: ContextoVivo; elegida: boolean }) {
  const { ruta, disponible, motivoNoDisponible, razon } = candidato;
  return (
    <tr className={elegida ? "border-t border-border/50 bg-primary/10 align-top" : "border-t border-border/50 align-top"}>
      <td className="py-1 pr-2 font-medium">{ruta.nombre}{elegida && <span className="ml-1 text-[10px] uppercase text-primary">Elegida</span>}</td>
      <td className="py-1 pr-2">{ruta.tipo}</td>
      <td className="py-1 pr-2 font-mono">{ruta.creditosPorUnidad}</td>
      <td className="py-1 pr-2 text-muted-foreground">{disponible ? razon : motivoNoDisponible}</td>
      <td className="py-1">
        {necesitaConectar(ruta, contexto) && ruta.enlaceConectar && (
          <a href={ruta.enlaceConectar} target="_blank" rel="noreferrer" aria-label={`Conectar ${ruta.nombre}`} className="cursor-pointer rounded-full border border-primary/40 px-3 py-1 text-[11px] text-primary hover:bg-primary/10">Conectar</a>
        )}
      </td>
    </tr>
  );
}

export function PanelContenidoVivo({ contexto, onConfirmar }: PanelContenidoVivoProps) {
  const [activos, setActivos] = useState<Record<NivelVivo, boolean>>({ 1: true, 2: true, 3: true });
  const [seleccion, setSeleccion] = useState<SeleccionRutas>(() => elegidasIniciales(contexto));
  const [confirmando, setConfirmando] = useState(false);
  const niveles = NIVELES_PANEL.filter((nivel) => activos[nivel.id]).map((nivel) => nivel.id);
  const total = cotizarSeleccion(seleccion, tareasDeNiveles(niveles));
  const confirmacion = (): ConfirmacionContenidoVivo => ({ totalCreditos: total, seleccion: { ...seleccion }, niveles });

  function generar() {
    if (total > 0) return setConfirmando(true);
    onConfirmar(confirmacion());
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6" data-ss-panel-contenido-vivo>
      <header className="text-center">
        <h2 className="font-headline text-2xl text-foreground">Contenido vivo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Compara lo local con los servicios externos antes de gastar créditos.</p>
      </header>
      {NIVELES_PANEL.map((nivel) => (
        <article key={nivel.id} className="rounded-3xl border border-border bg-card/80 p-4 text-card-foreground shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-headline text-lg">{nivel.id} · {nivel.nombre}</h3>
              <p className="text-xs text-muted-foreground">{nivel.descripcion}</p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {activos[nivel.id] ? "Encendido" : "Apagado"}
              <Switch aria-label={nivel.nombre} checked={activos[nivel.id]} onCheckedChange={(valor) => setActivos((previo) => ({ ...previo, [nivel.id]: valor }))} />
            </label>
          </div>
          {activos[nivel.id] && (
            <div className="mt-4 flex flex-col gap-4">
              {nivel.tareas.map((tarea) => (
                <FilaTarea key={tarea} tarea={tarea} contexto={contexto} elegida={seleccion[tarea]} onElegir={(idRuta) => setSeleccion((previo) => ({ ...previo, [tarea]: idRuta }))} />
              ))}
            </div>
          )}
        </article>
      ))}
      <footer className="sticky bottom-0 flex flex-col items-center gap-3 rounded-3xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:justify-between">
        <p className="text-sm text-foreground">Cotización total: <strong>{total} créditos</strong></p>
        <button type="button" onClick={generar} className="cursor-pointer rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Generar</button>
      </footer>
      {confirmando && (
        <div role="alertdialog" aria-label="Confirmar generación" className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md flex-col gap-3 rounded-3xl border border-border bg-card p-4 text-card-foreground shadow-xl sm:inset-x-auto sm:right-6">
          <p className="text-sm">Se van a gastar <strong>{total} créditos</strong> en las rutas elegidas.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmando(false)} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm">Cancelar</button>
            <button type="button" onClick={() => { setConfirmando(false); onConfirmar(confirmacion()); }} className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Sí, generar</button>
          </div>
        </div>
      )}
    </section>
  );
}
