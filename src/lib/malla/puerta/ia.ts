/**
 * puerta/ia — IA de otra neurona de MI cuenta por la malla (PTA1110A · 2026-11-10).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3 (capa «IA de esta neurona»). Puro: sin red ni DOM.
 *
 * Qué ya existía: el router de Astraura (`src/lib/astraura/elegir-nodo.ts`) ordena candidatos locales / vecinos / nube;
 * los servicios de IA PÚBLICOS (api.openai.com, OpenRouter, NVIDIA NIM…) son HTTPS normal y pasan por la puerta como
 * cualquier sitio. Lo que faltaba: la IA que corre en el BUCLE LOCAL de la neurona-puerta (Astraura local, Ollama,
 * LM Studio), que nadie más puede alcanzar. La puerta la anuncia como capa `ia-neurona` (solo misma cuenta, solo los
 * puertos declarados); quien pide la nombra con `http://ia.neurona.local:<puerto>` y la puerta traduce a su `127.0.0.1`.
 */

import { HOST_IA_NEURONA } from "@/lib/malla/puerta/capas";

/** Lo mínimo de una puerta de `EstadoServicioPuerta.puertas` que hace falta aquí. */
export interface PuertaConCapas {
  id: string;
  nombre: string;
  enlace: string;
  saltos: number;
  puntuacion: number;
  capas: Array<{ tipo: string; puertos: number[]; etiqueta?: string; latenciaMs?: number | null }>;
}

/** Compatible con `Candidato` de `src/lib/astraura/elegir-nodo.ts` (tipo «vecino»). */
export interface NodoIaMalla {
  id: string;
  tipo: "vecino";
  url: string;
  vivo: boolean;
  tokS: null;
  ramLibreMb: null;
  latenciaMs: number | null;
  /** Para la interfaz. */
  neurona: string;
  nombre: string;
  puerto: number;
  enlace: string;
  saltos: number;
}

/** Un nodo por (puerta, puerto de IA). Tokens/s y RAM quedan sin medir: el router los pone DESPUÉS de cualquier nodo medido. */
export function nodosIaPorMalla(puertas: readonly PuertaConCapas[]): NodoIaMalla[] {
  const out: NodoIaMalla[] = [];
  for (const p of [...puertas].sort((a, b) => b.puntuacion - a.puntuacion)) {
    for (const c of p.capas) {
      if (c.tipo !== "ia-neurona") continue;
      for (const puerto of c.puertos) {
        out.push({
          id: `malla:${p.id}:${puerto}`,
          tipo: "vecino",
          url: `http://${HOST_IA_NEURONA}:${puerto}`,
          vivo: true,
          tokS: null,
          ramLibreMb: null,
          latenciaMs: typeof c.latenciaMs === "number" ? c.latenciaMs : null,
          neurona: p.id,
          nombre: p.nombre,
          puerto,
          enlace: p.enlace,
          saltos: p.saltos,
        });
      }
    }
  }
  return out;
}

/** ¿Esta URL apunta a la IA de otra neurona por la malla? (solo el nombre reservado; nunca un `127.0.0.1` cualquiera) */
export function esUrlIaMalla(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === HOST_IA_NEURONA;
  } catch {
    return false;
  }
}

/** PTA1110A · ¿Puede esta neurona usar la IA de otra por la malla? Respeta «Usar el internet de mis neuronas» y el uso «IA». */
export function elegirNodoIaMalla(nodos: readonly NodoIaMalla[], ajustes: { modoUso: string; usos: { ia: boolean } }): NodoIaMalla | null {
  if (ajustes.modoUso === "nunca" || !ajustes.usos.ia) return null;
  return nodos.find((n) => n.vivo) ?? null;
}
