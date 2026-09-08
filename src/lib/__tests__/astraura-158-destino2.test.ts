/**
 * Test de la decisión del destino del proxy de Astraura 1.58 (Ola 278 · OS6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Solo funciones puras: `elegirDestino` (módulo SIN servidor). No importa el
 * route ni parchea módulos de Node (en este repo esos tests fallan), por eso la
 * decisión vive en `src/lib/astraura/elegir-destino.ts`, importable limpio.
 *
 * Casos cubiertos:
 *   · pedido local + despliegue local → neurona local (`via: "local"`);
 *   · pedido nube, sin nube, despliegue local → respaldo a la neurona local
 *     (`via: "local-respaldo"`): el motivo de la Ola 278 · OS6;
 *   · pedido nube, sin nube y sin despliegue local → null (la ruta responde 503);
 *   · pedido local en un despliegue NO local (p.ej. Vercel), con nube → nube:
 *     no se puede pedir la neurona ajena.
 */

import { describe, it, expect } from "vitest";
import { elegirDestino } from "@/lib/astraura/elegir-destino";

describe("elegirDestino", () => {
  it("pedido local + despliegue local → neurona local", () => {
    const r = elegirDestino({
      pedido: "local",
      local: true,
      baseNube: "https://x",
      baseLocal: "http://127.0.0.1:8000",
    });
    expect(r).toEqual({ base: "http://127.0.0.1:8000", via: "local" });
  });

  it("pedido nube, sin nube sana, despliegue local → respaldo a la neurona local", () => {
    const r = elegirDestino({
      pedido: "nube",
      local: true,
      baseNube: null,
      baseLocal: "http://127.0.0.1:8000",
    });
    expect(r).toEqual({ base: "http://127.0.0.1:8000", via: "local-respaldo" });
  });

  it("pedido nube, sin nube y sin despliegue local → null (503)", () => {
    const r = elegirDestino({
      pedido: "nube",
      local: false,
      baseNube: null,
      baseLocal: "http://127.0.0.1:8000",
    });
    expect(r).toBeNull();
  });

  it("pedido local en un despliegue no local con nube → nube (no se puede pedir la neurona ajena)", () => {
    const r = elegirDestino({
      pedido: "local",
      local: false,
      baseNube: "https://x",
      baseLocal: "http://127.0.0.1:8000",
    });
    expect(r).toEqual({ base: "https://x", via: "nube" });
  });
});