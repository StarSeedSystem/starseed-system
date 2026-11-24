"use client";

// Panel del radar universal de modelos Astraura (AST1123F): comparativa internet vs. local,
// selector de capa pública/privada, alta rápida de repos hf.co/ y pesos de enrutamiento.
// Presentacional: los datos y las acciones llegan ya calculados del contenedor.

import { useId, useState, type ReactNode } from "react";
import { Check, Globe, HardDrive, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { pesosValidos, type Pesos } from "@/lib/astraura/modelos/perfiles-personalizados";
import type { CandidatoRadar, FuenteRadar } from "@/lib/astraura/modelos/radar-internet";
import type { AmbitoCapa } from "@/lib/astraura/modelos/selector-contextual";

const INTERNET: ReadonlySet<FuenteRadar> = new Set(["ollama", "huggingface", "openrouter", "nim"]);
export const esFuenteInternet = (fuente: FuenteRadar): boolean => INTERNET.has(fuente);

export const ETIQUETA_FUENTE: Record<FuenteRadar, string> = {
  local: "Local", preferente: "Preferente", ollama: "Ollama", huggingface: "Hugging Face", openrouter: "OpenRouter", nim: "NVIDIA NIM", "servidor-propio": "Servidor propio", "capa-astraura": "Capa Astraura",
};

const AMBITOS: readonly ("publica" | "privada")[] = ["publica", "privada"];
const ETIQUETA_AMBITO: Record<"publica" | "privada", string> = { publica: "Pública", privada: "Privada" };

export function repoHfValido(texto: string): boolean {
  return /^hf\.co\/[^\s/]+\/[^\s/]+$/.test(texto.trim());
}

const CAMPOS_PESO: readonly { clave: keyof Pesos; etiqueta: string }[] = [
  { clave: "latencia", etiqueta: "Latencia" }, { clave: "calidad", etiqueta: "Calidad" }, { clave: "privacidad", etiqueta: "Privacidad" }, { clave: "ahorro", etiqueta: "Ahorro" },
];

export interface PanelRadarModelosProps {
  candidatos: readonly CandidatoRadar[];
  ambito: AmbitoCapa;
  pesos: Pesos;
  repos: readonly string[];
  onAmbito: (ambito: AmbitoCapa) => void;
  onPesos: (pesos: Pesos) => void;
  onAgregarRepo: (repo: string) => void;
  onQuitarRepo: (repo: string) => void;
  onPreferir: (id: string) => void;
}

export function PanelRadarModelos({ candidatos, ambito, pesos, repos, onAmbito, onPesos, onAgregarRepo, onQuitarRepo, onPreferir }: PanelRadarModelosProps) {
  const [repo, setRepo] = useState("");
  const idRepo = useId();
  const suma = CAMPOS_PESO.reduce((total, { clave }) => total + pesos[clave], 0);
  const valido = pesosValidos(pesos);
  const anadir = () => { if (repoHfValido(repo)) { onAgregarRepo(repo.trim()); setRepo(""); } };
  const internet = candidatos.filter((c) => esFuenteInternet(c.fuente));
  const locales = candidatos.filter((c) => !esFuenteInternet(c.fuente));
  return (
    <section aria-label="Radar de modelos Astraura" className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Radar de modelos</h3>
        <p className="text-[11px] text-white/45">Internet y local, en pie de igualdad.</p>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-[11px] uppercase tracking-wide text-white/45">Capa de conciencia</legend>
        <div className="flex flex-wrap gap-1.5">
          {AMBITOS.map((a) => (
            <button key={a} type="button" aria-pressed={ambito === a} onClick={() => onAmbito(a)}
              className={cn("cursor-pointer rounded-full border px-3 py-1 text-[12px] transition-colors", ambito === a ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100" : "border-white/15 bg-white/[0.03] text-white/60 hover:text-white/85")}>{ETIQUETA_AMBITO[a]}</button>
          ))}
        </div>
        <p className="text-[11px] text-white/45" data-campo="nota-ambito">{ambito === "privada" ? "Solo fuentes locales, la malla o tu servidor: nada sale de tus aparatos." : "Puede usar fuentes de internet; lo que envíes llega a un tercero."}</p>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        <Columna titulo="Internet" vacio="Sin hallazgos de internet." icono={<Globe className="h-3.5 w-3.5 text-cyan-300" aria-hidden />} candidatos={internet} onPreferir={onPreferir} />
        <Columna titulo="Local" vacio="Sin modelos locales." icono={<HardDrive className="h-3.5 w-3.5 text-emerald-300" aria-hidden />} candidatos={locales} onPreferir={onPreferir} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={idRepo} className="block text-[11px] uppercase tracking-wide text-white/45">Añadir repositorio Hugging Face</label>
        <div className="flex gap-2">
          <input id={idRepo} value={repo} onChange={(e) => setRepo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") anadir(); }} placeholder="hf.co/usuario/repositorio-GGUF:Q4_K_M" spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-2.5 py-1.5 font-mono text-[12px] text-white/85 placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50" />
          <button type="button" onClick={anadir} disabled={!repoHfValido(repo)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-1.5 text-[12px] text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3.5 w-3.5" aria-hidden />Añadir</button>
        </div>
        {repo.trim() !== "" && !repoHfValido(repo) && <p role="alert" className="text-[11px] text-amber-300" data-campo="repo-error">Usa el formato hf.co/usuario/repositorio.</p>}
        <ul className="flex flex-wrap gap-1.5">
          {repos.map((r) => (
            <li key={r} data-repo={r} className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] py-0.5 pl-2 pr-1 font-mono text-[11px] text-white/75">{r}
              <button type="button" aria-label={`Quitar ${r}`} onClick={() => onQuitarRepo(r)} className="cursor-pointer rounded-full p-0.5 text-white/45 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"><Trash2 className="h-3 w-3" aria-hidden /></button>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/45"><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />Pesos de enrutamiento</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAMPOS_PESO.map(({ clave, etiqueta }) => (
            <label key={clave} className="space-y-0.5 text-[11px] text-white/65">
              <span className="flex justify-between"><span>{etiqueta}</span><span className="tabular-nums text-white/45">{Math.round(pesos[clave] * 100)} %</span></span>
              <input type="range" min={0} max={1} step={0.05} value={pesos[clave]} aria-label={`Peso de ${etiqueta.toLowerCase()}`} onChange={(e) => onPesos({ ...pesos, [clave]: Number(e.target.value) })} className="w-full cursor-pointer accent-cyan-400" />
            </label>
          ))}
        </div>
        <p role="status" data-campo="suma-pesos" className={cn("text-[11px]", valido ? "text-emerald-300" : "text-amber-300")}>{valido ? `Suma ${Math.round(suma * 100)} %: enrutamiento válido.` : `Suma ${Math.round(suma * 100)} %: baja los pesos hasta 100 %.`}</p>
      </div>
    </section>
  );
}

function Columna({ titulo, icono, candidatos, vacio, onPreferir }: { titulo: string; icono: ReactNode; candidatos: readonly CandidatoRadar[]; vacio: string; onPreferir: (id: string) => void }) {
  return (
    <div data-columna={titulo.toLowerCase()} className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-white/80">{icono}{titulo}<span className="text-white/35"> · {candidatos.length}</span></p>{candidatos.length === 0 ? <p className="text-[11px] text-white/40">{vacio}</p> : (
        <ul className="space-y-1.5">{candidatos.map((c) => (
          <li key={`${c.fuente}:${c.modelo.id}`} data-candidato={c.modelo.id} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5"><span className="font-mono text-[11px] text-white/85">{c.modelo.etiqueta}</span><span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] text-white/55">{ETIQUETA_FUENTE[c.fuente]}</span></div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/45"><span>ECI {c.puntuacion.eci.toFixed(1).replace(".", ",")}</span><span aria-hidden>·</span><span>encaje {Math.round(c.puntuacion.encaje)}</span>
              {c.preferido ? <span data-insignia="preferente" className="inline-flex items-center gap-1 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-200"><Check className="h-2.5 w-2.5" aria-hidden />Preferente</span> : <button type="button" onClick={() => onPreferir(c.modelo.id)} className="cursor-pointer rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] text-white/60 hover:text-white/90">Fijar preferente</button>}</div>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
