"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, Moon } from "lucide-react";
import {
  leerEstados, filas, avisosPendientes, ultimoCicloNocturno,
  type EntradaEstados, type SistemaActualizacion,
} from "@/lib/mando/astraura-actualizaciones";

const COMANDOS: Record<SistemaActualizacion, string> = {
  "Needle 3": "bash scripts/renovar-needle.sh",
  "BitNet 1.58": "bash scripts/renovar-bitnet.sh",
  "Adaptador colectivo": "bash scripts/ciclo-aprendizaje-needle.sh",
  "Repo Astraura": "bash update_astraura.sh",
};

export interface PanelAstrauraActualizacionesProps { estados?: EntradaEstados; }

export function PanelAstrauraActualizaciones({ estados = {} }: PanelAstrauraActualizacionesProps) {
  const [copiado, setCopiado] = useState<string | null>(null);

  const saneados = leerEstados(estados);
  const avisos = avisosPendientes(saneados);
  const nocturno = ultimoCicloNocturno(saneados.logAprendizaje);
  const filasData = filas(saneados);

  const copiar = (cmd: string) => {
    void navigator.clipboard.writeText(cmd);
    setCopiado(cmd);
    setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <section data-testid="panel-astraura-actualizaciones" className="space-y-4">
      {avisos.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" aria-hidden />
            <span>Avisos de actualización pendientes</span>
          </div>
          {avisos.map((av, i) => (
            <p key={i} className="text-[11px] text-amber-100/80 ml-6">• {av}</p>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-trinity-azure shrink-0" aria-hidden />
            <h4 className="text-xs font-semibold text-white">Último ciclo nocturno</h4>
          </div>
          <span className="text-[11px] font-mono text-white/50">{nocturno.t || "Sin registro"}</span>
        </div>
        <p className="mt-1 text-xs text-white/70">{nocturno.detalle || "Sin registros del ciclo"}</p>
        {nocturno.resultado && (
          <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium border ${
            nocturno.resultado === "publicado" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" :
            nocturno.resultado === "máquina ahogada" ? "border-red-400/30 bg-red-500/10 text-red-300" :
            "border-amber-400/30 bg-amber-500/10 text-amber-300"
          }`}>
            {nocturno.resultado}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur overflow-x-auto">
        <h4 className="text-xs font-semibold text-white mb-3">Actualizaciones y mejora continua</h4>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-[11px]">
              <th className="pb-2 font-medium">Sistema</th>
              <th className="pb-2 font-medium">Instalado</th>
              <th className="pb-2 font-medium">Disponible</th>
              <th className="pb-2 font-medium">Comprobación</th>
              <th className="pb-2 font-medium">Estado</th>
              <th className="pb-2 font-medium text-right">Comando</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filasData.map((f) => {
              const cmd = COMANDOS[f.sistema];
              const esCopiado = copiado === cmd;
              return (
                <tr key={f.sistema} className="text-white/80">
                  <td className="py-2.5 font-medium text-white">{f.sistema}</td>
                  <td className="py-2.5 text-white/60 font-mono text-[11px]">{f.instalado}</td>
                  <td className="py-2.5 text-white/60 font-mono text-[11px]">{f.disponible}</td>
                  <td className="py-2.5 text-white/50 text-[11px]">{f.ultimaComprobacion}</td>
                  <td className="py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] border ${
                      f.accion === "se actualiza solo" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" :
                      f.accion === "aviso: decide Alex" ? "border-amber-400/30 bg-amber-500/10 text-amber-300" :
                      "border-white/10 bg-white/5 text-white/50"
                    }`}>
                      {f.accion}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => copiar(cmd)}
                      title={`Copiar: ${cmd}`}
                      className="inline-flex cursor-pointer items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-mono text-white/70 hover:bg-white/10"
                    >
                      {esCopiado ? <Check className="h-3 w-3 text-emerald-400 shrink-0" aria-hidden /> : <Copy className="h-3 w-3 shrink-0" aria-hidden />}
                      <span>{cmd}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
