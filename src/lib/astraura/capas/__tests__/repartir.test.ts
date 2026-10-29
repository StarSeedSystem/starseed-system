/**
 * repartir.test.ts — Pruebas puras para pedirCapa (sin red, sin disco real).
 * Usa malla y almacén en memoria.
 */
import { describe, expect, it } from "vitest";
import { AlmacenCapas, almacenamientoEnMemoria, type TrozoCapa } from "@/lib/astraura/capas/almacen";
import { pedirCapa, capaEnPropio, type ConsultaCapa, type RespuestaCapa, type ContextoPedido } from "@/lib/astraura/capas/repartir";
import type { EntradaCapa } from "@/lib/astraura/capas/catalogo";

/** Texto → ArrayBuffer, sin depender del buffer subyacente de TextEncoder. */
const aBuffer = (texto: string): ArrayBuffer => {
  const bytes = new TextEncoder().encode(texto);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const shaDe = async (datos: ArrayBuffer): Promise<string> => {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const concatenar = (partes: ArrayBuffer[]): ArrayBuffer => {
  const total = partes.reduce((s, p) => s + p.byteLength, 0);
  const entero = new Uint8Array(total);
  let desplaza = 0;
  for (const p of partes) {
    entero.set(new Uint8Array(p), desplaza);
    desplaza += p.byteLength;
  }
  return entero.buffer;
};

/** Entrada de catálogo con el SHA real de los trozos, y los trozos con su SHA por trozo. */
async function capaDeTrozos(textos: string[]): Promise<{ entrada: EntradaCapa; trozos: TrozoCapa[] }> {
  const partes = textos.map(aBuffer);
  const sha = await shaDe(concatenar(partes));
  const trozos: TrozoCapa[] = [];
  for (let i = 0; i < partes.length; i++) {
    trozos.push({ indice: i, sha256: await shaDe(partes[i]), datos: partes[i] });
  }
  const entrada: EntradaCapa = { ...crearCatalogoFalso()[0], sha256: sha };
  return { entrada, trozos };
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
  it("devuelve true si la capa completa y verificada está en el almacén", async () => {
    const { entrada, trozos } = await capaDeTrozos(["HOLA-", "MUNDO-", "OK"]);
    const almacen = almacenamientoEnMemoria();
    const almacenador = new AlmacenCapas(almacen);
    expect((await almacenador.guardarCapa(entrada, trozos)).ok).toBe(true);
    expect(await capaEnPropio(almacen, entrada.sha256)).toBe(true);
  });

  it("devuelve false mientras falta un trozo (descarga reanudable sin terminar)", async () => {
    const { entrada, trozos } = await capaDeTrozos(["HOLA-", "MUNDO-", "OK"]);
    const almacen = almacenamientoEnMemoria();
    const almacenador = new AlmacenCapas(almacen);
    await almacenador.guardarTrozo(entrada, trozos[0]);
    await almacenador.guardarTrozo(entrada, trozos[1]);
    // El trozo 2 no llegó: la capa no está completa.
    expect(await capaEnPropio(almacen, entrada.sha256)).toBe(false);
  });

  it("devuelve false si se pregunta por otro SHA", async () => {
    const { entrada, trozos } = await capaDeTrozos(["HOLA-", "MUNDO-"]);
    const almacen = almacenamientoEnMemoria();
    const almacenador = new AlmacenCapas(almacen);
    expect((await almacenador.guardarCapa(entrada, trozos)).ok).toBe(true);
    expect(await capaEnPropio(almacen, "b".repeat(64))).toBe(false);
  });

  it("devuelve false con el almacén vacío", async () => {
    expect(await capaEnPropio(almacenamientoEnMemoria(), "a".repeat(64))).toBe(false);
  });

  it("descarta metas incompletas o corruptas sin lanzar", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha256 = "a".repeat(64);
    const metaIncompleta = { sha256, completa: false, totalTrozos: 2 };
    const metaCorrupta = "no-es-json";
    await almacen.escribir("capa/capa-a/meta", aBuffer(JSON.stringify(metaIncompleta)));
    await almacen.escribir("capa/capa-b/meta", aBuffer(metaCorrupta));
    for (const i of [0, 1]) {
      await almacen.escribir(`capa/capa-a/trozo/${i}`, aBuffer("pedazo"));
      await almacen.escribir(`capa/capa-b/trozo/${i}`, aBuffer("pedazo"));
    }
    expect(await capaEnPropio(almacen, sha256)).toBe(false);
  });

  it("no cuenta como completa una capa con más trozos de los que anuncia la meta", async () => {
    const { entrada, trozos } = await capaDeTrozos(["HOLA-", "MUNDO-"]);
    const almacen = almacenamientoEnMemoria();
    const almacenador = new AlmacenCapas(almacen);
    expect((await almacenador.guardarCapa(entrada, trozos)).ok).toBe(true);
    await almacen.escribir("capa/needle3-reflejo/trozo/99", aBuffer("desconocido"));
    expect(await capaEnPropio(almacen, entrada.sha256)).toBe(false);
  });

  it("no cuenta como completa una capa con un hueco entre trozos", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha256 = "a".repeat(64);
    const meta = { sha256, completa: true, totalTrozos: 3 };
    await almacen.escribir("capa/needle3-reflejo/meta", aBuffer(JSON.stringify(meta)));
    // Están el 0, el 1 y el 3, pero falta el 2: hay tres trozos, no la capa entera.
    for (const i of [0, 1, 3]) {
      await almacen.escribir(`capa/needle3-reflejo/trozo/${i}`, aBuffer(`trozo-${i}`));
    }
    expect(await capaEnPropio(almacen, sha256)).toBe(false);
  });
});

describe("pedirCapa — selección de fuente por orden §6", () => {
  it("devuelve propio si la capa ya está en el almacén local", async () => {
    const { entrada, trozos } = await capaDeTrozos(["HOLA-", "MUNDO-"]);
    const almacen = almacenamientoEnMemoria();
    const almacenador = new AlmacenCapas(almacen);
    expect((await almacenador.guardarCapa(entrada, trozos)).ok).toBe(true);

    const { malla } = crearMallaFalsa([]);
    const ctx: ContextoPedido = {
      catalogo: crearCatalogoFalso(),
      almacen,
      malla,
      permitirPublicos: true,
      timeoutMs: 100,
    };
    const resultado = await pedirCapa(entrada.sha256, ctx);
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