import { describe, it, expect } from "vitest";
import { AlmacenamientoMemoria } from "../almacen";
import { type EntradaCapa } from "../catalogo";

const crearTrozos = (numTrozos: number): ArrayBuffer[] => {
  const trozos: ArrayBuffer[] = [];
  for (let i = 0; i < numTrozos; i++) {
    const arr = new Uint8Array(100);
    arr.fill(i);
    trozos.push(arr.buffer);
  }
  return trozos;
};

const entradaBase: EntradaCapa = {
  id: "prueba-capa",
  familia: "familia/prueba",
  capa: "palabra",
  modelo: "Prueba 1B",
  version: "1.0",
  formato: "gguf",
  runtime: "llama-cpp",
  parametros: "1 B",
  disco_mb: 10,
  ram_min_mb: 512,
  sha256: "6e6d24a65acd5935c0220407efadb384f72d214820beefde564a846386c5d5c4",
  fuente_oficial: "https://huggingface.co/familia/prueba",
  espejos: [],
  estado: "recomendado",
  medios: ["web", "pwa", "nativo", "servidor"],
};

const crearHashDesdeBytes = async (bytes: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hashDeEntradaBase = "6e6d24a65acd5935c0220407efadb384f72d214820beefde564a846386c5d5c4";

describe("AlmacenamientoMemoria", () => {
  describe("guardarCapa", () => {
    it("guarda capas", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(2);
      await almacen.guardarCapa(entradaBase, trozos);
      const estado = almacen.estado();
      expect(estado).toHaveLength(1);
      expect(estado[0].id).toBe(entradaBase.id);
      expect(estado[0].buffer.byteLength).toBe(200);
    });
  });

  describe("abrirCapa", () => {
    it("devuelve buffer para capa guardada", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      const buffer = await almacen.abrirCapa(entradaBase.id);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(buffer as ArrayBuffer)).toEqual(new Uint8Array(trozos[0]));
    });

    it("devuelve null para capa inexistente", async () => {
      const almacen = new AlmacenamientoMemoria();
      const buffer = await almacen.abrirCapa("inexistente");
      expect(buffer).toBeNull();
    });

    it("actualiza lastUse al abrir", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      const antes = Date.now();
      await almacen.abrirCapa(entradaBase.id);
      const estado = almacen.estado();
      expect(estado[0].lastUse).toBeGreaterThan(antes);
    });

    it("progreso de descarga reanudable", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(3);
      await almacen.guardarCapa(entradaBase, trozos);
      const stream = await almacen.abrirCapa(entradaBase.id);
      expect(stream).toBeInstanceOf(ReadableStream);
      if (stream instanceof ReadableStream) {
        const reader = stream.getReader();
        let bytesLeidos = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesLeidos += value.byteLength;
        }
        expect(bytesLeidos).toBe(300);
      }
    });
  });

  describe("hacerSitio", () => {
    it("no hace nada si cabe en presupuesto", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      const perfil: { presupuestoDiscoMb: number; presupuestoMemoriaMb: number } = { presupuestoDiscoMb: 100, presupuestoMemoriaMb: 1000 };
      const carga = { permisoPersistir: async () => true };
      await almacen.hacerSitio(perfil, carga);
      expect(almacen.estado()).toHaveLength(1);
    });

    it("expulsa capas no fijadas cuando se excede presupuesto", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      const perfil: { presupuestoDiscoMb: number; presupuestoMemoriaMb: number } = { presupuestoDiscoMb: 5, presupuestoMemoriaMb: 1000 };
      const carga = { permisoPersistir: async () => true };
      await almacen.hacerSitio(perfil, carga);
      expect(almacen.estado()).toHaveLength(0);
    });

    it("protege capas fijadas de la expulsión", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      almacen.fijar(entradaBase.id, true);
      const perfil: { presupuestoDiscoMb: number; presupuestoMemoriaMb: number } = { presupuestoDiscoMb: 5, presupuestoMemoriaMb: 1000 };
      const carga = { permisoPersistir: async () => true };
      await almacen.hacerSitio(perfil, carga);
      expect(almacen.estado()).toHaveLength(1);
    });

    it("pide permiso de persistir si presupuesto está lleno", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      const perfil: { presupuestoDiscoMb: number; presupuestoMemoriaMb: number } = { presupuestoDiscoMb: 10, presupuestoMemoriaMb: 1000 };
      let permisoOtorgado = false;
      const carga = {
        permisoPersistir: async () => {
          permisoOtorgado = true;
          return true;
        },
      };
      await almacen.hacerSitio(perfil, carga);
      expect(permisoOtorgado).toBe(true);
    });

    it("falla si persistir no es permitido y presupuesto está lleno", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      const perfil: { presupuestoDiscoMb: number; presupuestoMemoriaMb: number } = { presupuestoDiscoMb: 10, presupuestoMemoriaMb: 1000 };
      const carga = { permisoPersistir: async () => false };
      await expect(almacen.hacerSitio(perfil, carga)).rejects.toThrow("persistir no permitido");
    });
  });

  describe("fijar", () => {
    it("fija capa", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      almacen.fijar(entradaBase.id, true);
      const estado = almacen.estado();
      expect(estado[0].fixed).toBe(true);
    });

    it("desfija capa", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      almacen.fijar(entradaBase.id, true);
      almacen.fijar(entradaBase.id, false);
      const estado = almacen.estado();
      expect(estado[0].fixed).toBe(false);
    });
  });

  describe("estado", () => {
    it("devuelve capas con tamaño, lastUse y fixed", async () => {
      const almacen = new AlmacenamientoMemoria();
      const trozos = crearTrozos(1);
      await almacen.guardarCapa(entradaBase, trozos);
      const estado = almacen.estado();
      expect(estado[0]).toMatchObject({
        id: entradaBase.id,
        disco_mb: entradaBase.disco_mb,
        buffer: expect.any(ArrayBuffer),
        lastUse: expect.any(Number),
        fixed: expect.any(Boolean),
      });
    });
  });
});