"use client";

// Panel estético del Radar Universal de Modelos (AST1123F): comparativa local/internet, capa, repos hf.co y pesos.

import { useState } from "react";
import { Globe, HardDrive, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CandidatoRadar, FuenteRadar } from "@/lib/astraura/modelos/radar-internet";
import type { PerfilNeurona } from "@/lib/astraura/modelos/tipos";
import type { AmbitoCapa, Entidad, SenalesRed } from "@/lib/astraura/modelos/selector-contextual";
import { seleccionarModeloContextual } from "@/lib/astraura/modelos/selector-contextual";
import type { Pesos } from "@/lib/astraura/modelos/perfiles-personalizados";

export type GrupoFuente = "local" | "internet";
const FUENTES_INTERNET: ReadonlySet<FuenteRadar> = new Set(["ollama", "huggingface", "openrouter", "nim", "servidor-propio"]);
export const grupoDeFuente = (fuente: FuenteRadar): GrupoFuente => (FUENTES_INTERNET.has(fuente) ? "internet" : "local");
export const sumaPesos = (p: Pesos): number => Math.round((p.latencia + p.calidad + p.privacidad + p.ahorro) * 100) / 100;
export const normalizarPeso = (valor: number): number => (Number.isFinite(valor) ? Math.round(Math.min(1, Math.max(0, valor)) * 100) / 100 : 0);
export function validarRepoHf(texto: string): { ok: boolean; repo: string | null; error: string | null } {
  const limpio = texto.trim().replace(/^https?:\/\//i, "").replace(/^huggingface\.co\//i, "hf.co/");
  if (limpio === "") return { ok: false, repo: null, error: "Escribe un repositorio, por ejemplo hf.co/usuario/modelo-GGUF." };
  if (!/^hf\.co\/[^/\s]+\/[^/\s]+$/i.test(limpio)) return { ok: false, repo: null, error: "El repositorio debe tener la forma hf.co/usuario/modelo." };
  return { ok: true, repo: limpio, error: null };
}

const AMBITOS: readonly { id: AmbitoCapa; etiqueta: string; ayuda: string }[] = [
  { id: "publica", etiqueta: "Pública", ayuda: "Abierta a internet: puede usar proveedores externos y compartir el modelo con la red." },
  { id: "privada", etiqueta: "Privada", ayuda: "Solo esta neurona o la malla propia: nada sale de tus aparatos." },
  { id: "compartida", etiqueta: "Compartida", ayuda: "Agentes y bots de la comunidad: nada sin filtros y con herramientas a mano." },
];
const ETIQUETA_ENTIDAD: Record<Entidad, string> = { agente: "el agente", bot: "el bot", usuario: "la persona" };
const PESOS: readonly { clave: keyof Pesos; etiqueta: string }[] = [{ clave: "latencia", etiqueta: "Latencia" }, { clave: "calidad", etiqueta: "Calidad" }, { clave: "privacidad", etiqueta: "Privacidad" }, { clave: "ahorro", etiqueta: "Ahorro" }];

export interface PropsPanelRadarModelos {
  candidatos: readonly CandidatoRadar[]; perfil: PerfilNeurona; senales: SenalesRed; entidad: Entidad;
  ambito: AmbitoCapa; pesos: Pesos; repos: readonly string[];
  onAmbito: (ambito: AmbitoCapa) => void; onPesos: (pesos: Pesos) => void;
  onAnadirRepo: (repo: string) => void; onQuitarRepo?: (repo: string) => void;
}

export function PanelRadarModelos({ candidatos, perfil, senales, entidad, ambito, pesos, repos, onAmbito, onPesos, onAnadirRepo, onQuitarRepo }: PropsPanelRadarModelos) {
  const [repoTexto, setRepoTexto] = useState(""); const [errorRepo, setErrorRepo] = useState<string | null>(null);
  const seleccion = seleccionarModeloContextual({ entidad, ambito, senales, perfilNeurona: perfil, candidatos }); const suma = sumaPesos(pesos);
  const grupos = [
    { grupo: "local" as const, titulo: "En esta neurona", icono: <HardDrive className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> },
    { grupo: "internet" as const, titulo: "Desde internet", icono: <Globe className="h-3.5 w-3.5 text-sky-300" aria-hidden /> },
  ];
  const anadirRepo = () => { const r = validarRepoHf(repoTexto); if (!r.ok || !r.repo) { setErrorRepo(r.error); return; } onAnadirRepo(r.repo); setRepoTexto(""); setErrorRepo(null); };
  return (
    <section className="space-y-5 rounded-2xl border border-cyan-400/20 bg-[#0A0F1D]/85 p-5 text-white" aria-labelledby="radar-modelos-titulo" data-panel="radar-modelos">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="radar-modelos-titulo" className="flex items-center gap-2 text-base font-semibold text-cyan-100"><Sparkles className="h-4 w-4 text-cyan-300" aria-hidden /> Radar de modelos</h2>
          <p className="text-[12px] text-white/55">Compara lo instalado en esta neurona con lo descubierto en internet y deja que el selector elija por contexto.</p>
        </div>
        <div className="rounded-lg border border-cyan-400/25 bg-cyan-500/[0.07] px-3 py-2 text-[12px]" data-campo="seleccion">
          {seleccion.modelo ? (<><p className="text-white/50">Recomendado para {ETIQUETA_ENTIDAD[entidad]} · capa {ambito}</p><p className="font-medium text-cyan-100">{seleccion.modelo.etiqueta}</p><p className="text-white/45">{seleccion.razon}</p></>) : <p className="text-amber-200">{seleccion.razon}</p>}
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {grupos.map(({ grupo, titulo, icono }) => {
          const lista = candidatos.filter((c) => grupoDeFuente(c.fuente) === grupo);
          const mejor = [...lista].sort((a, b) => b.puntuacion.total - a.puntuacion.total)[0] ?? null;
          return (
            <div key={grupo} data-grupo={grupo} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="flex items-center gap-1.5 text-[12px] text-white/70">{icono}{titulo}</p>
              <p className="text-[11px] text-white/40">{lista.length} {lista.length === 1 ? "candidato" : "candidatos"}</p>
              {mejor ? (<div className="mt-2 space-y-0.5"><p className="flex items-center gap-1.5 text-[12px] text-white/85">{mejor.modelo.etiqueta}
                {mejor.preferido && <span className="rounded-full border border-cyan-400/35 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-200">Preferente</span>}</p>
                <p className="text-[11px] text-white/45">Puntuación {mejor.puntuacion.total} · {mejor.fuente}</p></div>) : <p className="mt-2 text-[11px] text-white/40">Sin candidatos en este grupo.</p>}
            </div>
          );
        })}
      </div>
      <fieldset className="space-y-2" data-campo="ambito">
        <legend className="text-[12px] text-white/70">Capa de conciencia</legend>
        <div className="flex flex-wrap gap-2">
          {AMBITOS.map((a) => (<button key={a.id} type="button" onClick={() => onAmbito(a.id)} aria-pressed={ambito === a.id}
            className={cn("cursor-pointer rounded-full border px-3 py-1 text-[12px] transition-colors", ambito === a.id ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100" : "border-white/15 text-white/60 hover:text-white/85")}>{a.etiqueta}</button>))}
        </div>
        <p className="text-[11px] text-white/45">{AMBITOS.find((a) => a.id === ambito)?.ayuda}</p>
      </fieldset>
      <form className="space-y-2" data-campo="repos" onSubmit={(ev) => { ev.preventDefault(); anadirRepo(); }}>
        <label htmlFor="repo-hf" className="text-[12px] text-white/70">Repos de Hugging Face</label>
        <div className="flex flex-wrap gap-2">
          <input id="repo-hf" value={repoTexto} onChange={(ev) => { setRepoTexto(ev.target.value); setErrorRepo(null); }} placeholder="hf.co/usuario/modelo-GGUF"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60" />
          <button type="submit" className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-[12px] text-cyan-100 transition-colors hover:bg-cyan-500/30"><Plus className="h-3.5 w-3.5" aria-hidden /> Añadir repo</button>
        </div>
        {errorRepo && <p className="text-[11px] text-amber-300" role="alert">{errorRepo}</p>}
        {repos.length > 0 && (<ul className="flex flex-wrap gap-2">
          {repos.map((repo) => (<li key={repo} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-white/70">
            <span className="font-mono">{repo}</span>
            {onQuitarRepo && <button type="button" aria-label={`Quitar ${repo}`} onClick={() => onQuitarRepo(repo)} className="cursor-pointer text-white/45 transition-colors hover:text-rose-300"><Trash2 className="h-3 w-3" aria-hidden /></button>}
          </li>))}
        </ul>)}
      </form>
      <fieldset className="space-y-2" data-campo="pesos">
        <legend className="flex w-full items-center justify-between text-[12px] text-white/70"><span>Pesos de enrutamiento</span>
          <span className={cn("font-mono", suma > 1 ? "text-amber-300" : "text-emerald-300")}>suma {suma.toFixed(2).replace(".", ",")}</span></legend>
        {PESOS.map(({ clave, etiqueta }) => (<label key={clave} className="flex items-center gap-3 text-[11px] text-white/60">
          <span className="w-20 shrink-0">{etiqueta}</span>
          <input type="range" min={0} max={1} step={0.05} value={pesos[clave]} aria-label={etiqueta} onChange={(ev) => onPesos({ ...pesos, [clave]: normalizarPeso(Number(ev.target.value)) })} className="h-1 flex-1 cursor-pointer accent-cyan-400" />
          <span className="w-9 text-right font-mono text-white/75">{pesos[clave].toFixed(2).replace(".", ",")}</span></label>))}
        <p className={cn("text-[11px]", suma > 1 ? "text-amber-300" : "text-white/45")}>{suma > 1 ? "La suma no puede pasar de 1: baja algún peso para guardar." : "El selector reparte la puntuación según estos pesos; el resto va al encaje de hardware."}</p>
      </fieldset>
    </section>
  );
}
