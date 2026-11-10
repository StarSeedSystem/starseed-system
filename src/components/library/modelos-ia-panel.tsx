"use client";

/*
 * Área «Modelos de IA» de la Biblioteca (MOD1110A): tarjetas por modelo con para qué sirve, la comparación
 * (puntuación comparable, equivalencia, tamaño, memoria), cómo encaja en ESTA neurona y en las otras de la
 * cuenta («en tu MaggaBook cabría»), filtros por caso y el mismo flujo de instalación con pregunta previa.
 * Solo muestra builds normales de los editores; los candidatos y lo no comprobado se ven, pero no se recomiendan.
 */

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fechaCorta } from "@/lib/astraura/modelos/catalogo";
import { casosDe, encajar } from "@/lib/astraura/modelos/recomendar";
import { useModelosNeurona, type AccionesModelos, type EstadoModelos } from "@/lib/astraura/modelos/use-modelos";
import { CASOS, ETIQUETA_CASO, type CasoUso, type ModeloLocal, type Veredicto } from "@/lib/astraura/modelos/tipos";
import { Comparacion, InsigniaVeredicto, PreguntaDescarga, gbTxt } from "@/components/astraura/modelos-ui";

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
  const plan = p && m.estado === "comprobado" && m.tipo === "estandar" ? e.planDe(m) : null;
  const otras = e.pares
    .map((par) => ({ par, enc: encajar(m, par) }))
    .filter((x) => x.enc.veredicto === "recomendado" || x.enc.veredicto === "justo");
  const comprobado = m.estado === "comprobado";
  return (
    <li data-modelo={m.id} className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] text-white/90">{m.etiqueta}</span>
        <span className="text-[11px] text-white/45">{m.familia} · {m.editor}</span>
        {aqui && comprobado && <span className="ml-auto"><InsigniaVeredicto v={aqui.veredicto as Veredicto} liberarGb={aqui.liberarGb} /></span>}
        {!comprobado && <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/55">{m.estado === "candidato" ? "Candidato nuevo: sin recomendar" : "Sin comprobar: no se recomienda"}</span>}
      </div>
      <p className="text-[12px] text-white/65">{BUENO_PARA[m.tipo]} Sirve para: {casosDe(m).map((c) => ETIQUETA_CASO[c].toLowerCase()).join(", ") || "—"}.</p>
      <Comparacion m={m} frontera={e.catalogo.frontera} />
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
    const todos = e.modelos.filter((m) => filtro === "todos" || casosDe(m).includes(filtro));
    return {
      listos: todos.filter((m) => m.estado === "comprobado").sort(orden),
      aparte: todos.filter((m) => m.estado !== "comprobado").sort(orden),
    };
  }, [e.modelos, filtro]);

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

      {e.cargando && <p className="text-[12px] text-white/50" role="status">Midiendo tus neuronas…</p>}
      <ul className="grid gap-3 md:grid-cols-2">{lista.listos.map((m) => <Tarjeta key={m.id} m={m} e={e} preguntando={preguntando} setPreguntando={setPreguntando} />)}</ul>
      {lista.listos.length === 0 && <p className="text-[12px] text-white/50">Ningún modelo comprobado sirve para este caso.</p>}
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
