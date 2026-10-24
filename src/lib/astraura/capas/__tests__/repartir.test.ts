/**
 * repartir.test.ts — Pruebas puras para pedirCapa (sin red, sin disco real).
 * Usa malla y almacén en memoria.
 */
import { describe, expect, it, vi } from "vitest";
import { almacenamientoEnMemoria, AlmacenCapas, type TrozoCapa } from "@/lib/astraura/capas/almacen";
import { pedirCapa, capaEnPropio, type ConsultaCapa, type RespuestaCapa, type ContextoPedido, type ResultadoPedido } from "@/lib/astraura/capas/repartir";
import type { EntradaCapa } from "@/lib/astraura/capas/catalogo";

/** SHA-256 hex de unos datos (globalThis.crypto, igual que el almacén). */
async function shaHex(datos: ArrayBuffer): Promise<string> {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

function trozos(datosTotales: Uint8Array, tamanoTrozo: number): Promise<{ trozos: TrozoCapa[]; shaTotal: string }> {
  return (async () => {
    const trozos: TrozoCapa[] = [];
    for (let i = 0; i * tamanoTrozo < datosTotales.byteLength; i++) {
      const datos = datosTotales.slice(i * tamanoTrozo, (i + 1) * tamanoTrozo);
      trozos.push({ indice: i, sha256: await shaHex(datos.buffer as ArrayBuffer), datos: datos.buffer as ArrayBuffer });
    }
    return { trozos, shaTotal: await shaHex(datosTotales.buffer as ArrayBuffer) };
  })();
}

describe("capaEnPropio — cruce del SHA con el catálogo y los trozos del almacén", () => {
  it("devuelve true con el almacén completo (capa guardada por AlmacenCapas)", async () => {
    const datosTotales = new Uint8Array(70);
    for (let i = 0; i < datosTotales.byteLength; i++) datosTotales[i] = (i * 7 + 3) % 256;
    const { trozos: ts, shaTotal } = await trozos(datosTotales, 30);
    const catalogo = crearCatalogoFalso();
    catalogo[0].sha256 = shaTotal;
    const almacen = almacenamientoEnMemoria();
    const capas = new AlmacenCapas(almacen);
    expect(await capas.guardarCapa(catalogo[0], ts)).toEqual({ ok: true });
    expect(await capaEnPropio(almacen, catalogo, shaTotal)).toBe(true);
  });

  it("devuelve false si falta un trozo", async () => {
    const datosTotales = new Uint8Array(70);
    for (let i = 0; i < datosTotales.byteLength; i++) datosTotales[i] = (i * 7 + 3) % 256;
    const { trozos: ts, shaTotal } = await trozos(datosTotales, 30);
    const catalogo = crearCatalogoFalso();
    catalogo[0].sha256 = shaTotal;
    const almacen = almacenamientoEnMemoria();
    const capas = new AlmacenCapas(almacen);
    expect(await capas.guardarCapa(catalogo[0], ts)).toEqual({ ok: true });
    await almacen.borrar(`capa/${catalogo[0].id}/trozo/1`);
    expect(await capaEnPropio(almacen, catalogo, shaTotal)).toBe(false);
  });

  it("devuelve false con otro SHA (aunque haya datos en el almacén)", async () => {
    const datosTotales = new Uint8Array(70);
    for (let i = 0; i < datosTotales.byteLength; i++) datosTotales[i] = (i * 7 + 3) % 256;
    const { trozos: ts, shaTotal } = await trozos(datosTotales, 30);
    const catalogo = crearCatalogoFalso();
    catalogo[0].sha256 = shaTotal;
    const almacen = almacenamientoEnMemoria();
    const capas = new AlmacenCapas(almacen);
    expect(await capas.guardarCapa(catalogo[0], ts)).toEqual({ ok: true });
    expect(await capaEnPropio(almacen, catalogo, "b".repeat(64))).toBe(false);
  });

  it("devuelve false si el SHA pedido no está en el catálogo", async () => {
    const almacen = almacenamientoEnMemoria();
    expect(await capaEnPropio(almacen, crearCatalogoFalso(), "c".repeat(64))).toBe(false);
  });

  it("pedirCapa devuelve «propio» cuando la capa ya está completa en el almacén", async () => {
    const datosTotales = new Uint8Array(70);
    for (let i = 0; i < datosTotales.byteLength; i++) datosTotales[i] = (i * 7 + 3) % 256;
    const { trozos: ts, shaTotal } = await trozos(datosTotales, 30);
    const catalogo = crearCatalogoFalso();
    catalogo[0].sha256 = shaTotal;
    const almacen = almacenamientoEnMemoria();
    const capas = new AlmacenCapas(almacen);
    expect(await capas.guardarCapa(catalogo[0], ts)).toEqual({ ok: true });
    const { malla } = crearMallaFalsa([]);
    const ctx: ContextoPedido = { catalogo, almacen, malla, permitirPublicos: true, timeoutMs: 100 };
    const resultado = await pedirCapa(shaTotal, ctx);
    expect(resultado.fuente?.tipo).toBe("propio");
  });
});

describe("pedirCapa — selección de fuente por orden §6", () => {
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