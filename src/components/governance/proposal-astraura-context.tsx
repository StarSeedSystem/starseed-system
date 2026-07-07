"use client";

// StarSeed · Ontocracia — Panel "Contexto de Aurora" en la ficha de una
// propuesta política: pide a Astraura (router agéntico existente) un resumen
// de contexto relevante sobre el tema de la propuesta y los recursos/entidades
// implicados. Usa web-access si el usuario tiene un proveedor configurado
// (honesto: si no, Aurora responde desde su conocimiento y lo dice). Render
// con el MessageRenderer universal (markdown/tablas/código ya soportado).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Wand2 } from "lucide-react";
import { astrauraChat } from "@/ai/astraura/router";
import { webAccessStatusLine } from "@/ai/astraura/web-access";
import type { ChatMessage } from "@/ai/providers/types";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import type { AffectedEntity } from "@/lib/governance/political";

export function ProposalAstraturaContext({
  title,
  description,
  scope,
  scopeRef,
  affects,
}: {
  title: string;
  description?: string | null;
  scope: string;
  scopeRef?: string | null;
  affects?: AffectedEntity[];
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function ask() {
    setBusy(true);
    setNote("");
    try {
      const affectsTxt = (affects ?? []).map((a) => `${a.kind}:${a.slug}`).join(", ") || "ninguna etiquetada";
      const content = `Eres Astraura, guía contextual de StarSeed OS para el ÁREA POLÍTICA de la red.
Un ciudadano va a decidir su voto sobre esta propuesta democrática:

Título: ${title}
Descripción: ${description || "(sin descripción adicional)"}
Ámbito: ${scope}${scopeRef ? ` (ref ${scopeRef})` : ""}
Entidades/recursos implicados (etiquetados como "afecta a"): ${affectsTxt}

${webAccessStatusLine()}

Da un resumen de CONTEXTO ÚTIL para decidir el voto (máx. 8 líneas, en español,
con viñetas si ayuda): datos relevantes sobre el tema, riesgos/beneficios
razonables, y precedentes si los conoces. Si no tienes acceso real a internet,
respóndelo con tu conocimiento general y dilo explícitamente (nunca finjas
navegar). No emitas recomendación de voto: sólo contexto imparcial.`;
      const messages: ChatMessage[] = [{ role: "user", content }];
      const res = await astrauraChat({ messages, taskHint: "reasoning", temperature: 0.4 });
      setNote(res?.text?.trim() || "Aurora no devolvió contexto esta vez.");
    } catch {
      setNote("Aurora no pudo generar el contexto ahora mismo. Inténtalo de nuevo en unos segundos.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
        <span className="text-[11px] font-semibold text-fuchsia-50">Contexto de Aurora</span>
        <span className="text-[10px] text-fuchsia-300/60">Datos relevantes sobre el tema y los recursos implicados</span>
        <Button
          size="sm"
          className="ml-auto h-7 gap-1.5 bg-fuchsia-600 text-white hover:bg-fuchsia-500"
          onClick={ask}
          disabled={busy}
        >
          <Wand2 className={busy ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
          {busy ? "Pensando…" : "Pedir contexto"}
        </Button>
      </div>
      {note && (
        <div className="mt-2 rounded-md border border-fuchsia-500/15 bg-black/30 p-2.5">
          <MessageRenderer text={note} compact media={false} className="text-fuchsia-50/90" />
        </div>
      )}
    </div>
  );
}

export default ProposalAstraturaContext;
