/**
 * repartir.test.ts — Pruebas puras para pedirCapa (sin red, sin disco real).
 * Usa malla y almacén en memoria.
 */
import { describe, expect, it } from "vitest";
import {
  almacenamientoEnMemoria,
  type Almacenamiento,
} from "@/lib/astraura/capas/almacen";
import {
  capaEnPropio,
  pedirCapa,
  type ConsultaCapa,
  type RespuestaCapa,
  type ContextoPedido,
} from "@/lib/astraura/capas/repartir";
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

const SHA_CATALOGO = "a".repeat(64);
const SHA_AJENO = "b".repeat(64);

function bytesDe(texto: string): ArrayBuffer {
  return new TextEncoder().encode(texto).buffer;
}

async function escribirMeta(
  almacen: Almacenamiento,
  id: string,
  meta: { sha256: string; completa: boolean; totalTrozos: number },
): Promise<void> {
  await almacen.escribir(`capa/${id}/meta`, bytesDe(JSON.stringify(meta)));
}

async function escribirTrozos(
  almacen: Almacenamiento,
  id: string,
  indices: number[],
): Promise<void> {
  for (const i of indices) {
    await almacen.escribir(`capa/${id}/trozo/${i}`, new ArrayBuffer(8));
  }
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

describe("capaEnPropio — capa completa y verificada en el almacén local", () => {
  it("devuelve true si el SHA está en el catálogo, la meta está completa y están todos los trozos", async () => {
    const almacen = almacenamientoEnMemoria();
    await escribirMeta(almacen, "needle3-reflejo", {
      sha256: SHA_CATALOGO,
      completa: true,
      totalTrozos: 3,
    });
    await escribirTrozos(almacen, "needle3-reflejo", [0, 1, 2]);

    expect(await capaEnPropio(almacen, crearCatalogoFalso(), SHA_CATALOGO)).toBe(true);
  });

  it("devuelve false si falta un trozo", async () => {
    const almacen = almacenamientoEnMemoria();
    await escribirMeta(almacen, "needle3-reflejo", {
      sha256: SHA_CATALOGO,
      completa: true,
      totalTrozos: 3,
    });
    await escribirTrozos(almacen, "needle3-reflejo", [0, 1]);

    expect(await capaEnPropio(almacen, crearCatalogoFalso(), SHA_CATALOGO)).toBe(false);
  });

  it("devuelve false si el SHA de la meta no coincide", async () => {
    const almacen = almacenamientoEnMemoria();
    await escribirMeta(almacen, "needle3-reflejo", {
      sha256: SHA_AJENO,
      completa: true,
      totalTrozos: 3,
    });
    await escribirTrozos(almacen, "needle3-reflejo", [0, 1, 2]);

    expect(await capaEnPropio(almacen, crearCatalogoFalso(), SHA_CATALOGO)).toBe(false);
  });

  it("devuelve false si la meta dice incompleta", async () => {
    const almacen = almacenamientoEnMemoria();
    await escribirMeta(almacen, "needle3-reflejo", {
      sha256: SHA_CATALOGO,
      completa: false,
      totalTrozos: 3,
    });
    await escribirTrozos(almacen, "needle3-reflejo", [0, 1, 2]);

    expect(await capaEnPropio(almacen, crearCatalogoFalso(), SHA_CATALOGO)).toBe(false);
  });

  it("devuelve false si el SHA no está en el catálogo firmado", async () => {
    const almacen = almacenamientoEnMemoria();
    await escribirMeta(almacen, "needle3-reflejo", {
      sha256: SHA_AJENO,
      completa: true,
      totalTrozos: 3,
    });
    await escribirTrozos(almacen, "needle3-reflejo", [0, 1, 2]);

    expect(await capaEnPropio(almacen, crearCatalogoFalso(), SHA_AJENO)).toBe(false);
  });

  it("devuelve false si el almacén está vacío", async () => {
    const almacen = almacenamientoEnMemoria();

    expect(await capaEnPropio(almacen, crearCatalogoFalso(), SHA_CATALOGO)).toBe(false);
  });
});

describe("pedirCapa — selección de fuente por orden §6", () => {
  it("devuelve propio si la capa ya está en el almacén local", async () => {
    const almacen = almacenamientoEnMemoria();
    await escribirMeta(almacen, "needle3-reflejo", {
      sha256: SHA_CATALOGO,
      completa: true,
      totalTrozos: 2,
    });
    await escribirTrozos(almacen, "needle3-reflejo", [0, 1]);

    const { malla } = crearMallaFalsa([]);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa(SHA_CATALOGO, ctx);
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