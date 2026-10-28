/**
 * repartir.test.ts — Pruebas puras para pedirCapa (sin red, sin disco real).
 * Usa malla y almacén en memoria.
 */
import { describe, expect, it, vi } from "vitest";
import { almacenamientoEnMemoria } from "@/lib/astraura/capas/almacen";
import { pedirCapa, capaEnPropio, type ConsultaCapa, type RespuestaCapa, type ContextoPedido, type ResultadoPedido } from "@/lib/astraura/capas/repartir";
import type { EntradaCapa } from "@/lib/astraura/capas/catalogo";

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

describe("capaEnPropio — verificación de capa en almacén local", () => {
it("devuelve true si la capa está completa con todos sus trozos y SHA coincide", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha256 = "a".repeat(64);
    const meta = { sha256, completa: true, totalTrozos: 3 };
    await almacen.escribir("capa/needle3-reflejo/meta", new TextEncoder().encode(JSON.stringify(meta)).buffer);
    await almacen.escribir("capa/needle3-reflejo/trozo/0", new ArrayBuffer(10));
    await almacen.escribir("capa/needle3-reflejo/trozo/1", new ArrayBuffer(10));
    await almacen.escribir("capa/needle3-reflejo/trozo/2", new ArrayBuffer(10));

    const resultado = await capaEnPropio(almacen, sha256);
    expect(resultado).toBe(true);
  });

  it("devuelve false si falta un trozo", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha256 = "a".repeat(64);
    const meta = { sha256, completa: true, totalTrozos: 3 };
    await almacen.escribir("capa/needle3-reflejo/meta", new TextEncoder().encode(JSON.stringify(meta)).buffer);
    await almacen.escribir("capa/needle3-reflejo/trozo/0", new ArrayBuffer(10));
    await almacen.escribir("capa/needle3-reflejo/trozo/1", new ArrayBuffer(10));
    // trozo/2 falta

    const resultado = await capaEnPropio(almacen, sha256);
    expect(resultado).toBe(false);
  });

  it("devuelve false si el SHA no coincide", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha256 = "a".repeat(64);
    const meta = { sha256: "b".repeat(64), completa: true, totalTrozos: 3 };
    await almacen.escribir("capa/needle3-reflejo/meta", new TextEncoder().encode(JSON.stringify(meta)).buffer);
    await almacen.escribir("capa/needle3-reflejo/trozo/0", new ArrayBuffer(10));
    await almacen.escribir("capa/needle3-reflejo/trozo/1", new ArrayBuffer(10));
    await almacen.escribir("capa/needle3-reflejo/trozo/2", new ArrayBuffer(10));

    const resultado = await capaEnPropio(almacen, sha256);
    expect(resultado).toBe(false);
  });

  it("devuelve false si la meta dice incompleta", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha256 = "a".repeat(64);
    const meta = { sha256, completa: false, totalTrozos: 3 };
    await almacen.escribir("capa/needle3-reflejo/meta", new TextEncoder().encode(JSON.stringify(meta)).buffer);
    await almacen.escribir("capa/needle3-reflejo/trozo/0", new ArrayBuffer(10));
    await almacen.escribir("capa/needle3-reflejo/trozo/1", new ArrayBuffer(10));
    await almacen.escribir("capa/needle3-reflejo/trozo/2", new ArrayBuffer(10));

    const resultado = await capaEnPropio(almacen, sha256);
    expect(resultado).toBe(false);
  });

  it("devuelve false si no hay meta para ese SHA", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha256 = "a".repeat(64);
    // almacén vacío

    const resultado = await capaEnPropio(almacen, sha256);
    expect(resultado).toBe(false);
  });
});

describe("pedirCapa — selección de fuente por orden §6", () => {
  it("devuelve propio si la capa ya está en el almacén local", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha256 = "a".repeat(64);
    const meta = { sha256, completa: true, totalTrozos: 2 };
    await almacen.escribir("capa/needle3-reflejo/meta", new TextEncoder().encode(JSON.stringify(meta)).buffer);
    await almacen.escribir("capa/needle3-reflejo/trozo/0", new ArrayBuffer(10));
    await almacen.escribir("capa/needle3-reflejo/trozo/1", new ArrayBuffer(10));

    const { malla } = crearMallaFalsa([]);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa(sha256, ctx);
    expect(resultado.fuente).not.toBeNull();
    expect(resultado.fuente?.tipo).toBe("propio");
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