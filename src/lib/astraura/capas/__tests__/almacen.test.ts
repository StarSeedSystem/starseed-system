import { describe, it, expect, vi } from "vitest";
import type { EntradaCapa } from "./catalogo";
import { AlmacenCapas, verificarSHA256 } from "./almacen";

const entradaBase: EntradaCapa = {
  id: "prueba-1",
  familia: "familia/prueba",
  capa: "palabra",
  modelo: "ternary-bonsai-4b",
  version: "1.0",
  formato: "gguf",
  runtime: "llama-cpp",
  parametros: "4 B",
  disco_mb: 500,
  ram_min_mb: 1024,
  sha256: "a".repeat(64),
  fuente_oficial: "https://huggingface.co/familia/prueba",
  espejos: [],
  estado: "recomendado",
  medios: ["web", "pwa", "nativo", "servidor"],
};

describe("verificarSHA256", () => {
  it("devuelve true para SHA válido", async () => {
    const datos = new Uint8Array(32).fill(65);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", datos)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const result = await verificarSHA256(datos.buffer, hash);
    expect(result).toBe(true);
  });

  it("devuelve false para SHA inválido", async () => {
    const result = await verificarSHA256(new ArrayBuffer(32), "b".repeat(64));
    expect(result).toBe(false);
  });
});

describe("AlmacenCapas (memoria)", () => {
  let almacen: AlmacenCapas;

  beforeEach(() => {
    const capas = new Map<string, any>();
    const memoria = { tipo: "memoria", capas };
    almacen = new AlmacenCapas(memoria);
  });

  it("guarda una capa cuando el SHA coincide", async () => {
    const trozos = Array.from({ length: 3 }, (_, i) => {
      const buf = new ArrayBuffer(100);
      const view = new Uint8Array(buf);
      view.fill(i + 1);
      return buf;
    });

    const result = await almacen.guardarCapa(entradaBase, trozos);
    expect(result).toBe(true);
    expect(almacen.estado()).toHaveLength(1);

    const capas = almacen.estado();
    expect(capas[0].id).toBe(entradaBase.id);
    expect(capas[0].sha256).toBe(entradaBase.sha256);
    expect(capas[0].tamañoBytes).toBe(300);
    expect(capas[0].estado).toBe("normal");
  });

  it("rechaza cuando el SHA no coincide", async () => {
    const trozos = Array.from({ length: 3 }, (_, i) => {
      const buf = new ArrayBuffer(100);
      const view = new Uint8Array(buf);
      view.fill(i + 1);
      return buf;
    });

    const result = await almacen.guardarCapa({ ...entradaBase, sha256: "b".repeat(64) }, trozos);
    expect(result).toBe(false);
    expect(almacen.estado()).toHaveLength(0);
  });

  it("abre una capa existente", async () => {
    const trozos = Array.from({ length: 3 }, (_, i) => {
      const buf = new ArrayBuffer(100);
      const view = new Uint8Array(buf);
      view.fill(i + 1);
      return buf;
    });
    await almacen.guardarCapa(entradaBase, trozos);

    const datos = await almacen.abrirCapa(entradaBase.id);
    expect(datos).toBeInstanceOf(ArrayBuffer);
    expect((datos as ArrayBuffer).byteLength).toBe(300);
  });

  it("devuelve null cuando la capa no existe", async () => {
    const datos = await almacen.abrirCapa("no-existe");
    expect(datos).toBe(null);
  });

  it("expulsa capas según presupuesto", async () => {
    const trozos = Array.from({ length: 3 }, (_, i) => {
      const buf = new ArrayBuffer(100);
      return buf;
    });
    await almacen.guardarCapa(entradaBase, trozos);

    const presupuesto = { maxBytes: 1_000, maxMemoriaBytes: 1_000, presupuestoDiscoBytes: 200 };
    almacen.hacerSitio(presupuesto);

    const capas = almacen.estado();
    expect(capas).toHaveLength(0);
  });

  it("protege capas fijadas durante la expulsión", async () => {
    const trozos = Array.from({ length: 3 }, (_, i) => {
      const buf = new ArrayBuffer(100);
      return buf;
    });
    await almacen.guardarCapa(entradaBase, trozos);

    almacen.fijar(entradaBase.id, true);
    const presupuesto = { maxBytes: 1_000, maxMemoriaBytes: 1_000, presupuestoDiscoBytes: 200 };
    almacen.hacerSitio(presupuesto);

    const capas = almacen.estado();
    expect(capas).toHaveLength(1);
    expect(capas[0].estado).toBe("fijada");
  });

  it("fija y des fija capas", async () => {
    const trozos = Array.from({ length: 3 }, (_, i) => {
      const buf = new ArrayBuffer(100);
      return buf;
    });
    await almacen.guardarCapa(entradaBase, trozos);

    almacen.fijar(entradaBase.id, true);
    let capas = almacen.estado();
    expect(capas[0].estado).toBe("fijada");

    almacen.fijar(entradaBase.id, false);
    capas = almacen.estado();
    expect(capas[0].estado).toBe("normal");
  });

  it("descarga capas de forma resumible", async () => {
    const trozos = Array.from({ length: 3 }, (_, i) => {
      const buf = new ArrayBuffer(100);
      return buf;
    });
    await almacen.guardarCapa(entradaBase, trozos);

    const fuente = vi.fn().mockResolvedValue(new ArrayBuffer(300));
    await almacen.descargarResume(entradaBase.id, fuente);

    expect(fuente).toHaveBeenCalled();
    const capas = almacen.estado();
    expect(capas[0].datos.byteLength).toBe(300);
  });
});