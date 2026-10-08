import { describe, it, expect } from "vitest";
import {
  AlmacenEnMemoria,
  sha256Buffer,
  persistirSiSupera50MB,
  type TrozoCapa,
  type EntradaCapaCatalogo,
} from "../almacen";

function bufferDeTexto(texto: string): ArrayBuffer {
  return new TextEncoder().encode(texto).buffer;
}

function hexSha256(buf: ArrayBuffer): Promise<string> {
  return sha256Buffer(buf);
}

describe("sha256Buffer", () => {
  it("devuelve 64 hexadecimales consistentes", async () => {
    const hash = await sha256Buffer(bufferDeTexto("prueba"));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("AlmacenEnMemoria", () => {
  it("rechaza trozo con SHA-256 incorrecto", async () => {
    const almac = new AlmacenEnMemoria();
    const trozoMalo: TrozoCapa = {
      indice: 0,
      sha256: "a".repeat(64),
      datos: bufferDeTexto("contenido"),
    };
    await expect(
      almac.guardarCapa({ id: "capa-1", sha256: "b".repeat(64) }, [trozoMalo])
    ).rejects.toThrow("Trozo 0 SHA-256 incorrecto");
  });

  it("rechaza archivo completo con SHA-256 incorrecto", async () => {
    const almac = new AlmacenEnMemoria();
    const datos = bufferDeTexto("archivo completo válido");
    const shaReal = await hexSha256(datos);
    const trozo: TrozoCapa = {
      indice: 0,
      sha256: shaReal,
      datos,
    };
    await expect(
      almac.guardarCapa({ id: "capa-2", sha256: "c".repeat(64) }, [trozo])
    ).rejects.toThrow("Archivo completo SHA-256 incorrecto");
  });

  it("guarda capa con trozos correctos y permite abrir", async () => {
    const almac = new AlmacenEnMemoria();
    const datos = bufferDeTexto("archivo completo válido");
    const sha = await hexSha256(datos);
    const trozo: TrozoCapa = { indice: 0, sha256: sha, datos };
    const id = await almac.guardarCapa({ id: "capa-ok", sha256: sha }, [trozo]);
    expect(id).toBe("capa-ok");
    const abierto = await almac.abrirCapa("capa-ok");
    expect(abierto).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(abierto as ArrayBuffer)).toBe("archivo completo válido");
  });

  it("reanudación retoma progreso por trozo", async () => {
    const almac = new AlmacenEnMemoria();
    const datos = bufferDeTexto("reanudable");
    const sha = await hexSha256(datos);
    const trozo: TrozoCapa = { indice: 0, sha256: sha, datos };
    await almac.guardarCapa({ id: "reanudable", sha256: sha }, [trozo]);
    expect((almac as any).reanudarProgreso).toBeDefined();
    const retomo = (almac as AlmacenEnMemoria).reanudarProgreso("reanudable", [trozo]);
    expect(retomo).toBe(true);
  });

  it("hacerSitio expulsa LRU sin tocar fijadas", async () => {
    const almac = new AlmacenEnMemoria();
    const datos = bufferDeTexto("lru test");
    const sha = await hexSha256(datos);
    const trozo: TrozoCapa = { indice: 0, sha256: sha, datos };
    await almac.guardarCapa({ id: "lru", sha256: sha }, [trozo]);
    await almac.fijar("lru", true);
    const liberado = await almac.hacerSitio(0, { presupuestoBytes: 0 });
    expect(liberado).toBe(0);
    const estado = await almac.estado();
    expect(estado["lru"]).toBeDefined();
  });

  it("fijar protege capa de expulsión", async () => {
    const almac = new AlmacenEnMemoria();
    const datos = bufferDeTexto("fijada");
    const sha = await hexSha256(datos);
    await almac.guardarCapa({ id: "fijada", sha256: sha }, [{ indice: 0, sha256: sha, datos }]);
    await almac.fijar("fijada", true);
    const e = await almac.estado();
    expect(e["fijada"].fijada).toBe(true);
  });

  it("estado devuelve capas con tamaño, último uso y fijada", async () => {
    const almac = new AlmacenEnMemoria();
    const datos = bufferDeTexto("estado");
    const sha = await hexSha256(datos);
    await almac.guardarCapa({ id: "s1", sha256: sha }, [{ indice: 0, sha256: sha, datos }]);
    const e = await almac.estado();
    expect(e["s1"].bytes).toBe(datos.byteLength);
    expect(typeof e["s1"].ultimoUso).toBe("number");
    expect(e["s1"].fijada).toBe(false);
  });
});

describe("persistirSiSupera50MB", () => {
  it("no lanza persistencia por debajo de 50 MB", async () => {
    const res = await persistirSiSupera50MB(10 * 1024 * 1024, { presupuestoBytes: 100 * 1024 * 1024 });
    expect(res).toBe(false);
  });

  it("lanza error si excede presupuesto del perfil-medio", async () => {
    await expect(
      persistirSiSupera50MB(60 * 1024 * 1024, { presupuestoBytes: 30 * 1024 * 1024 })
    ).rejects.toThrow("Presupuesto excedido");
  });
});
