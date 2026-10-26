/**
 * repartir.test.ts — Pruebas puras para pedirCapa (sin red, sin disco real).
 * Usa malla y almacén en memoria.
 */
import { describe, expect, it } from "vitest";
import { almacenamientoEnMemoria } from "@/lib/astraura/capas/almacen";
import { pedirCapa, capaEnPropio, type ConsultaCapa, type RespuestaCapa, type ContextoPedido } from "@/lib/astraura/capas/repartir";
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

const bytes = (texto: string): ArrayBuffer => new TextEncoder().encode(texto).buffer;

/** SHA-256 de unos datos, con el mismo método que usa el almacén. */
async function shaDe(datos: ArrayBuffer): Promise<string> {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Une trozos en el archivo completo, en orden (mismo patrón que AlmacenCapas). */
function unir(partes: ArrayBuffer[]): ArrayBuffer {
  const total = partes.reduce((s, p) => s + p.byteLength, 0);
  const entero = new Uint8Array(total);
  let desplaza = 0;
  for (const p of partes) {
    entero.set(new Uint8Array(p), desplaza);
    desplaza += p.byteLength;
  }
  return entero.buffer;
}

/** Capa real de dos trozos: cada trozo y el SHA-256 del archivo entero. */
async function crearCapaReal(): Promise<{ trozos: ArrayBuffer[]; sha256: string }> {
  const trozos = [bytes("capa-cero-de-prueba"), bytes("capa-uno-de-prueba")];
  return { trozos, sha256: await shaDe(unir(trozos)) };
}

describe("capaEnPropio — cruce del SHA con el catálogo y trozos del almacén", () => {
  it("devuelve true con la capa completa: trozos seguidos desde el 0 y SHA-256 del total verificado", async () => {
    const almacen = almacenamientoEnMemoria();
    const { trozos, sha256 } = await crearCapaReal();
    const catalogo = [{ ...crearCatalogoFalso()[0], sha256 }];
    await almacen.escribir("capa/needle3-reflejo/trozo/0", trozos[0]);
    await almacen.escribir("capa/needle3-reflejo/trozo/1", trozos[1]);

    expect(await capaEnPropio(almacen, sha256, catalogo)).toBe(true);
  });

  it("devuelve false si falta un trozo", async () => {
    const almacen = almacenamientoEnMemoria();
    const { trozos, sha256 } = await crearCapaReal();
    const catalogo = [{ ...crearCatalogoFalso()[0], sha256 }];
    await almacen.escribir("capa/needle3-reflejo/trozo/0", trozos[0]);
    // trozo/1 falta

    expect(await capaEnPropio(almacen, sha256, catalogo)).toBe(false);
  });

  it("devuelve false con otro SHA que no está en el catálogo", async () => {
    const almacen = almacenamientoEnMemoria();
    const { trozos, sha256 } = await crearCapaReal();
    const catalogo = [{ ...crearCatalogoFalso()[0], sha256 }];
    await almacen.escribir("capa/needle3-reflejo/trozo/0", trozos[0]);
    await almacen.escribir("capa/needle3-reflejo/trozo/1", trozos[1]);

    expect(await capaEnPropio(almacen, "b".repeat(64), catalogo)).toBe(false);
  });

  it("devuelve false si un trozo no cuadra con el SHA del catálogo (contenido alterado)", async () => {
    const almacen = almacenamientoEnMemoria();
    const { trozos, sha256 } = await crearCapaReal();
    const catalogo = [{ ...crearCatalogoFalso()[0], sha256 }];
    await almacen.escribir("capa/needle3-reflejo/trozo/0", trozos[0]);
    await almacen.escribir("capa/needle3-reflejo/trozo/1", bytes("contenido-alterado"));

    expect(await capaEnPropio(almacen, sha256, catalogo)).toBe(false);
  });

  it("devuelve false si los trozos tienen un hueco (0 y 2, falta el 1)", async () => {
    const almacen = almacenamientoEnMemoria();
    const tercera = bytes("capa-dos-de-prueba");
    const { trozos, sha256 } = await crearCapaReal();
    const catalogo = [{ ...crearCatalogoFalso()[0], sha256 }];
    await almacen.escribir("capa/needle3-reflejo/trozo/0", trozos[0]);
    await almacen.escribir("capa/needle3-reflejo/trozo/2", tercera);

    expect(await capaEnPropio(almacen, sha256, catalogo)).toBe(false);
  });

  it("devuelve false con almacén vacío y con catálogo sin el SHA", async () => {
    const almacen = almacenamientoEnMemoria();
    expect(await capaEnPropio(almacen, "a".repeat(64), crearCatalogoFalso())).toBe(false);
  });
});

describe("pedirCapa — selección de fuente por orden §6", () => {
  it("devuelve propio si la capa ya está en el almacén local", async () => {
    const almacen = almacenamientoEnMemoria();
    const { trozos, sha256 } = await crearCapaReal();
    const catalogo = [{ ...crearCatalogoFalso()[0], sha256 }];
    await almacen.escribir("capa/needle3-reflejo/trozo/0", trozos[0]);
    await almacen.escribir("capa/needle3-reflejo/trozo/1", trozos[1]);

    const { malla, getBroadcast } = crearMallaFalsa([]);
    const ctx: ContextoPedido = {
      catalogo,
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa(sha256, ctx);
    expect(resultado.fuente).not.toBeNull();
    expect(resultado.fuente?.tipo).toBe("propio");
    // Ni pregunta a la malla: la capa ya está verificada en local.
    expect(getBroadcast()).toBeNull();
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