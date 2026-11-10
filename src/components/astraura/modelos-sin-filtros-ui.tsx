"use client";

// Piezas de MOD1110B para «Modelos de IA»: el interruptor «Mostrar variantes sin filtros» con su confirmación, la insignia de la clase,
// la instalación guiada de Ollama (pregunta primero, con el tamaño) y el paso siguiente al modelo que se había recomendado.
// Presentacionales: todo llega de `useModelosNeurona`. Contrato: architecture/modelos-recomendados.md §10 y §11.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Copy, Download, Loader2, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PreguntaDescarga } from "./modelos-ui";
import type { AccionesModelos, EstadoModelos } from "@/lib/astraura/modelos/use-modelos";
import type { ProgresoNativoOllama, ResultadoInstalacionOllama } from "@/lib/astraura/modelos/instalar-ollama";
import { EXPLICACION_SIN_FILTROS, TITULO_CONFIRMACION_SIN_FILTROS } from "@/lib/astraura/modelos/variantes";

export function InsigniaSinFiltros() {
  return (
    <span data-insignia="sin-filtros" className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-2 py-0.5 text-[11px] text-fuchsia-200">
      <ShieldAlert className="h-3 w-3" aria-hidden />Sin filtros · comunidad
    </span>
  );
}

// ── Interruptor + confirmación ───────────────────────────────────────────────────────────────────────

type VistaInterruptor = Pick<EstadoModelos & AccionesModelos, "sinFiltros" | "activarVariantes" | "desactivarVariantes">;

export function InterruptorSinFiltros({ e }: { e: VistaInterruptor }) {
  const [confirmando, setConfirmando] = useState(false);
  const { activado, disponible, motivo } = e.sinFiltros;
  return (
    <fieldset className="space-y-1 text-[11px] text-white/60" data-campo="variantes-sin-filtros">
      <legend className="text-white/70">Variantes sin filtros</legend>
      <label className={cn("flex items-center gap-2", !disponible && "opacity-60")}>
        <input
          type="checkbox" role="switch" aria-label={TITULO_CONFIRMACION_SIN_FILTROS} checked={activado} disabled={!disponible}
          onChange={(ev) => { if (ev.currentTarget.checked) setConfirmando(true); else e.desactivarVariantes(); }}
        />
        {TITULO_CONFIRMACION_SIN_FILTROS}
      </label>
      {!disponible && <p className="text-amber-300" data-campo="variantes-motivo">{motivo}</p>}
      {disponible && !activado && <p className="text-white/40">Apagado. Son modelos de la comunidad sin los rechazos del editor; se explican antes de encenderlas.</p>}
      {activado && <p className="text-white/45">Encendido: aparecen en la Biblioteca, en «Modelos de IA», en su propia sección. «Automático» nunca las elige.</p>}
      {confirmando && (
        <div role="alertdialog" aria-label={TITULO_CONFIRMACION_SIN_FILTROS} className="space-y-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/[0.07] p-3 text-[12px] text-white/80">
          <p className="flex items-center gap-1.5 font-medium text-fuchsia-100"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{TITULO_CONFIRMACION_SIN_FILTROS}</p>
          <ul className="list-disc space-y-1 pl-4">{EXPLICACION_SIN_FILTROS.map((l) => <li key={l}>{l}</li>)}</ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => { e.activarVariantes(); setConfirmando(false); }}
              className="cursor-pointer rounded-md bg-fuchsia-500/25 px-2.5 py-1 text-fuchsia-50 hover:bg-fuchsia-500/35">Entiendo, mostrarlas</button>
            <button type="button" onClick={() => setConfirmando(false)} className="cursor-pointer rounded-md px-2.5 py-1 text-white/60 hover:text-white/85">Cancelar</button>
          </div>
        </div>
      )}
    </fieldset>
  );
}

// ── Instalar Ollama ─────────────────────────────────────────────────────────────────────────────────

type VistaOllama = Pick<EstadoModelos & AccionesModelos, "ollama" | "perfil" | "instalarOllama" | "cancelarOllama" | "vigilarOllama" | "comprobarOllama">;

/** Donde el recomendador dice que falta un runtime: «Instalar Ollama» (pregunta primero) o por qué no se puede. */
export function InstalarOllama({ e, modeloId, abriria = 0 }: { e: VistaOllama; modeloId?: string; abriria?: number }) {
  const [fase, setFase] = useState<"cerrado" | "pregunta" | "trabajando" | "fin">("cerrado");
  const [progreso, setProgreso] = useState<ProgresoNativoOllama | null>(null);
  const [res, setRes] = useState<ResultadoInstalacionOllama | null>(null);
  const [copiado, setCopiado] = useState(false);
  const parar = useRef<null | (() => void)>(null);
  const { ficha, pregunta, presente, sistema } = e.ollama;

  // Mientras el cuadro está abierto, mira con suavidad si Ollama ya responde.
  useEffect(() => {
    if (fase === "cerrado" || presente) { parar.current?.(); parar.current = null; return; }
    if (fase === "pregunta" && ficha.accion === "descargar-instalador") return; // aún no se ha pedido nada: no se mira
    parar.current = e.vigilarOllama();
    return () => { parar.current?.(); parar.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, presente]);

  if (!e.perfil || presente) {
    return presente && e.perfil ? <p className="text-[11px] text-emerald-300" data-campo="ollama-listo">Ollama detectado en esta neurona.</p> : null;
  }
  const lineaAbriria = abriria > 0 ? `Con Ollama se abrirían ${abriria} modelos más.` : "";
  const copiar = async () => {
    try { await navigator.clipboard.writeText(ficha.comando ?? ""); setCopiado(true); } catch { setCopiado(false); }
  };
  const cerrar = () => { setFase("cerrado"); setRes(null); setProgreso(null); };
  const descargar = async () => {
    setFase("trabajando");
    const r = await e.instalarOllama(true, { modeloId, onProgreso: setProgreso });
    setRes(r);
    setFase("fin");
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[12px]" data-campo="ollama">
      <p className="text-white/70">
        Esta neurona no tiene Ollama, así que solo puede usar las capas ligeras de Astraura. {lineaAbriria}
      </p>
      {fase === "cerrado" && ficha.accion !== "no-corre-aqui" && (
        <button type="button" onClick={() => setFase("pregunta")}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-500/25">
          <Download className="h-3 w-3" aria-hidden />Instalar Ollama
        </button>
      )}
      {fase === "cerrado" && ficha.accion === "no-corre-aqui" && (
        <details className="text-[11px] text-white/55">
          <summary className="cursor-pointer">Ollama no corre aquí: qué sí funciona</summary>
          <p className="mt-1">{pregunta.lineas.join(" ")}</p>
        </details>
      )}
      {fase !== "cerrado" && (
        <div role="alertdialog" aria-label={pregunta.titulo} data-sistema={sistema} className="space-y-2 rounded-lg border border-cyan-400/25 bg-cyan-500/[0.06] p-3">
          <p className="flex items-center justify-between font-medium text-white/90">{pregunta.titulo}
            {fase !== "trabajando" && <button type="button" aria-label="Cerrar" onClick={cerrar} className="cursor-pointer text-white/50 hover:text-white/80"><X className="h-3.5 w-3.5" aria-hidden /></button>}
          </p>
          {fase === "pregunta" && <ul className="list-disc space-y-1 pl-4 text-white/75">{pregunta.lineas.map((l) => <li key={l}>{l}</li>)}</ul>}
          {fase === "pregunta" && pregunta.comando && (
            <p className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] text-white/85" data-campo="comando-ollama">{pregunta.comando}</code>
              <button type="button" onClick={() => void copiar()} className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-cyan-200 hover:text-cyan-100">
                <Copy className="h-3 w-3" aria-hidden />{copiado ? "Copiado" : "Copiar comando"}
              </button>
            </p>
          )}
          {fase === "pregunta" && pregunta.botonConfirmar && (
            <div className="flex gap-2">
              <button type="button" onClick={() => void descargar()}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-cyan-500/20 px-2.5 py-1 text-cyan-100 hover:bg-cyan-500/30">
                <Download className="h-3.5 w-3.5" aria-hidden />{pregunta.botonConfirmar}
              </button>
              <button type="button" onClick={cerrar} className="cursor-pointer rounded-md px-2.5 py-1 text-white/55 hover:text-white/80">Ahora no</button>
            </div>
          )}
          {fase === "trabajando" && (
            <div className="space-y-1" role="status">
              <p className="flex items-center gap-1.5 text-white/75"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {progreso?.fase === "descargando" ? `Descargando… ${progreso.porcentaje}%` : "Comprobando la descarga oficial…"}
              </p>
              <button type="button" onClick={() => void e.cancelarOllama()} className="cursor-pointer rounded-md px-2.5 py-1 text-amber-200 hover:text-amber-100">Cancelar descarga</button>
            </div>
          )}
          {fase === "fin" && res && (
            <div className="space-y-1" role="status">
              <p className={res.estado === "abierto" ? "text-emerald-300" : "text-amber-300"} data-campo="resultado-ollama">{res.mensaje}</p>
              <div className="flex flex-wrap gap-2">
                {(res.estado === "abierto" || res.estado === "descargado-sin-abrir") && (
                  <button type="button" onClick={() => void e.comprobarOllama()} className="cursor-pointer rounded-md bg-cyan-500/20 px-2.5 py-1 text-cyan-100 hover:bg-cyan-500/30">Ya lo instalé</button>
                )}
                {(res.estado === "cancelada" || res.estado === "fallo") && (
                  <button type="button" onClick={() => { setRes(null); setFase("pregunta"); }} className="cursor-pointer rounded-md bg-cyan-500/20 px-2.5 py-1 text-cyan-100 hover:bg-cyan-500/30">Volver a intentarlo</button>
                )}
                <button type="button" onClick={cerrar} className="cursor-pointer text-white/55 hover:text-white/80">Cerrar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Seguir con el modelo recomendado cuando Ollama ya está ───────────────────────────────────────────

type VistaContinuar = Pick<EstadoModelos & AccionesModelos, "continuar" | "descartarContinuar" | "instalar">;

export function ContinuarModelo({ e }: { e: VistaContinuar }) {
  const [preguntando, setPreguntando] = useState(false);
  const plan = e.continuar;
  if (!plan) return null;
  return (
    <div role="status" className="space-y-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.07] p-2.5 text-[12px]" data-campo="continuar-modelo">
      <p className="text-emerald-100">Ollama ya está listo. Sigamos con «{plan.modelo.etiqueta}», el modelo que te había recomendado.</p>
      {!preguntando && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setPreguntando(true)} className="cursor-pointer rounded-md bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-500/25">Ver tamaño y descargar</button>
          <button type="button" onClick={e.descartarContinuar} className="cursor-pointer text-[11px] text-white/50 hover:text-white/80">Ahora no</button>
        </div>
      )}
      {preguntando && <PreguntaDescarga plan={plan} onCancelar={() => { setPreguntando(false); e.descartarContinuar(); }} onDescargar={(ok, prog) => e.instalar(plan, ok, prog)} />}
    </div>
  );
}
