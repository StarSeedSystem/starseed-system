import { describe, expect, it } from "vitest";
import { posicionesNeuronas } from "@/components/mesh/posiciones-neuronas";
import type {
  DispositivoMallaRow,
  EstadoEnlace,
} from "@/lib/network/malla-neuronas";
import type { ClaseRuta, RutaEnlace } from "@/lib/network/estadisticas-enlace";

function fila(
  neuronId: string,
  estado: EstadoEnlace,
  enlace: Partial<DispositivoMallaRow["enlace"]> = {},
  filaExtra: Partial<DispositivoMallaRow> = {},
): DispositivoMallaRow {
  return {
    neuronId,
    nombre: `🧠 Neurona ${neuronId}`,
    plataforma: "web",
    tipo: "laptop",
    online: true,
    esEsteDispositivo: false,
    ...filaExtra,
    enlace: { estado, ...enlace },
  };
}

function ruta(clase: ClaseRuta): RutaEnlace {
  return {
    clase,
    tipoLocal: null,
    tipoRemoto: null,
    protocolo: null,
    rttMs: null,
    bytesEnviados: null,
    bytesRecibidos: null,
    medidoEn: 1,
  };
}

function radio(pos: [number, number, number]): number {
  return Math.hypot(pos[0], pos[2]);
}

describe("posicionesNeuronas", () => {
  it("conserva el orden y asigna el radio de cada estado", () => {
    const resultado = posicionesNeuronas([
      fila("rápida", "conectado", { latenciaMs: 0 }),
      fila("lenta", "conectado", { latenciaMs: 300 }),
      fila("uniendo", "conectando"),
      fila("error", "fallido", { motivo: "sin respuesta" }),
      fila("suelta", "sin-vinculo"),
    ]);

    expect(resultado.map((nodo) => nodo.neuronId)).toEqual([
      "rápida", "lenta", "uniendo", "error", "suelta",
    ]);
    [3, 7, 8, 9, 10].forEach((esperado, indice) => {
      expect(radio(resultado[indice]!.pos)).toBeCloseTo(esperado);
    });
    expect(resultado[0]?.nombre).toBe("Neurona rápida");
  });

  it("acerca a cuatro unidades un enlace de la misma red local", () => {
    const [lan] = posicionesNeuronas([
      fila("lan", "conectado", {
        latenciaMs: 300,
        ruta: ruta("misma-red-local"),
      }),
    ]);

    expect(lan).toBeDefined();
    expect(radio(lan!.pos)).toBeCloseTo(4);
    expect(lan!.etiqueta).toBe("conectado · 300 ms · misma red local");
  });

  it("excluye este dispositivo y cualquier neurona fuera de línea", () => {
    const resultado = posicionesNeuronas([
      fila("yo", "conectado", {}, { esEsteDispositivo: true }),
      fila("offline", "conectado", {}, { online: false }),
      fila("visible", "conectado"),
    ]);

    expect(resultado.map((nodo) => nodo.neuronId)).toEqual(["visible"]);
  });

  it("usa el color y la etiqueta honestos de cada estado", () => {
    const resultado = posicionesNeuronas([
      fila("conectada", "conectado", {
        latenciaMs: 83,
        ruta: ruta("misma-red-local"),
      }),
      fila("uniendo", "conectando"),
      fila("fallida", "fallido", { motivo: "señalización agotada" }),
      fila("suelta", "sin-vinculo"),
    ]);

    expect(resultado.map(({ color }) => color)).toEqual([
      "#34d399", "#fbbf24", "#fb7185", "#94a3b8",
    ]);
    expect(resultado.map(({ etiqueta }) => etiqueta)).toEqual([
      "conectado · 83 ms · misma red local",
      "conectando…",
      "fallido: señalización agotada",
      "en línea, sin enlace P2P",
    ]);
  });

  it("mantiene el ángulo determinista para un mismo neuronId", () => {
    const primera = posicionesNeuronas([fila("estable", "conectado", { latenciaMs: 20 })]);
    const segunda = posicionesNeuronas([fila("estable", "fallido")]);
    const angulo = ([x, , z]: [number, number, number]) => Math.atan2(z, x);

    expect(angulo(primera[0]!.pos)).toBe(angulo(segunda[0]!.pos));
    expect(primera[0]!.pos[1]).toBe(0.6);
  });
});
