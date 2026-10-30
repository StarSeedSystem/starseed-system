"use client";

/* Conector de Claude (Ola 1019G · GCA1019X): pasos para añadir la URL MCP del ámbito como
 * conector personalizado en claude.ai y usarla en chats, Cowork y artefactos con la capacidad
 * `mcp`. Solo se copia la URL pública; el token nunca se muestra ni se devuelve. */

import { useState } from "react";
import { Check, Copy, PlugZap } from "lucide-react";
import { pasosConectorClaude, urlMcpSegura } from "@/lib/integrations/claude-artefactos";

const BOTON =
  "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-white/75 transition-colors duration-150 hover:border-cyan-300/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 sm:min-h-9";

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function ClaudeConector({
  urlMcp,
  titulo = "Añadir mi Genesis a Claude",
}: {
  urlMcp: string;
  titulo?: string;
}) {
  const [copiada, setCopiada] = useState<string | null>(null);
  const url = urlMcpSegura(urlMcp);
  const pasos = pasosConectorClaude(urlMcp);

  async function copiar(texto: string) {
    const ok = await copiarTexto(texto);
    setCopiada(ok ? texto : null);
    if (ok) window.setTimeout(() => setCopiada(null), 1600);
  }

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3" aria-label={titulo}>
      <header className="flex items-start gap-2">
        <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white/85">{titulo}</h3>
          <p className="text-[11px] text-white/50">
            Añade el Genesis de este ámbito como conector personalizado. Solo se copia la URL; el token se queda en la bóveda.
          </p>
        </div>
      </header>
      {url ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyan-100" title={url}>{url}</code>
          <button type="button" className={BOTON} onClick={() => void copiar(url)} aria-label="Copiar la URL MCP">
            {copiada === url ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copiada === url ? "Copiada" : "Copiar URL"}
          </button>
        </div>
      ) : (
        <p role="status" className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-[11px] text-amber-100">
          Configura la URL MCP del ámbito (https, sin token en la dirección) para ver los pasos.
        </p>
      )}
      {pasos.length ? (
        <ol className="space-y-2">
          {pasos.map((paso, i) => {
            const copiable = paso.copiar;
            return (
              <li key={paso.titulo} className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 text-[10px] font-semibold text-cyan-200" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-white/80">{paso.titulo}</h4>
                    <p className="text-[11px] text-white/55">{paso.detalle}</p>
                    {copiable ? (
                      <button type="button" className={`${BOTON} mt-1`} onClick={() => void copiar(copiable)} aria-label="Copiar la URL MCP del paso">
                        {copiada === copiable ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                        {copiada === copiable ? "Copiada" : "Copiar URL"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
