/**
 * Pruebas de `latencia-transporte.ts` (DR1114-1): puras, con almacén falso
 * inyectado — nada de `vi.mock` ni de módulos de Node ni de `route.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  LATENCIA_TRANSPORTE_EVENT,
  LATENCIA_TRANSPORTE_MAX,
  type DetalleLatencia,
  type MuestraLatencia,
  ganaTransporte,
  leerMuestras,
  mediana,
  registrarMuestraLatencia,
  resumenTransporte,
} from "../latencia-transporte";

/** Almacén falso en memoria (el mismo contrato mínimo que el módulo pide). */
class AlmacenFalso {
  private datos = new Map<string, string>();
  getItem(key: string): string | null {
    return this.datos.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.datos.set(key, value);
  }
}

const muestra = (extra: Partial<MuestraLatencia> = {}): MuestraLatencia => ({
  t: 1_700_000_000_000,
  transporte: "ws",
  ttftMs: 500,
  ms: 1_000,
  ...extra,
});

describe("mediana", () => {
  it("vacío → null; impar → el del medio; par → media de los dos centrales", () => {
    expect(mediana([])).toBeNull();
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("resumenTransporte", () => {
  it("cuenta turnos y medianas del transporte pedido, ignorando las de ttft nulo", () => {
    const resumen = resumenTransporte(
      [
        muestra({ transporte: "ws", ttftMs: 100 }),
        muestra({ transporte: "ws", ttftMs: 300 }),
        muestra({ transporte: "ws", ttftMs: null }),
        muestra({ transporte: "sse", ttftMs: 900 }),
      ],
      "ws",
    );
    expect(resumen).toEqual({ transporte: "ws", turnos: 3, conTtft: 2, ttftMedioMs: 200, ttftMedianoMs: 200 });
    expect(resumenTransporte([], "sse").turnos).toBe(0);
  });
});

describe("ganaTransporte", () => {
  const lote = (transporte: "ws" | "sse", ttft: number, n = 5) =>
    Array.from({ length: n }, (_, i) => muestra({ transporte, ttftMs: ttft, t: i }));

  it("sin muestras suficientes en los dos lados → sin-datos", () => {
    expect(ganaTransporte(lote("ws", 200, 2), lote("sse", 900))).toBe("sin-datos");
  });

  it("el WS gana solo si su mediana baja por encima del margen", () => {
    expect(ganaTransporte(lote("ws", 200), lote("sse", 900))).toBe("ws");
    expect(ganaTransporte(lote("ws", 900), lote("sse", 200))).toBe("sse");
    // 80 ms de diferencia (< 100 de margen): empate honesto.
    expect(ganaTransporte(lote("ws", 200), lote("sse", 280))).toBe("sin-datos");
  });
});

describe("registrarMuestraLatencia", () => {
  it("guarda la muestra, avisa con resumen y veredicto, y respeta el techo", () => {
    const almacen = new AlmacenFalso();
    const avisos: DetalleLatencia[] = [];
    // Llena el registro por encima del techo (una sola via, veredicto sin-datos).
    for (let i = 0; i < LATENCIA_TRANSPORTE_MAX + 3; i++) {
      registrarMuestraLatencia(muestra({ transporte: "ws", ttftMs: 200, t: i }), { almacen, avisar: (d) => avisos.push(d) });
    }
    const log = leerMuestras(almacen);
    expect(log).toHaveLength(LATENCIA_TRANSPORTE_MAX);
    expect(log[log.length - 1].t).toBe(LATENCIA_TRANSPORTE_MAX + 2);
    const ultimo = avisos[avisos.length - 1];
    expect(ultimo.resumen.ws.turnos).toBe(LATENCIA_TRANSPORTE_MAX);
    expect(ultimo.veredicto).toBe("sin-datos"); // falta el lado SSE
  });

  it("sin almacén ni window (SSR) devuelve null y no lanza", () => {
    expect(registrarMuestraLatencia(muestra())).toBeNull();
  });

  it("el detalle del aviso es lo mismo que devuelve la función", () => {
    const almacen = new AlmacenFalso();
    let captura: DetalleLatencia | null = null;
    const devuelto = registrarMuestraLatencia(muestra({ transporte: "sse" }), {
      almacen,
      avisar: (d) => {
        captura = d;
      },
    });
    expect(devuelto).not.toBeNull();
    expect(captura).toEqual(devuelto);
  });

  it("exporta el nombre del evento para quien escuche", () => {
    expect(LATENCIA_TRANSPORTE_EVENT).toContain("latencia-transporte");
  });
});
