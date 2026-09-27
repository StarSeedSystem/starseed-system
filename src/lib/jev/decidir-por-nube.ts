/**
 * decidir-por-nube.ts — Jev por la nube de Astraura (módulo de SERVIDOR).
 * Sale de `src/app/api/jev/systemone/route.ts`: un archivo de ruta de Next solo
 * puede exportar GET/POST/config…; exportar esta función ahí rompía la
 * comprobación de tipos de Next (`.next/types`, TS2344).
 */
import { destinoNube } from "@/lib/astraura/destino-nube";
import type { Peticion, RespuestaPregunta } from "@/lib/mando/jev-contrato";

/**
 * (G9 · 2026-09-26) Jev por la NUBE cuando este despliegue NO es la propia Mac
 * (`jev.py` hace `spawn("python3", …)`, que solo existe en la máquina de Alex
 * — en Vercel no hay Python que arrancar y Jev quedaba mudo fuera de esa
 * máquina). El backend 1.58 ya expone `POST /api/jev/decidir` (UNA pregunta
 * con sus opciones → `{opcion, probabilidades}`, motor BitNet por n_probs):
 * por cada pregunta `choice`/`score` de la petición se llama una vez y se
 * recompone la MISMA forma que `jev.py` (`formatearRespuesta`), para que el
 * resto del contrato no note el cambio de motor. Las preguntas `noul`
 * (abiertas) no encajan en ese contrato de una sola opción: se dejan sin
 * responder aquí y quien llama cae a su regla determinista — igual que
 * cuando Jev entero no decide. NUNCA se añade una llamada de pago
 * (OpenRouter) desde el navegador: si no hay nube sana, se devuelve
 * `medio: "ninguno"` y punto.
 */
export async function decidirPorNube(norm: Peticion): Promise<RespuestaPregunta[]> {
  const destino = await destinoNube();
  if (!destino) return [];
  const contexto = typeof norm.state === "string" ? norm.state.slice(0, 2000) : JSON.stringify(norm.state).slice(0, 2000);
  const answers: RespuestaPregunta[] = [];
  for (const q of norm.questions) {
    const opciones = q.type === "choice" ? (q.options ?? []) : q.type === "score" ? (q.levels ?? []) : [];
    if (!opciones.length) continue; // "noul" u opciones vacías: sin contrato posible por la nube
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${destino.base}/api/jev/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: q.question, opciones, contexto }),
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { opcion?: unknown; probabilidades?: unknown };
      if (typeof data.opcion !== "string") continue;
      const probs = data.probabilidades && typeof data.probabilidades === "object"
        ? (data.probabilidades as Record<string, number>)
        : {};
      answers.push({
        id: q.id,
        answer: data.opcion,
        probs,
        confidence: typeof probs[data.opcion] === "number" ? probs[data.opcion] : 0,
      });
    } catch {
      /* esta pregunta se queda sin responder; las demás siguen intentándolo */
    } finally {
      clearTimeout(t);
    }
  }
  return answers;
}

