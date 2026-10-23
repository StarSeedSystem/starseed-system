/**
 * repartir.test.ts — Pruebas puras para pedirCapa (sin red, sin disco real).
 * Usa malla y almacén en memoria.
 */
import { describe, expect, it } from "vitest";
import { almacenamientoEnMemoria, type Almacenamiento } from "@/lib/astraura/capas/almacen";
import { capaEnPropio, pedirCapa, type ConsultaCapa, type RespuestaCapa, type ContextoPedido, type ResultadoPedido } from "@/lib/astraura/capas/repartir";
import type { EntradaCapa } from "@/lib/astraura/capas/catalogo";

const shaHex = async (datos: ArrayBuffer): Promise<string> => {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const bytes = (texto: string): ArrayBuffer => new TextEncoder().encode(texto).buffer;

/** Escribe los trozos de una capa con las claves que usa el módulo. */
async function sembrarCapa(
  almacen: Almacenamiento,
  id: string,
  trozos: ArrayBuffer[],
): Promise<EntradaCapa> {
  for (let i = 0; i < trozos.length; i++) {
    await almacen.escribir(`capa/${id}/trozo/${i}`, trozos[i]);
  }
  const total = trozos.reduce((s, t) => s + t.byteLength, 0);
  const entero = new Uint8Array(total);
  let d = 0;
  for (const t of trozos) {
    entero.set(new Uint8Array(t), d);
    d += t.byteLength;
  }
  return {
    ...crearCatalogoFalso()[0],
    id,
    sha256: await shaHex(entero.buffer),
  };
}

function crearCatalogoFalso(): EntradaCapa[] {
  return [
    {
      id: "needle3-reflejo",
      familia: "Cactus Needle 3",
      capa: "reflejo",
      modelo: "needle3-reflejo",
      version: "3.1.2",
      formato: "cact",
      runtime: "needle-wasm",
      parametros: "121M",
      disco_mb: 12,
      ram_min_mb: 64,
      sha256: "a".repeat(64),
      fuente_oficial: "https://huggingface.co/Cactus-Compute/needle3",
      espejos: ["https://espejo.starseed.org/capas/needle3-reflejo.cact"],
      estado: "recomendado",
      medios: ["web", "pwa", "nativo", "servidor"],
    },
  ];
}

function crearMallaFalsa(respuestas: RespuestaCapa[]) {
  const listeners = new Set<(resp: RespuestaCapa) => void>();
  let broadcastMsg: ConsultaCapa | null = null;

  return {
    malla: {
      broadcast: (msg: ConsultaCapa) => {
        broadcastMsg = msg;
        // Simular respuestas después de un tick.
        setTimeout(() => {
          for (const r of respuestas) {
            for (const l of listeners) l({ ...r, consultaId: msg.id });
          }
        }, 10);
      },
      onRespuesta: (cb: (resp: RespuestaCapa) => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
    getBroadcast: () => broadcastMsg,
  };
}

describe("capaEnPropio — capa completa y verificada en el almacén", () => {
  it("devuelve true si están todos los trozos y el SHA total coincide", async () => {
    const almacen = almacenamientoEnMemoria();
    const entrada = await sembrarCapa(almacen, "needle3-reflejo", [
      bytes("hola "),
      bytes("capa "),
      bytes("needle"),
    ]);
    expect(await capaEnPropio(almacen, [entrada], entrada.sha256)).toBe(true);
  });

  it("devuelve false si falta un trozo", async () => {
    const almacen = almacenamientoEnMemoria();
    const entrada = await sembrarCapa(almacen, "needle3-reflejo", [
      bytes("hola "),
      bytes("capa "),
      bytes("needle"),
    ]);
    await almacen.borrar("capa/needle3-reflejo/trozo/1");
    expect(await capaEnPropio(almacen, [entrada], entrada.sha256)).toBe(false);
  });

  it("devuelve false si se pide otro SHA", async () => {
    const almacen = almacenamientoEnMemoria();
    const entrada = await sembrarCapa(almacen, "needle3-reflejo", [
      bytes("hola "),
      bytes("capa "),
      bytes("needle"),
    ]);
    expect(await capaEnPropio(almacen, [entrada], "f".repeat(64))).toBe(false);
  });

  it("devuelve false si un trozo está alterado", async () => {
    const almacen = almacenamientoEnMemoria();
    const entrada = await sembrarCapa(almacen, "needle3-reflejo", [
      bytes("hola "),
      bytes("capa "),
      bytes("needle"),
    ]);
    await almacen.escribir("capa/needle3-reflejo/trozo/1", bytes("otra!!"));
    expect(await capaEnPropio(almacen, [entrada], entrada.sha256)).toBe(false);
  });
});

describe("pedirCapa — selección de fuente por orden §6", () => {
  it("devuelve propio si la capa ya está completa en el almacén local", async () => {
    const almacen = almacenamientoEnMemoria();
    const entrada = await sembrarCapa(almacen, "needle3-reflejo", [bytes("capa")]);
    const { malla } = crearMallaFalsa([]);
    const ctx: ContextoPedido = {
      catalogo: [entrada],
      almacen,
      malla,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa(entrada.sha256, ctx);
    expect(resultado.fuente?.tipo).toBe("propio");
    expect(resultado.fuente?.id).toBe("local");
  });

  it("elige par antes que espejo StarSeed", async () => {
    const almacen = almacenamientoEnMemoria();
    const respuestas: RespuestaCapa[] = [
      { t: "capa.ofrecer", consultaId: "", peerId: "peer-par-1", tiene: true, camino: "webrtc", esOficial: false },
      { t: "capa.ofrecer", consultaId: "", peerId: "espejo-starseed-1", tiene: true, camino: "webrtc", esOficial: true },
    ];
    const { malla } = crearMallaFalsa(respuestas);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa("sha123", ctx);
    expect(resultado.fuente).not.toBeNull();
    expect(resultado.fuente?.tipo).toBe("par");
  });

  it("elige espejo StarSeed antes que servidor propio", async () => {
    const almacen = almacenamientoEnMemoria();
    const respuestas: RespuestaCapa[] = [
      { t: "capa.ofrecer", consultaId: "", peerId: "servidor-propio-1", tiene: true, camino: "webrtc", esOficial: true },
      { t: "capa.ofrecer", consultaId: "", peerId: "espejo-starseed-1", tiene: true, camino: "webrtc", esOficial: true },
    ];
    const { malla } = crearMallaFalsa(respuestas);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa("sha123", ctx);
    expect(resultado.fuente?.tipo).toBe("espejo-starseed");
  });

  it("elige servidor propio antes que oficial", async () => {
    const almacen = almacenamientoEnMemoria();
    const respuestas: RespuestaCapa[] = [
      { t: "capa.ofrecer", consultaId: "", peerId: "oficial-hf-1", tiene: true, camino: "servidor", esOficial: true },
      { t: "capa.ofrecer", consultaId: "", peerId: "servidor-propio-1", tiene: true, camino: "webrtc", esOficial: true },
    ];
    const { malla } = crearMallaFalsa(respuestas);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa("sha123", ctx);
    expect(resultado.fuente?.tipo).toBe("servidor-propio");
  });

  it("no comparte capas oficiales con pares públicos si no está permitido", async () => {
    const almacen = almacenamientoEnMemoria();
    const respuestas: RespuestaCapa[] = [
      { t: "capa.ofrecer", consultaId: "", peerId: "oficial-hf-1", tiene: true, camino: "servidor", esOficial: true },
      { t: "capa.ofrecer", consultaId: "", peerId: "par-publico-1", tiene: true, camino: "webrtc", esOficial: true },
    ];
    const { malla } = crearMallaFalsa(respuestas);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: false, // no permite
      timeoutMs: 100,
    };
    const resultado = await pedirCapa("sha123", ctx);
    // Debe ignorar la fuente oficial del par público.
    expect(resultado.fuente?.tipo).not.toBe("oficial");
  });

  it("devuelve sin-camino si la única ruta disponible es LoRa", async () => {
    const almacen = almacenamientoEnMemoria();
    const respuestas: RespuestaCapa[] = [
      { t: "capa.ofrecer", consultaId: "", peerId: "peer-lora-1", tiene: true, camino: "lorawan", esOficial: false },
    ];
    const { malla } = crearMallaFalsa(respuestas);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa("sha123", ctx);
    expect(resultado.fuente).toBeNull();
    expect(resultado.error).toBe("sin-camino");
  });

  it("ignora respuestas de peers que no tienen la capa", async () => {
    const almacen = almacenamientoEnMemoria();
    const respuestas: RespuestaCapa[] = [
      { t: "capa.no-tengo", consultaId: "", peerId: "peer-sin-capa", tiene: false, camino: "webrtc" },
      { t: "capa.ofrecer", consultaId: "", peerId: "peer-con-capa", tiene: true, camino: "webrtc", esOficial: false },
    ];
    const { malla } = crearMallaFalsa(respuestas);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa("sha123", ctx);
    expect(resultado.fuente?.id).toBe("peer-con-capa");
  });
});