import { describe, it, expect } from "vitest";
import {
  anunciar,
  elegirDeliberador,
  elegirReflejo,
  resumenRed,
  type CapacidadesNodo,
} from "../capacidades-nodo";
import { selectDeliberatorNode, selectReflejoNode } from "../lan-sync";
import { resolveNetworkCapacities } from "@/ai/astraura/router";

const AHORA = 1000000;

const nodoNavegador: CapacidadesNodo = {
  nodoId: "nodo-nav", medio: "navegador", needle: { version: "3.0.0", adaptador: "sha-256-a1" },
  bitnet: null, jev: false, ramLibreMb: 512, cpu: 20, t: AHORA,
};

const nodoMac: CapacidadesNodo = {
  nodoId: "nodo-mac", medio: "mac", needle: { version: "3.0.0", adaptador: "sha-256-a2" },
  bitnet: { tokPorS: 9.5, ctx: 2048, ocupado: true }, jev: true, ramLibreMb: 4096, cpu: 85, t: AHORA,
};

const nodoNube: CapacidadesNodo = {
  nodoId: "nodo-nube", medio: "nube", needle: { version: "3.1.0", adaptador: "sha-256-a3" },
  bitnet: { tokPorS: 25.0, ctx: 4096, ocupado: false }, jev: true, ramLibreMb: 8192, cpu: 15, t: AHORA,
};

const nodoViejo: CapacidadesNodo = {
  nodoId: "nodo-viejo", medio: "linux", needle: { version: "2.0.0" },
  bitnet: { tokPorS: 30.0, ctx: 4096, ocupado: false }, jev: false, ramLibreMb: 2048, cpu: 10, t: AHORA - 70000,
};

const nodoAndroid: CapacidadesNodo = {
  nodoId: "nodo-android", medio: "android", needle: null, bitnet: null, jev: false,
  ramLibreMb: 256, cpu: 50, t: AHORA,
};

const fixtureCincoNodos: CapacidadesNodo[] = [
  nodoNavegador,
  nodoMac,
  nodoNube,
  nodoViejo,
  nodoAndroid,
];

describe("capacidades-nodo", () => {
  it("anunciar genera el mensaje correcto para el bus de la mesh", () => {
    const msg = anunciar(nodoNube);
    expect(msg.tema).toBe("astraura/capacidades");
    expect(msg.origen).toBe("nodo-nube");
    expect(msg.payload).toEqual(nodoNube);
    expect(msg.t).toBe(AHORA);
  });

  it("elegirDeliberador selecciona el nodo con BitNet libre y latido < 60s", () => {
    const deliberador = elegirDeliberador(fixtureCincoNodos, AHORA);
    expect(deliberador).not.toBeNull();
    expect(deliberador?.nodoId).toBe("nodo-nube");
  });

  it("elegirDeliberador devuelve null si no hay candidato con BitNet libre o latido reciente", () => {
    const resultado = elegirDeliberador([nodoNavegador, nodoMac, nodoAndroid], AHORA);
    expect(resultado).toBeNull();
  });

  it("elegirReflejo prefiere el propio nodo si tiene Needle", () => {
    const reflejoPropio = elegirReflejo(fixtureCincoNodos, "nodo-nav");
    expect(reflejoPropio?.nodoId).toBe("nodo-nav");
  });

  it("elegirReflejo selecciona el más cercano con Needle si el propio no tiene Needle", () => {
    const reflejoCercano = elegirReflejo(fixtureCincoNodos, "nodo-android");
    expect(reflejoCercano).not.toBeNull();
    expect(reflejoCercano?.needle).not.toBeNull();
    expect(reflejoCercano?.nodoId).toBe("nodo-mac");
  });

  it("resumenRed calcula métricas de la red correctamente", () => {
    const resumen = resumenRed(fixtureCincoNodos);
    expect(resumen.nodos).toBe(5);
    expect(resumen.conNeedle).toBe(4);
    expect(resumen.conBitnet).toBe(3);
    expect(resumen.conJev).toBe(2);
    expect(resumen.adaptadorMasNuevo).toBe("sha-256-a3");
  });

  it("conecta con lan-sync y router para resolver deliberador y reflejo", () => {
    expect(selectDeliberatorNode(fixtureCincoNodos, AHORA)?.nodoId).toBe("nodo-nube");
    expect(selectReflejoNode(fixtureCincoNodos, "nodo-nav")?.nodoId).toBe("nodo-nav");

    const res = resolveNetworkCapacities({ kind: "reasoning", needsVision: false, chars: 10, difficulty: 0.5 }, fixtureCincoNodos, AHORA);
    expect(res.deliberador?.nodoId).toBe("nodo-nube");
  });
});
