"use client";

import { analizarConvergencia } from "@/lib/protomolecula/grafo-convergencia";
import { rutaDeConversion } from "@/lib/protomolecula/convertidores";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Arista, Diagnostico } from "@/lib/protomolecula/grafo-convergencia";
import type { RutaConversion } from "@/lib/protomolecula/convertidores";
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import { PanelProtomoleculaAutonomo } from "@/components/protomolecula/panel-protomolecula";

// TODO: Import the PanelProtomoleculaAutonomo component. We assume it exists.
// If it doesn't, we might need to create it, but the task says it is used.

export function BloquePizarraProtomolecula({
  moleculaId,
  aristasEntrantes,
  aristasSalientes,
}: {
  moleculaId: string;
  aristasEntrantes: Arista[];
  aristasSalientes: Arista[];
}) {
  // Collect unique molecule IDs: central + edges
  const ids = new Set<string>();
  ids.add(moleculaId);
  for (const e of aristasEntrantes) {
    ids.add(e.de);
    ids.add(e.a);
  }
  for (const e of aristasSalientes) {
    ids.add(e.de);
    ids.add(e.a);
  }

  // Build atomos: for each ID, get its definicion to obtain herramientaId
  const atomos: { id: string; herramientaId: string }[] = [];
  ids.forEach((id) => {
    const def = obtenerAtomo(id);
    const herramientaId = def?.herramientaId ?? id; // fallback to id if definicion not found
    atomos.push({ id, herramientaId });
  });

  // Combine all aristas (incoming + outgoing)
  const allAristas: Arista[] = [...aristasEntrantes, ...aristasSalientes];

  // Definicion function for analizarConvergencia
  const definicion: (herramientaId: string) => DefinicionAtomo | undefined = obtenerAtomo;

  // Convert RutaConversion to string[] of format names for rutaDe
  const rutaDe: (de: string, a: string) => string[] | null = (de, a) => {
    const rc = rutaDeConversion(de, a);
    if (!rc) return null;
    // Build format sequence: start with de, then each step's output format (a)
    const formats: string[] = [de];
    for (const paso of rc.pasos) {
      formats.push(paso.a);
    }
    return formats;
  };

  // Run convergence analysis
  const diagnostico: Diagnostico = analizarConvergencia(
    atomos,
    allAristas,
    definicion,
    rutaDe
  );

  // Prepare status messages
  const recibidos = aristasEntrantes.map((e) => e.de);
  const alimenta = aristasSalientes.map((e) => e.a);

  // Build list of issues
  const issues: string[] = [];
  diagnostico.incompatibles.forEach((inc) => {
    issues.push(
      `Incompatible: ${inc.arista.de} → ${inc.arista.a} (sale ${inc.salidas.join(
        ", "
      )}, entra ${inc.entradas.join(", ")})`
    );
  });
  diagnostico.conversiones.forEach((conv) => {
    issues.push(
      `Conversión: ${conv.arista.de} → ${conv.arista.a} (${conv.ruta.join(
        " → "
      )})`
    );
  });

  return (
    <div>
      <PanelProtomoleculaAutonomo compacto={true} moleculaId={moleculaId} />
      {/* Status stripe */}
      <div className="mt-2 p-2 bg-zinc-900/50 rounded-md text-xs text-white/80">
        <div className="mb-1">
          <strong>Recibe de:</strong> {recibidos.length > 0 ? recibidos.join(", ") : "ninguno"}
        </div>
        <div className="mb-1">
          <strong>Alimenta a:</strong> {alimenta.length > 0 ? alimenta.join(", ") : "ninguno"}
        </div>
        {issues.length > 0 && (
          <div className="mt-1">
            <strong>Nota:</strong> {issues.join(" | ")}
          </div>
        )}
      </div>
    </div>
  );
}