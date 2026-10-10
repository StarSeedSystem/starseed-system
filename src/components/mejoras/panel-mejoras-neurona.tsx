"use client";

/**
 * Panel «Mejoras por neurona» para Genesis › Actualizaciones (architecture/mejoras-por-neurona.md §6).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * Presentacional: recibe los informes ya construidos (`construirInforme` de `src/lib/mejoras/informe`)
 * y pinta, por neurona, qué hay nuevo, qué se aplicó (con su medida de calidad), qué se pospuso y por
 * qué, y qué no cabe aquí (y en qué otra neurona tuya sí). No lee la red ni el disco.
 *
 * Estados vacíos honestos: sin sondeo NO se pinta «al día»; se dice que no hay datos y cómo obtenerlos.
 * Montaje: §8 del contrato (sin montar todavía, a propósito).
 */

import type { ReactNode } from "react";
import { Ban, CheckCircle2, Clock, Cpu, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { informeVacio, type FilaInforme, type InformeNeurona } from "@/lib/mejoras/informe";
import { NOMBRE_FAMILIA } from "@/lib/mejoras/tipos";

export const ORDEN_SONDEO = "python3 scripts/puente/mejoras_neurona.py estado";

const BOTON =
  "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/70 transition-colors duration-200 hover:border-white/25 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-50";

const MEDIDA: Record<InformeNeurona["medida"], { texto: string; titulo: string }> = {
  navegador: { texto: "medida del navegador", titulo: "RAM aproximada (el navegador la redondea y la corta en 8 GB) y sin disco: el sondeo de la máquina lo confirma." },
  sondeo: { texto: "sondeo de la máquina", titulo: "RAM, disco, núcleos y GPU medidos en la propia máquina." },
  ambos: { texto: "navegador + sondeo", titulo: "Hardware medido en la máquina y medios vistos desde el navegador." },
};

/** Versión corta: los sha largos se cortan a 7; sin versión, «—». */
export function versionCorta(v: string | null | undefined): string {
  if (!v) return "—";
  return /^[0-9a-f]{12,}$/i.test(v) ? v.slice(0, 7) : v;
}

/** Fecha legible o, si no se entiende, tal cual (nunca inventa otra). */
export function fechaLegible(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

type Tono = "nuevo" | "aplicado" | "pospuesto" | "nocabe";

const TONOS: Record<Tono, { titulo: string; icono: ReactNode; clase: string }> = {
  nuevo: { titulo: "Hay nuevo", icono: <Sparkles className="h-3.5 w-3.5" aria-hidden />, clase: "text-amber-200" },
  aplicado: { titulo: "Se aplicó", icono: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />, clase: "text-emerald-200" },
  pospuesto: { titulo: "Pospuesto", icono: <Clock className="h-3.5 w-3.5" aria-hidden />, clase: "text-sky-200" },
  nocabe: { titulo: "No cabe aquí", icono: <Ban className="h-3.5 w-3.5" aria-hidden />, clase: "text-rose-200" },
};

function Fila({ f, tono }: { f: FilaInforme; tono: Tono }) {
  const cuando = fechaLegible(f.cuando);
  return (
    <li className="space-y-0.5 rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px]" data-testid={`mejora-${tono}-${f.sistemaId}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-white/[0.06] px-1.5 text-[9px] font-semibold text-white/60">{NOMBRE_FAMILIA[f.familia] ?? f.familia}</span>
        <span className="font-medium text-white/90">{f.nombre}</span>
        {f.de || f.a ? (
          <span className="font-mono text-white/60">
            {f.de ? versionCorta(f.de) : "no instalado"} → {versionCorta(f.a)}
          </span>
        ) : null}
        {f.estimado ? (
          <span className="rounded-full bg-white/[0.06] px-1.5 text-[9px] text-white/50" title="Requisitos estimados por StarSeed, no publicados por el proyecto.">
            requisitos estimados
          </span>
        ) : null}
        {f.mejorEn ? <span className="rounded-full bg-emerald-400/10 px-1.5 text-[9px] font-semibold text-emerald-200">cabe en {f.mejorEn}</span> : null}
        {cuando ? <span className="ml-auto text-[10px] text-white/40">{cuando}</span> : null}
      </div>
      <p className="text-white/55">{f.texto}</p>
    </li>
  );
}

function Grupo({ filas, tono }: { filas: readonly FilaInforme[]; tono: Tono }) {
  if (!filas.length) return null;
  const t = TONOS[tono];
  return (
    <div className="space-y-1">
      <h5 className={cn("flex items-center gap-1 text-[11px] font-semibold", t.clase)}>
        {t.icono} {t.titulo} <span className="text-white/40">({filas.length})</span>
      </h5>
      <ul className="space-y-1">
        {filas.map((f) => (
          <Fila key={`${tono}-${f.sistemaId}-${f.cuando ?? ""}`} f={f} tono={tono} />
        ))}
      </ul>
    </div>
  );
}

function TarjetaNeurona({ i, esta }: { i: InformeNeurona; esta: boolean }) {
  const vacio = informeVacio(i);
  const medida = MEDIDA[i.medida] ?? MEDIDA.navegador;
  return (
    <section aria-label={`Mejoras de ${i.nombre}`} className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3" data-testid={`neurona-${i.neuronaId}`}>
      <header className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-white/50" aria-hidden />
          <h4 className="text-[13px] font-semibold text-white/90">{i.nombre}</h4>
          {esta ? <span className="rounded-full bg-sky-400/15 px-1.5 text-[9px] font-semibold text-sky-200">ESTA NEURONA</span> : null}
          <span className="rounded-full bg-white/[0.06] px-1.5 text-[9px] text-white/55" title={medida.titulo}>
            {medida.texto}
          </span>
        </div>
        <p className="text-[11px] text-white/50">{i.aparato}</p>
      </header>
      <Grupo filas={i.nuevas} tono="nuevo" />
      <Grupo filas={i.aplicadas} tono="aplicado" />
      <Grupo filas={i.pospuestas} tono="pospuesto" />
      <Grupo filas={i.noCaben} tono="nocabe" />
      {vacio && i.alDia === 0 && i.sinDato === 0 ? (
        <p className="text-[11px] text-white/50" data-testid="sin-sondeo">
          Esta neurona aún no ha sondeado sus sistemas: no se puede decir si está al día. En la máquina:{" "}
          <code className="rounded bg-white/[0.06] px-1 font-mono text-white/70">{ORDEN_SONDEO}</code>
        </p>
      ) : null}
      {vacio && i.alDia > 0 && i.sinDato === 0 ? <p className="text-[11px] text-emerald-200/80">Todo lo que usa está al día ({i.alDia}).</p> : null}
      {!vacio && i.alDia > 0 ? <p className="text-[10px] text-white/40">{i.alDia} al día.</p> : null}
      {i.sinDato > 0 ? (
        <p className="text-[10px] text-white/45" data-testid="sin-dato">
          {i.sinDato} {i.sinDato === 1 ? "fuente sin dato" : "fuentes sin dato"} de versión (caída, límite o bloqueo de red): se reintenta en el próximo sondeo.
        </p>
      ) : null}
    </section>
  );
}

export interface PropsPanelMejoras {
  informes: readonly InformeNeurona[];
  /** ISO del último sondeo (`estado.json` → `generado`). */
  generado?: string | null;
  cargando?: boolean;
  error?: string | null;
  /** Si se pasa, aparece «Comprobar ahora». */
  onComprobar?: () => void;
  /** La neurona desde la que se mira: va primero y se marca. */
  estaNeuronaId?: string | null;
}

export function PanelMejorasNeurona({ informes, generado, cargando = false, error, onComprobar, estaNeuronaId }: PropsPanelMejoras) {
  const lista = [...informes].sort((a, b) => Number(b.neuronaId === estaNeuronaId) - Number(a.neuronaId === estaNeuronaId));
  const cuando = fechaLegible(generado);
  return (
    <section aria-label="Mejoras por neurona" className="space-y-2" data-testid="panel-mejoras">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-semibold text-white/90">Mejoras por neurona</h3>
        <span className="text-[11px] text-white/45">Voz, sonido, imagen y vídeo, y código: lo que hay nuevo y cabe en cada aparato.</span>
        <span className="ml-auto text-[10px] text-white/40">{cuando ? `Último sondeo: ${cuando}` : "Sin sondeo todavía"}</span>
        {onComprobar ? (
          <button type="button" className={BOTON} onClick={onComprobar} disabled={cargando}>
            {cargando ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />} Comprobar ahora
          </button>
        ) : null}
      </header>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-2.5 py-1.5 text-[11px] text-rose-200">
          No se pudieron leer las mejoras: {error}
        </p>
      ) : null}
      {cargando && !lista.length ? (
        <p className="flex items-center gap-1 text-[11px] text-white/45">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Leyendo las mejoras de tus neuronas…
        </p>
      ) : null}
      {!cargando && !lista.length ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/55" data-testid="mejoras-vacio">
          <p>Ninguna neurona ha sondeado todavía sus voces, oídos, sonido, imagen ni modelos de código. Sin ese sondeo no se sabe si hay mejoras: no se dice «al día».</p>
          <p className="mt-1">
            Para obtenerlo, en la máquina (Mac, Oracle u otra):{" "}
            <code className="rounded bg-white/[0.06] px-1 font-mono text-white/70">{ORDEN_SONDEO}</code>
          </p>
        </div>
      ) : null}
      {lista.map((i) => (
        <TarjetaNeurona key={i.neuronaId} i={i} esta={i.neuronaId === estaNeuronaId} />
      ))}
    </section>
  );
}
