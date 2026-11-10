"use client";

/*
 * «Modelo local recomendado para esta neurona» (MOD1110A) — bloque de los ajustes de Astraura.
 * Por cada caso de uso (conversación, código y agentes, archivos privados, voz, visión, bots y dots, capas de
 * conciencia, segundo plano) muestra el modelo recomendado para ESTA neurona, por qué, la comparación (puntuación,
 * equivalencia, tamaño, memoria) y la ruta cuando local no es lo adecuado. «Automático» es el modo por defecto.
 * La descarga SIEMPRE pregunta antes, con el tamaño. Contrato: architecture/modelos-recomendados.md.
 */

import { useState } from "react";
import { Cpu, RefreshCw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fechaCorta } from "@/lib/astraura/modelos/catalogo";
import { candidatosPara, encajar } from "@/lib/astraura/modelos/recomendar";
import { useModelosNeurona, type AccionesModelos, type EstadoModelos } from "@/lib/astraura/modelos/use-modelos";
import { CASOS, ETIQUETA_CASO, type CasoUso, type ModeloLocal } from "@/lib/astraura/modelos/tipos";
import { Comparacion, InsigniaPrivado, InsigniaVeredicto, PreguntaDescarga, textoRuta } from "./modelos-ui";
import { ContinuarModelo, InsigniaSinFiltros, InstalarOllama, InterruptorSinFiltros } from "./modelos-sin-filtros-ui";

const NOMBRE_CHIP = { "apple-silicon": "Apple silicon", nvidia: "GPU NVIDIA", amd: "GPU AMD", cpu: "Solo CPU", "android-soc": "Android" } as const;

export function ModelosRecomendadosVista({ e }: { e: EstadoModelos & AccionesModelos }) {
  const [abierto, setAbierto] = useState<CasoUso | null>(null);
  const [preguntando, setPreguntando] = useState<string | null>(null);
  const p = e.perfil;

  if (e.cargando && !e.recomendaciones) {
    return <p className="text-[12px] text-white/50" role="status">Midiendo esta neurona…</p>;
  }
  if (!p || !e.recomendaciones) {
    return <p className="text-[12px] text-white/50">No pude medir esta neurona; se usa el modelo de siempre.</p>;
  }
  const rec = e.recomendaciones;
  const manual = e.ajustes.modo === "manual";
  const abriria = Math.max(0, ...CASOS.map((c) => rec[c].abriria));

  return (
    <section aria-label="Modelo local recomendado para esta neurona" className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Cpu className="h-4 w-4 text-cyan-300" aria-hidden />
        <h3 className="text-[13px] font-semibold text-white/90">Modelo local recomendado para esta neurona</h3>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-white/10 text-[11px]" role="group" aria-label="Modo">
          {(["automatico", "manual"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={e.ajustes.modo === m} onClick={() => e.setModo(m)}
              className={cn("cursor-pointer px-2.5 py-1 transition-colors", e.ajustes.modo === m ? "bg-cyan-500/25 text-cyan-100" : "text-white/55 hover:text-white/80")}>
              {m === "automatico" ? "Automático" : "Manual"}
            </button>
          ))}
        </div>
      </header>

      <p className="text-[11px] text-white/50" data-campo="perfil">
        {NOMBRE_CHIP[p.chip]} · memoria {p.ramGb === null ? "sin medir" : `${p.ramGb} GB`}{!p.ramFiable && p.ramGb !== null ? " (estimada por el navegador)" : ""}
        {p.vramGb !== null ? ` · VRAM ${p.vramGb} GB` : ""}
        {p.discoLibreGb !== null ? ` · disco libre ${p.discoLibreGb} GB` : " · disco libre sin medir"}
        {p.enchufada === false ? " · con batería" : ""}
        {p.runtimes.includes("ollama") ? " · Ollama" : " · sin Ollama"}
      </p>
      {!p.ramFiable && (
        <label className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
          Memoria real de esta neurona (GB)
          <input type="number" min={1} max={4096} defaultValue={e.ajustes.ramDeclaradaGb ?? ""} aria-label="Memoria real en GB"
            onBlur={(ev) => { const v = Number(ev.currentTarget.value); e.setRamDeclarada(Number.isFinite(v) && v >= 1 ? v : null); }}
            className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-white/85" />
        </label>
      )}

      {!p.runtimes.includes("ollama") && <InstalarOllama e={e} abriria={abriria} />}
      <ContinuarModelo e={e} />

      {e.aviso && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-violet-400/25 bg-violet-500/[0.08] px-2.5 py-1.5 text-[12px] text-violet-100">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1">{e.aviso.texto}</span>
          <button type="button" aria-label="Descartar aviso" onClick={e.descartarAviso} className="cursor-pointer text-violet-200/70 hover:text-violet-100"><X className="h-3.5 w-3.5" aria-hidden /></button>
        </div>
      )}

      <ul className="space-y-2">
        {CASOS.map((caso) => {
          const r = rec[caso];
          // El uso real pasa por `aplicarEleccionManual`: una variante sin filtros solo llega aquí si todos sus límites se cumplen.
          const uso = e.usos?.[caso];
          const sinFiltros = uso?.sinFiltros === true;
          const elegido: ModeloLocal | null = uso ? uso.modelo : manual && e.ajustes.porCaso[caso]
            ? e.modelos.find((m) => m.id === e.ajustes.porCaso[caso] && m.clase === "normal") ?? r.modelo
            : r.modelo;
          const mostrado = !sinFiltros && r.ruta.tipo === "neurona-malla" ? r.modeloRuta : elegido;
          const ruta = sinFiltros ? null : textoRuta(r);
          const encaje = sinFiltros && elegido ? encajar(elegido, p, e.instalados.has(elegido.id)) : null;
          const plan = elegido && (sinFiltros || r.ruta.tipo === "local") && (encaje ? encaje.veredicto !== "no-cabe" : r.veredicto !== "no-cabe") ? e.planDe(elegido) : null;
          const instalado = !!elegido && e.instalados.has(elegido.id);
          return (
            <li key={caso} data-caso={caso} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-white/90">{ETIQUETA_CASO[caso]}</span>
                <InsigniaVeredicto v={encaje ? encaje.veredicto : r.veredicto} liberarGb={encaje ? encaje.liberarGb : r.liberarGb} />
                {sinFiltros && <InsigniaSinFiltros />}
                {caso === "archivos-privados" && <InsigniaPrivado />}
                {elegido && <span className="ml-auto text-[11px] font-mono text-white/70" data-campo="modelo">{elegido.etiqueta}</span>}
              </div>
              <p className="mt-1 text-[12px] text-white/65" data-campo="razon">
                {sinFiltros && elegido ? `«${elegido.etiqueta}» es la variante sin filtros que elegiste a mano para tus conversaciones privadas: su calidad está sin medir.` : r.razon}
              </p>
              {uso?.aviso && <p className="mt-0.5 text-[11px] text-amber-300" data-campo="aviso-variante">{uso.aviso}</p>}
              {ruta && <p className="mt-0.5 text-[11px] text-cyan-200/80" data-campo="ruta">{ruta}{r.modeloRuta ? ` · «${r.modeloRuta.etiqueta}»` : ""}</p>}
              {mostrado && <div className="mt-1"><Comparacion m={mostrado} frontera={e.catalogo.frontera} modelos={e.modelos} /></div>}
              {r.reflejo && caso !== "capas-conciencia" && caso !== "segundo-plano" && (
                <p className="mt-0.5 text-[11px] text-white/40">Reflejos y segundo plano: {r.reflejo.etiqueta} ({(r.reflejo.descargaGb * 1024).toFixed(0)} MB).</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {plan && !instalado && elegido?.tipo === "estandar" && (
                  <button type="button" onClick={() => setPreguntando(elegido.id + caso)}
                    className="cursor-pointer rounded-md bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-500/25">
                    Instalar ({plan.descargaGb.toFixed(1).replace(".", ",")} GB)
                  </button>
                )}
                {instalado && <span className="text-[11px] text-emerald-300">Instalado</span>}
                {elegido && r.ruta.tipo === "local" && elegido.tipo !== "estandar" && <span className="text-[11px] text-white/40">Capa de Astraura: se instala desde el instalador de capas.</span>}
                {manual && (
                  <button type="button" onClick={() => setAbierto(abierto === caso ? null : caso)} className="cursor-pointer text-[11px] text-white/50 hover:text-white/80">
                    {abierto === caso ? "Cerrar lista" : "Elegir otro"}
                  </button>
                )}
              </div>
              {preguntando === (elegido?.id ?? "") + caso && plan && (
                <div className="mt-2">
                  <PreguntaDescarga plan={plan} onCancelar={() => setPreguntando(null)} onDescargar={(ok, prog) => e.instalar(plan, ok, prog)} />
                </div>
              )}
              {manual && abierto === caso && (
                <ul className="mt-2 space-y-1" aria-label={`Opciones para ${ETIQUETA_CASO[caso]}`}>
                  {candidatosPara(e.modelos, p, caso, e.instalados).slice(0, 8).map((c) => (
                    <li key={c.m.id}>
                      <button type="button" onClick={() => { e.elegirManual(caso, c.m.id); setAbierto(null); }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] text-white/70 hover:bg-white/5">
                        <span className="font-mono">{c.m.etiqueta}</span><InsigniaVeredicto v={c.e.veredicto} liberarGb={c.e.liberarGb} />
                      </button>
                    </li>
                  ))}
                  <li><button type="button" onClick={() => { e.elegirManual(caso, null); setAbierto(null); }} className="cursor-pointer px-2 py-1 text-[11px] text-white/45 hover:text-white/75">Volver a lo recomendado</button></li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <fieldset className="space-y-1 text-[11px] text-white/60">
        <legend className="text-white/70">Privacidad</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={e.ajustes.privacidad.externoPermitido} onChange={(ev) => e.setPrivacidad({ externoPermitido: ev.currentTarget.checked })} />
          Permitir un proveedor externo cuando esta neurona no pueda
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={e.ajustes.privacidad.externoParaPrivados} disabled={!e.ajustes.privacidad.externoPermitido}
            onChange={(ev) => e.setPrivacidad({ externoParaPrivados: ev.currentTarget.checked })} />
          También para mis archivos privados (no recomendado)
        </label>
      </fieldset>

      <InterruptorSinFiltros e={e} />

      <footer className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
        <span data-campo="catalogo">Catálogo comprobado el {fechaCorta(e.catalogo.revisado ?? e.catalogo.actualizado)}</span>
        <button type="button" onClick={() => void e.revisarAhora()} disabled={e.revisando}
          className="inline-flex cursor-pointer items-center gap-1 text-cyan-300/80 hover:text-cyan-200 disabled:opacity-40">
          <RefreshCw className={cn("h-3 w-3", e.revisando && "animate-spin")} aria-hidden /> Revisar ahora
        </button>
        {e.estadoRevision && <span data-campo="revision">{e.estadoRevision}</span>}
      </footer>
    </section>
  );
}

export function ModelosRecomendados() {
  const e = useModelosNeurona();
  return <ModelosRecomendadosVista e={e} />;
}
