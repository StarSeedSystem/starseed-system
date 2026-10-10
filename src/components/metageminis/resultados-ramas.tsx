"use client";

/*
 * ResultadosRamas — qué consigue de verdad cada rama y cada agente de MetaGeminis (2026-10-10).
 * Solo cuentan resultados reales (respuestas, aportaciones, voluntarios, alianzas, donaciones confirmadas); las
 * ramas compiten con respeto y aprenden en equipo comparando estas cifras. Si las tablas aún no existen, se dice.
 */

import { Bot, ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { direccionSegura, fechaCorta, formatearImporte, formatearPorcentaje, resumenPorRama } from "@/lib/metageminis/cola";
import { ETIQUETA_MEDIO_AGENTE, nombreRama, type AgenteMeta, type Borrador, type Hallazgo, type Resultado } from "@/lib/metageminis/tipos";
import { AvisoSinTabla } from "./aviso-sin-tabla";

interface Props {
  borradores: readonly Borrador[];
  resultados: readonly Resultado[];
  agentes: readonly AgenteMeta[];
  sinTablaBorradores: boolean;
  sinTablaResultados: boolean;
  sinTablaAgentes: boolean;
  /** Lo que han encontrado las ramas (opcional: sin esta propiedad no se pinta la sección). */
  hallazgos?: readonly Hallazgo[];
  sinTablaHallazgos?: boolean;
}

const COLOR_ESTADO_AGENTE = { activo: "border-emerald-400/40 text-emerald-200", parado: "border-white/20 text-white/50", error: "border-rose-400/40 text-rose-200" } as const;

function importesTexto(importes: Record<string, number>): string {
  const partes = Object.entries(importes).map(([m, v]) => formatearImporte(v, m));
  return partes.length ? partes.join(" + ") : "—";
}

export function ResultadosRamas({ borradores, resultados, agentes, sinTablaBorradores, sinTablaResultados, sinTablaAgentes, hallazgos, sinTablaHallazgos }: Props) {
  const filas = resumenPorRama(borradores, resultados);
  return (
    <div className="space-y-4" data-testid="resultados-ramas">
      {sinTablaBorradores && <AvisoSinTabla que="Borradores por rama" tabla="metageminis_borradores" />}
      {sinTablaResultados && <AvisoSinTabla que="Resultados reales" tabla="metageminis_resultados" />}
      <p className="text-[11px] text-white/50">
        Cuentan solo resultados reales. «Tasa de respuesta» = respondidos entre enviados; un mensaje que no se ha enviado no suma ni resta.
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <caption className="sr-only">Resultados por rama</caption>
          <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-white/50">
            <tr>
              <th scope="col" className="p-2 font-medium">Rama</th>
              <th scope="col" className="p-2 font-medium">Para aprobar</th>
              <th scope="col" className="p-2 font-medium">Enviados</th>
              <th scope="col" className="p-2 font-medium">Respuesta</th>
              <th scope="col" className="p-2 font-medium">Aportaciones</th>
              <th scope="col" className="p-2 font-medium">Voluntarios</th>
              <th scope="col" className="p-2 font-medium">Alianzas</th>
              <th scope="col" className="p-2 font-medium">Dinero</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.rama} data-testid={`rama-${f.rama}`} className="border-t border-white/10">
                <th scope="row" className="p-2 font-medium text-white">{f.nombre}</th>
                <td className="p-2 text-white/80">{f.paraAprobar}</td>
                <td className="p-2 text-white/80">{f.enviados}</td>
                <td className="p-2 text-white/80">{f.enviados ? formatearPorcentaje(f.tasaRespuesta) : "—"}</td>
                <td className="p-2 text-white/80">{f.aportaciones}</td>
                <td className="p-2 text-white/80">{f.voluntarios}</td>
                <td className="p-2 text-white/80">{f.alianzas}</td>
                <td className="p-2 text-white/80">{importesTexto(f.importes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="mg-agentes" className="space-y-2">
        <h4 id="mg-agentes" className="text-sm font-semibold text-white">
          Agentes <span className="text-white/45">({agentes.length})</span>
        </h4>
        {sinTablaAgentes ? (
          <AvisoSinTabla que="Agentes registrados" tabla="metageminis_agentes" />
        ) : agentes.length === 0 ? (
          <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60">
            Ningún agente se ha registrado todavía. Cada agente se inscribe al arrancar (rama, nombre, dónde corre) y deja su latido.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Agentes de MetaGeminis">
            {agentes.map((a) => (
              <li key={a.id} data-testid="agente" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 p-2.5 text-xs">
                <Bot className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-white">{a.nombre}</span>
                  <span className="block truncate text-[11px] text-white/45">
                    {nombreRama(a.rama_id)} · {ETIQUETA_MEDIO_AGENTE[a.medio]}
                    {a.modelo ? ` · ${a.modelo}` : ""}
                  </span>
                </span>
                <Badge variant="outline" className={cn("text-[10px]", COLOR_ESTADO_AGENTE[a.estado])}>
                  {a.estado}
                </Badge>
                <span className="w-full text-[11px] text-white/40">Último latido: {a.ultimo_latido ? fechaCorta(a.ultimo_latido) : "nunca"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(hallazgos !== undefined || sinTablaHallazgos) && (
        <section aria-labelledby="mg-hallazgos" className="space-y-2">
          <h4 id="mg-hallazgos" className="text-sm font-semibold text-white">
            Hallazgos recientes <span className="text-white/45">({hallazgos?.length ?? 0})</span>
          </h4>
          {sinTablaHallazgos ? (
            <AvisoSinTabla que="Hallazgos de la investigación" tabla="metageminis_hallazgos" />
          ) : !hallazgos || hallazgos.length === 0 ? (
            <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60">
              Las ramas aún no han añadido hallazgos nuevos al directorio. Lo investigado hasta hoy está en la pestaña «Directorio».
            </p>
          ) : (
            <ul className="space-y-1.5" aria-label="Hallazgos recientes">
              {hallazgos.slice(0, 10).map((h) => {
                const url = direccionSegura(h.url);
                return (
                  <li key={h.id} data-testid="hallazgo" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 p-2.5 text-xs">
                    <Search className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-white">{h.titulo}</span>
                    <Badge variant="outline" className="text-[10px] text-white/60">
                      {h.tipo.replace(/_/g, " ")}
                    </Badge>
                    {h.plazo ? (
                      <Badge variant="outline" className="border-amber-400/40 text-[10px] text-amber-200">
                        plazo {h.plazo}
                      </Badge>
                    ) : null}
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-200 underline-offset-2 hover:underline" aria-label={`Abrir ${h.titulo}`}>
                        Abrir <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
