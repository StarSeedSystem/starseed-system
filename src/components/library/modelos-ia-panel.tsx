"use client";

/*
 * Área «Modelos de IA» de la Biblioteca (MOD1110A): tarjetas por modelo con para qué sirve, la comparación
 * (puntuación comparable, equivalencia, tamaño, memoria), cómo encaja en ESTA neurona y en las otras de la
 * cuenta («en tu MaggaBook cabría»), filtros por caso y el mismo flujo de instalación con pregunta previa.
 * Muestra builds normales de los editores; los candidatos y lo no comprobado se ven, pero no se recomiendan.
 * (MOD1110B) Con «Mostrar variantes sin filtros» encendido (apagado por defecto), una sección APARTE con su insignia:
 * variantes de la comunidad, calidad «sin medir», que se eligen a mano y solo para mis conversaciones privadas.
 */

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fechaCorta, listableSinFiltros, pierdeHerramientas } from "@/lib/astraura/modelos/catalogo";
import { casosDe, encajar } from "@/lib/astraura/modelos/recomendar";
import { useModelosNeurona, type AccionesModelos, type EstadoModelos } from "@/lib/astraura/modelos/use-modelos";
import { CASOS, ETIQUETA_CASO, type CasoUso, type ModeloLocal, type Veredicto } from "@/lib/astraura/modelos/tipos";
import { Comparacion, InsigniaVeredicto, PreguntaDescarga, gbTxt } from "@/components/astraura/modelos-ui";
import { ContinuarModelo, InsigniaSinFiltros, InstalarOllama } from "@/components/astraura/modelos-sin-filtros-ui";

type Filtro = CasoUso | "todos";

const orden = (a: ModeloLocal, b: ModeloLocal) => (b.puntuacion?.eci ?? -1) - (a.puntuacion?.eci ?? -1) || b.descargaGb - a.descargaGb || a.id.localeCompare(b.id);
const BUENO_PARA: Record<string, string> = {
  estandar: "Modelo general de un editor, ejecutado con Ollama en tu aparato.",
  "capa-158": "Capa 1.58-bit propia de Astraura: ligera y rápida para el día a día.",
  needle: "Needle: el reflejo instantáneo de Astraura, casi sin coste.",
};

function Tarjeta({ m, e, preguntando, setPreguntando }: { m: ModeloLocal; e: EstadoModelos & AccionesModelos; preguntando: string | null; setPreguntando: (id: string | null) => void }) {
  const p = e.perfil;
  const aqui = p ? encajar(m, p, e.instalados.has(m.id)) : null;
  const plan = p && (m.estado === "comprobado" || listableSinFiltros(m)) && m.tipo === "estandar" ? e.planDe(m) : null;
  const otras = e.pares
    .map((par) => ({ par, enc: encajar(m, par) }))
    .filter((x) => x.enc.veredicto === "recomendado" || x.enc.veredicto === "justo");
  const comprobado = m.estado === "comprobado";
  const sinFiltros = m.clase === "abliterated";
  const pierde = sinFiltros && pierdeHerramientas(m, e.modelos);
  const usada = sinFiltros && Object.values(e.ajustes.porCaso).includes(m.id);
  return (
    <li data-modelo={m.id} className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] text-white/90">{m.etiqueta}</span>
        <span className="text-[11px] text-white/45">{m.familia} · {m.editor}</span>
        {sinFiltros && <InsigniaSinFiltros />}
        {aqui && comprobado && <span className="ml-auto"><InsigniaVeredicto v={aqui.veredicto as Veredicto} liberarGb={aqui.liberarGb} soloEncaje={sinFiltros} /></span>}
        {!comprobado && <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/55">{m.estado === "candidato" ? "Candidato nuevo: sin recomendar" : "Sin comprobar: no se recomienda"}</span>}
      </div>
      <p className="text-[12px] text-white/65">
        {sinFiltros ? "Variante de la comunidad a la que un tercero le quitó los rechazos. Solo para tus conversaciones privadas, elegida por ti." : BUENO_PARA[m.tipo]}{" "}
        Sirve para: {casosDe(m).map((c) => ETIQUETA_CASO[c].toLowerCase()).join(", ") || "—"}.
      </p>
      <Comparacion m={m} frontera={e.catalogo.frontera} modelos={e.modelos} />
      {m.licencia && <p className="text-[10px] text-white/35">Licencia: {m.licencia}</p>}
      {comprobado && otras.length > 0 && (
        <p className="text-[11px] text-cyan-200/80" data-campo="otras">
          {otras.map((x) => `En tu ${x.par.nombre} ${x.enc.veredicto === "recomendado" ? "cabría holgado" : "cabría justo"}`).join(" · ")}
        </p>
      )}
      {comprobado && m.soloApple && <p className="text-[10px] text-white/40">Solo para Apple silicon (MLX).</p>}
      {plan && !e.instalados.has(m.id) && (
        <button type="button" onClick={() => setPreguntando(m.id)} className="cursor-pointer rounded-md bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-500/25">
          Instalar ({gbTxt(plan.descargaGb)})
        </button>
      )}
      {e.instalados.has(m.id) && <span className="text-[11px] text-emerald-300">Instalado</span>}
      {sinFiltros && !pierde && (
        usada
          ? <button type="button" onClick={() => e.dejarVariante(m.id)} className="ml-2 cursor-pointer rounded-md px-2 py-0.5 text-[11px] text-fuchsia-200 hover:bg-fuchsia-500/15">Dejar de usarla</button>
          : <button type="button" disabled={aqui?.veredicto === "no-cabe"} onClick={() => e.usarVariante(m.id)}
              className="ml-2 cursor-pointer rounded-md bg-fuchsia-500/15 px-2 py-0.5 text-[11px] text-fuchsia-100 hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-40">Usar en mis conversaciones privadas</button>
      )}
      {sinFiltros && pierde && !usada && (
        <button type="button" onClick={() => e.usarVariante(m.id)} className="ml-2 cursor-pointer rounded-md bg-fuchsia-500/15 px-2 py-0.5 text-[11px] text-fuchsia-100 hover:bg-fuchsia-500/25">Usar en conversación (sin herramientas)</button>
      )}
      {sinFiltros && usada && pierde && <button type="button" onClick={() => e.dejarVariante(m.id)} className="ml-2 cursor-pointer rounded-md px-2 py-0.5 text-[11px] text-fuchsia-200 hover:bg-fuchsia-500/15">Dejar de usarla</button>}
      {plan && preguntando === m.id && (
        <PreguntaDescarga plan={plan} onCancelar={() => setPreguntando(null)} onDescargar={(ok, prog) => e.instalar(plan, ok, prog)} />
      )}
    </li>
  );
}


export function ModelosIaVista({ e }: { e: EstadoModelos & AccionesModelos }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [preguntando, setPreguntando] = useState<string | null>(null);

  const lista = useMemo(() => {
    const todos = e.modelos.filter((m) => m.clase === "normal" && (filtro === "todos" || casosDe(m).includes(filtro)));
    // Variantes sin filtros: SOLO con el interruptor encendido y comprobadas contra la biblioteca viva (lo retirado desaparece).
    const sinFiltros = e.sinFiltros.activado
      ? e.modelos.filter((m) => listableSinFiltros(m) && (filtro === "todos" || casosDe(m).includes(filtro))).sort(orden)
      : [];
    return {
      listos: todos.filter((m) => m.estado === "comprobado").sort(orden),
      aparte: todos.filter((m) => m.estado !== "comprobado").sort(orden),
      sinFiltros,
    };
  }, [e.modelos, filtro, e.sinFiltros.activado]);

  return (
    <section aria-label="Modelos de IA" className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-white/90">Modelos de IA</h2>
        <p className="text-[12px] text-white/55">
          Modelos locales comparados con la misma vara: puntuación del Epoch Capabilities Index, qué cabe en cada una de tus neuronas y qué ruta seguir cuando no cabe.
          Catálogo comprobado el {fechaCorta(e.catalogo.revisado ?? e.catalogo.actualizado)}.
          <button type="button" onClick={() => void e.revisarAhora()} disabled={e.revisando}
            className="ml-2 inline-flex cursor-pointer items-center gap-1 text-cyan-300/80 hover:text-cyan-200 disabled:opacity-40">
            <RefreshCw className={cn("h-3 w-3", e.revisando && "animate-spin")} aria-hidden /> Revisar ahora
          </button>
        </p>
        {e.estadoRevision && <p className="text-[11px] text-white/40">{e.estadoRevision}</p>}
        {e.aviso && <p role="status" className="text-[12px] text-violet-200">{e.aviso.texto}</p>}
      </header>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por caso">
        {(["todos", ...CASOS] as Filtro[]).map((c) => (
          <button key={c} type="button" aria-pressed={filtro === c} onClick={() => setFiltro(c)}
            className={cn("cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
              filtro === c ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-100" : "border-white/10 text-white/55 hover:text-white/80")}>
            {c === "todos" ? "Todos" : ETIQUETA_CASO[c]}
          </button>
        ))}
      </div>

      {e.perfil && !e.perfil.runtimes.includes("ollama") && <InstalarOllama e={e} />}
      <ContinuarModelo e={e} />

      {e.cargando && <p className="text-[12px] text-white/50" role="status">Midiendo tus neuronas…</p>}
      <ul className="grid gap-3 md:grid-cols-2">{lista.listos.map((m) => <Tarjeta key={m.id} m={m} e={e} preguntando={preguntando} setPreguntando={setPreguntando} />)}</ul>
      {lista.listos.length === 0 && <p className="text-[12px] text-white/50">Ningún modelo comprobado sirve para este caso.</p>}
      {lista.sinFiltros.length > 0 && (
        <section aria-label="Variantes sin filtros" className="space-y-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/[0.04] p-3" data-seccion="sin-filtros">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fuchsia-100"><InsigniaSinFiltros />Variantes sin filtros</h3>
          <p className="text-[12px] text-white/55">
            Opcionales y de la comunidad: calidad sin medir, algunas sin herramientas. Nunca se eligen solas, solo se usan en tus conversaciones privadas en tu neurona y
            jamás con otras personas ni en segundo plano. Lo que hagas con sus respuestas es responsabilidad tuya.
          </p>
          <ul className="grid gap-3 md:grid-cols-2">{lista.sinFiltros.map((m) => <Tarjeta key={m.id} m={m} e={e} preguntando={preguntando} setPreguntando={setPreguntando} />)}</ul>
        </section>
      )}
      {lista.aparte.length > 0 && (
        <details className="text-[12px] text-white/55">
          <summary className="cursor-pointer">Candidatos y sin comprobar ({lista.aparte.length})</summary>
          <ul className="mt-2 grid gap-3 md:grid-cols-2">{lista.aparte.map((m) => <Tarjeta key={m.id} m={m} e={e} preguntando={preguntando} setPreguntando={setPreguntando} />)}</ul>
        </details>
      )}
    </section>
  );
}

export function ModelosIaPanel() {
  const e = useModelosNeurona();
  return <ModelosIaVista e={e} />;
}
