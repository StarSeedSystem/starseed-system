/**
 * Instrumento de medición de latencia (DR1114-1).
 *   NODE_ENV=test npx vitest run src/lib/mejoras/__tests__/instrumento-canal.test.ts
 */
import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";
import { medirYRegistrar } from "../instrumento-canal";
import { _setClienteMetricas } from "../metrics";

type Fila = Record<string, unknown>;

function clienteFalso(insertados: Fila[], respuesta: { data: unknown; error: unknown } = { data: { id: 7 }, error: null }): SupabaseClient {
  const cadena = {
    insert: (fila: Fila) => {
      insertados.push(fila);
      return { select: () => ({ single: () => Promise.resolve(respuesta) }) };
    },
  };
  return { from: () => cadena } as unknown as SupabaseClient;
}

describe("instrumento-canal · medirYRegistrar", () => {
  it("mide la operación y registra la métrica con el canal dado", async () => {
    const filas: Fila[] = [];
    _setClienteMetricas(clienteFalso(filas));
    let ms = 0;
    const medida = await medirYRegistrar("latency", "sse", "aviso-mensajes", async () => {
      ms += 50;
      return "hecho";
    }, { ahora: () => ms });

    expect(medida.resultado).toBe("hecho");
    expect(medida.latenciaMs).toBe(50);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ tipo: "latency", canal: "sse", origen: "aviso-mensajes", latenciaMs: 50 });
  });

  it("registra aunque la operación falle, y re-lanza su error", async () => {
    const filas: Fila[] = [];
    _setClienteMetricas(clienteFalso(filas));
    await expect(
      medirYRegistrar("latency", "websocket", "sendAuroraTurn", async () => {
        throw new Error("fallo propio");
      }, { ahora: () => 0 }),
    ).rejects.toThrow("fallo propio");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ canal: "websocket", origen: "sendAuroraTurn" });
  });

  it("nunca tumba al llamador si el registro falla", async () => {
    const roto = { from: () => { throw new Error("red caída"); } } as unknown as SupabaseClient;
    _setClienteMetricas(roto);
    const medida = await medirYRegistrar("notification", "http", "aviso-mensajes", async () => 42, { ahora: () => 10 });
    expect(medida.resultado).toBe(42);
    expect(medida.registro.ok).toBe(false);
  });
});
