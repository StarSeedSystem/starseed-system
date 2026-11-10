"use client";

// Piezas compartidas de «Modelos de IA» (MOD1110A): la usan el bloque de ajustes de Astraura y el área
// «Modelos de IA» de la Biblioteca. Presentacionales: reciben todo ya calculado.

import { useState } from "react";
import { Download, HardDrive, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { equivalencia, fechaCorta, pierdeHerramientas, puntuacionDeBase, requisitosDe } from "@/lib/astraura/modelos/catalogo";
import type { PlanInstalacion, ResultadoInstalacion } from "@/lib/astraura/modelos/instalar";
import type { Recomendacion } from "@/lib/astraura/modelos/recomendar";
import { ETIQUETA_VEREDICTO, type ModeloLocal, type PuntoFrontera, type Veredicto } from "@/lib/astraura/modelos/tipos";

const ESTILO: Record<Veredicto, string> = {
  recomendado: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  justo: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "no-cabe": "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "falta-disco": "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

export const gbTxt = (n: number) => `${n.toFixed(1).replace(".", ",")} GB`;

/** Etiqueta del veredicto; «Falta disco» lleva los GB a liberar. */
export function textoVeredicto(v: Veredicto, liberarGb: number | null): string {
  return v === "falta-disco" && liberarGb !== null ? `Falta disco: libera ${gbTxt(liberarGb)}` : ETIQUETA_VEREDICTO[v];
}

export function InsigniaVeredicto({ v, liberarGb = null, soloEncaje = false }: { v: Veredicto; liberarGb?: number | null; soloEncaje?: boolean }) {
  return (
    <span data-veredicto={v} className={cn("rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap", ESTILO[v])}>
      {/* MOD1110B: en una variante sin filtros «Recomendado» se leería como aval; solo dice si cabe. */}
      {soloEncaje && v === "recomendado" ? "Cabe holgado" : textoVeredicto(v, liberarGb)}
    </span>
  );
}

/** Puntuación, equivalencia con la frontera, descarga y memoria, en una línea legible. */
export function Comparacion({ m, frontera, modelos }: { m: ModeloLocal; frontera: readonly PuntoFrontera[]; modelos?: readonly ModeloLocal[] }) {
  const rq = requisitosDe(m);
  if (m.clase === "abliterated") return <ComparacionSinFiltros m={m} modelos={modelos ?? []} rq={rq} />;
  const eq = equivalencia(m, frontera);
  return (
    <div className="space-y-0.5 text-[11px] text-white/55">
      <p data-campo="equivalencia">
        {m.puntuacion ? <>ECI <strong className="text-white/80">{m.puntuacion.eci.toFixed(1).replace(".", ",")}</strong> · </> : null}
        {eq.texto}
      </p>
      <p data-campo="requisitos">
        Descarga {gbTxt(m.descargaGb)} · memoria {rq.memoriaMinGb}–{rq.memoriaComodaGb} GB · disco {gbTxt(rq.discoGb)}
        {m.contextoK ? ` · contexto ${m.contextoK}K` : ""}
        {m.herramientas ? " · herramientas" : ""}
        {m.vision ? " · visión" : ""}
      </p>
      <p className="text-white/35" data-campo="fecha">
        {m.comprobado ? `Comprobado el ${fechaCorta(m.comprobado)}` : "Sin comprobar"}
        {m.puntuacion ? ` · puntuación del ${fechaCorta(m.puntuacion.comprobado)}` : ""}
      </p>
    </div>
  );
}

/** Variante sin filtros: calidad «sin medir»; la puntuación de la base va aparte y rotulada como de la base. */
function ComparacionSinFiltros({ m, modelos, rq }: { m: ModeloLocal; modelos: readonly ModeloLocal[]; rq: ReturnType<typeof requisitosDe> }) {
  const base = puntuacionDeBase(m, modelos);
  const pierde = pierdeHerramientas(m, modelos);
  return (
    <div className="space-y-0.5 text-[11px] text-white/55">
      <p data-campo="equivalencia">
        Calidad: <strong className="text-fuchsia-200">sin medir</strong> (nadie evaluó esta variante).{" "}
        {base
          ? <span data-campo="puntuacion-base">Su modelo base «{m.baseId}» puntúa ECI {base.eci.toFixed(1).replace(".", ",")}: es la puntuación de la base, no de esta variante.</span>
          : <span data-campo="puntuacion-base">Su modelo base «{m.baseId}» tampoco tiene puntuación comparable.</span>}
      </p>
      <p data-campo="requisitos">
        Descarga {gbTxt(m.descargaGb)} · memoria {rq.memoriaMinGb}–{rq.memoriaComodaGb} GB · disco {gbTxt(rq.discoGb)}
        {m.contextoK ? ` · contexto ${m.contextoK}K` : ""}
        {m.herramientas ? " · herramientas" : " · sin herramientas"}
        {m.vision ? " · visión" : ""}
      </p>
      {pierde && (
        <p className="text-amber-300" data-campo="pierde-herramientas">
          Pierde el uso de herramientas respecto a su base: no se ofrece para código y agentes ni para bots.
        </p>
      )}
      <p className="text-white/35" data-campo="fecha">
        {m.comprobado ? `Comprobado el ${fechaCorta(m.comprobado)} en Ollama` : "Sin comprobar"}
        {m.publicador ? ` · publica ${m.publicador}` : ""}
      </p>
    </div>
  );
}

/** Pregunta previa a la descarga (muestra el tamaño) y estado de la descarga. NO descarga nada sin el botón. */
export function PreguntaDescarga({
  plan, onDescargar, onCancelar,
}: {
  plan: PlanInstalacion;
  onDescargar: (confirmado: boolean, onProgreso: (pct: number, estado: string) => void) => Promise<ResultadoInstalacion>;
  onCancelar: () => void;
}) {
  const [pct, setPct] = useState<number | null>(null);
  const [res, setRes] = useState<ResultadoInstalacion | null>(null);
  const trabajando = pct !== null && res === null;
  return (
    <div role="alertdialog" aria-label={`Descargar ${plan.modelo.etiqueta}`} className="space-y-2 rounded-lg border border-cyan-400/25 bg-cyan-500/[0.06] p-3 text-[12px]">
      <p className="flex items-start gap-1.5 text-white/85"><HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />{plan.pregunta}</p>
      {plan.bloqueo && <p className="text-amber-300" data-campo="bloqueo">{plan.bloqueo}</p>}
      {plan.comando && <p className="font-mono text-[11px] text-white/45" data-campo="comando">{plan.comando}</p>}
      {trabajando && <p className="flex items-center gap-1.5 text-white/70"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Descargando… {pct}%</p>}
      {res && <p className={res.ok ? "text-emerald-300" : "text-amber-300"} role="status">{res.mensaje}</p>}
      {!res && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!!plan.bloqueo || trabajando}
            onClick={async () => { setPct(0); setRes(await onDescargar(true, (p) => setPct(p))); }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-cyan-500/20 px-2.5 py-1 text-cyan-100 transition-colors hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Descargar ({gbTxt(plan.descargaGb)})
          </button>
          <button type="button" disabled={trabajando} onClick={onCancelar} className="cursor-pointer rounded-md px-2.5 py-1 text-white/55 hover:text-white/80 disabled:opacity-40">
            Ahora no
          </button>
        </div>
      )}
      {res && <button type="button" onClick={onCancelar} className="cursor-pointer text-white/55 hover:text-white/80">Cerrar</button>}
    </div>
  );
}

/** Texto de ruta cuando el modelo no corre aquí. */
export function textoRuta(r: Recomendacion): string | null {
  switch (r.ruta.tipo) {
    case "local": return null;
    case "neurona-malla": return `Por la malla: ${r.ruta.nombre}`;
    case "servidor-propio": return `Tu servidor: ${r.ruta.nombre}`;
    case "externo": return `Proveedor externo: ${r.ruta.proveedor}`;
    case "ninguna": return "Sin ruta disponible";
  }
}

export function InsigniaPrivado() {
  return <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300/80"><ShieldCheck className="h-3 w-3" aria-hidden />nada sale de tus aparatos</span>;
}
