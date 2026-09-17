/**
 * Medidor de IDEs vinculados (Ola 335). Función pura + lector server-only.
 * Reglas: /api/mando/* local, sin rutas absolutas ni claves. Notas en español.
 */
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { raizDelProyecto } from "@/lib/mando/raiz";

export interface PunteroIde {
  id: string; nombre: string; ruta: string; existeMs: number | null;
}
export type FrescuraIde = "al día" | "atrasado" | "nunca";
export type Ide = {
  id: string; nombre: string; vinculado: boolean;
  sincronizadoMs: number | null; frescura: FrescuraIde; nota: string;
};
export const LIMITE_FRESCURA_MS = 2 * 60 * 60 * 1000;

export function estadoDeIdes(
  punteros: readonly PunteroIde[], ahoraMs: number,
): Ide[] {
  return punteros.map((p) => {
    const vinculado = p.existeMs !== null;
    const sincronizadoMs = p.existeMs;
    let frescura: FrescuraIde = "nunca";
    let nota = "no está vinculado";
    if (vinculado && sincronizadoMs !== null) {
      const delta = ahoraMs - sincronizadoMs;
      if (delta < LIMITE_FRESCURA_MS) {
        frescura = "al día";
        const m = Math.max(0, Math.floor(delta / 60000));
        nota = m < 1 ? "sincronizado hace menos de 1 min" : `sincronizado hace ${m} min`;
      } else {
        frescura = "atrasado";
        const d = Math.floor(delta / 86400000);
        const h = Math.floor((delta % 86400000) / 3600000);
        if (d >= 1) nota = `lleva ${d} día${d === 1 ? "" : "s"} con contexto viejo`;
        else if (h >= 1) nota = `lleva ${h} hora${h === 1 ? "" : "s"} con contexto viejo`;
        else nota = `lleva ${Math.floor(delta / 60000)} min con contexto viejo`;
      }
    }
    return { id: p.id, nombre: p.nombre, vinculado, sincronizadoMs, frescura, nota };
  });
}

const PUNTEROS_CANONICOS: Array<{ id: string; nombre: string; resolver: () => string }> = [
  { id: "codex", nombre: "Codex", resolver: () => path.join(os.homedir(), ".codex", "AGENTS.md") },
  { id: "hermes", nombre: "Hermes", resolver: () => path.join(os.homedir(), ".hermes", "PUENTE-DE-MANDO.md") },
  { id: "antigravity", nombre: "Antigravity", resolver: () => path.join(os.homedir(), ".gemini", "antigravity", "PUENTE-DE-MANDO.md") },
  { id: "cursor-global", nombre: "Cursor (global)", resolver: () => path.join(os.homedir(), ".cursor", "rules", "puente-de-mando.mdc") },
  { id: "copilot", nombre: "GitHub Copilot", resolver: () => path.join(raizDelProyecto(), ".github", "copilot-instructions.md") },
  { id: "cursor-local", nombre: "Cursor (repo)", resolver: () => path.join(raizDelProyecto(), ".cursor", "rules", "puente-de-mando.mdc") },
];

export async function leerEstadoDeIdes(ahoraMs = Date.now()): Promise<Ide[]> {
  const punteros: PunteroIde[] = [];
  for (const def of PUNTEROS_CANONICOS) {
    const ruta = def.resolver();
    let existeMs: number | null = null;
    try { const st = await stat(ruta); if (st.isFile()) existeMs = st.mtimeMs; } catch { existeMs = null; }
    punteros.push({ id: def.id, nombre: def.nombre, ruta, existeMs });
  }
  return estadoDeIdes(punteros, ahoraMs);
}
