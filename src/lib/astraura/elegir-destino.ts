/**
 * elegir-destino.ts — Decisión PURA y exportada del destino del proxy de
 * Astraura 1.58-bit (Ola 278 · OS6 · 2026-09-08).
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes la resolución vivía dentro de `resolverDestino` en la ruta del proxy, y
 * en un despliegue LOCAL sin nube sana el proxy caía al 503 `astraura-nube-no-
 * disponible` aunque la propia máquina tuviera su neurona en 127.0.0.1:8000:
 * el chat dejaba de usar la neurona local. Esta función extrae la decisión a un
 * módulo SIN servidor (no toca `process.env` ni arranca Next), para que el test
 * de vitest pueda importarla limpia — igual que `destino-local.ts` (Ola 278 OS4).
 *
 * ORDEN DE RESOLUCIÓN (manda el que antes se cumpla):
 *   (a) el cliente pide la neurona local (`pedido: "local"`) Y el despliegue es
 *       local → neurona local, `via: "local"`;
 *   (b) hay una base de nube sana → nube, `via: "nube"`;
 *   (c) sin nube sana pero despliegue local → respaldo a la neurona local,
 *       `via: "local-respaldo"`;
 *   (d) ni nube ni local → `null` (la ruta responde 503 y el router releva).
 *
 * La puerta de sesión sigue exigiendo que `esDespliegueLocal(req)` Y
 * `destinoEsLocal(base)` (Ola 278 · OS4): este respaldo SOLO abre la puerta en
 * la neurona, nunca en Vercel, donde `local` es siempre false y el caso (c) no
 * llega a darse (todo queda como estaba: nube o 503).
 */

/** De dónde quiere la respuesta el cliente. */
export type PedidoDestino = "local" | "nube";

/** Cómo se alcanza el destino elegido. */
export type ViaDestino = "local" | "nube" | "local-respaldo";

export interface DestinoElegido {
  /** Base URL limpia (sin barra final) a la que reenviar la petición. */
  base: string;
  via: ViaDestino;
}

export interface ElegirDestinoEntrada {
  /** `?destino=local` / `X-Starseed-Destino` si el cliente marcó la llamada. */
  pedido: PedidoDestino;
  /** `esDespliegueLocal(req)`: el OS corre en esta neurona (localhost / STARSEED_LOCAL). */
  local: boolean;
  /** Base sana de la nube (ya resuelta por `destinoNube()`), o null si no hay. */
  baseNube: string | null;
  /** Base de la neurona local (`ASTRAURA_LOCAL_URL` o `http://127.0.0.1:8000`). */
  baseLocal: string;
}

/** Deja una base sin barra final; devuelve null si queda vacía. */
function baseLimpia(v: string | null | undefined): string | null {
  const b = String(v ?? "").trim().replace(/\/+$/, "");
  return b || null;
}

/**
 * Resuelve el destino del proxy siguiendo el ORDEN (a)→(d). Pura: no lanza, no
 * toca red ni `process.env`; recibe la base de nube ya sondada desde fuera.
 */
export function elegirDestino(entrada: ElegirDestinoEntrada): DestinoElegido | null {
  const baseLocal = baseLimpia(entrada.baseLocal);
  // (a) Piden la neurona local y estamos en la propia máquina: siempre local,
  //     aunque haya nube sana (es lo que el usuario quiere y lo más barato).
  if (entrada.pedido === "local" && entrada.local) {
    return baseLocal ? { base: baseLocal, via: "local" } : null;
  }
  // (b) Hay nube sana: se usa (también cuando pedir "local" en un despliegue NO
  //     local, p.ej. Vercel: ahí no se puede alcanzar la neurona ajena).
  const baseNube = baseLimpia(entrada.baseNube);
  if (baseNube) return { base: baseNube, via: "nube" };
  // (c) Sin nube, pero el OS es local: respaldo a la neurona de la propia máquina.
  if (entrada.local) {
    return baseLocal ? { base: baseLocal, via: "local-respaldo" } : null;
  }
  // (d) Ni nube ni local: sin destino sano.
  return null;
}