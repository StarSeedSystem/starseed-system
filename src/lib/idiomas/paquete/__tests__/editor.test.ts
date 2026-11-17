import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CLAVE_EDITOR,
  inyectarAlmacen,
  abrirEdicion,
  paqueteEnEdicion,
  anadirPendiente,
  traducir,
  pendientes,
  completadas,
  cerrarEdicion,
  publicarBorrador,
  type EstadoEditor,
  type AlmacenEditor,
} from "../editor";
import { normalizarTexto } from "../../catalogo";
import { inyectarCrypto, type CryptoProvider } from "../formato";

function crearAlmacenFalso(): AlmacenEditor {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => { datos.set(clave, valor); },
    removeItem: (clave: string) => { datos.delete(clave); },
  };
}

const cryptoMock: CryptoProvider = {
  subtle: {
    async digest(_algorithm: "SHA-256", data: ArrayBuffer): Promise<ArrayBuffer> {
      const view = new Uint8Array(data);
      let hash = 0;
      for (let i = 0; i < view.length; i++) {
        hash = (hash * 31 + view[i]) >>> 0;
      }
      const buffer = new ArrayBuffer(32);
      const out = new Uint8Array(buffer);
      for (let i = 0; i < 32; i++) {
        out[i] = (hash >> (i % 8)) & 0xff;
      }
      return buffer;
    },
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  inyectarCrypto(cryptoMock);
  inyectarAlmacen(null);
  const almacenFalso = crearAlmacenFalso();
  inyectarAlmacen(almacenFalso);
});

describe("editor de paquete de idioma", () => {
  describe("abrirEdicion y paqueteEnEdicion", () => {
    it("crea un nuevo estado de edición vacío", () => {
      abrirEdicion("es-ES", "Español");
      const estado = paqueteEnEdicion();
      expect(estado).not.toBeNull();
      expect(estado?.codigo).toBe("es-ES");
      expect(estado?.nombre).toBe("Español");
      expect(estado?.pendientes.size).toBe(0);
      expect(estado?.completadas.size).toBe(0);
    });

    it("reemplaza edición anterior", () => {
      abrirEdicion("es-ES", "Español");
      anadirPendiente("hola");
      abrirEdicion("fr-FR", "Francés");
      const estado = paqueteEnEdicion();
      expect(estado?.codigo).toBe("fr-FR");
      expect(estado?.pendientes.size).toBe(0);
    });

    it("no hace nada con código o nombre vacíos", () => {
      abrirEdicion("", "Español");
      expect(paqueteEnEdicion()).toBeNull();
      abrirEdicion("es-ES", "");
      expect(paqueteEnEdicion()).toBeNull();
    });
  });

  describe("persistencia y recarga", () => {
    it("guarda el estado en el almacén", () => {
      const almacenFalso = crearAlmacenFalso();
      inyectarAlmacen(almacenFalso);
      abrirEdicion("es-ES", "Español");
      anadirPendiente("hola mundo");
      const guardado = almacenFalso.getItem(CLAVE_EDITOR);
      expect(guardado).not.toBeNull();
      const parsed = JSON.parse(guardado!);
      expect(parsed.codigo).toBe("es-ES");
      expect(parsed.nombre).toBe("Español");
    });

    it("recupera el estado tras recargar (inyectar almacén)", () => {
      const almacenFalso = crearAlmacenFalso();
      inyectarAlmacen(almacenFalso);
      abrirEdicion("es-ES", "Español");
      anadirPendiente("hola");
      traducir("hola", "hello");

      inyectarAlmacen(null);
      inyectarAlmacen(almacenFalso);

      const estado = paqueteEnEdicion();
      expect(estado?.codigo).toBe("es-ES");
      expect(pendientes()).toEqual([]);
      expect(completadas().get("hola")).toBe("hello");
    });
  });

  describe("anadirPendiente", () => {
    beforeEach(() => {
      abrirEdicion("es-ES", "Español");
    });

    it("añade texto normalizado", () => {
      const resultado = anadirPendiente("  hola   mundo  ");
      expect(resultado).toBe(true);
      expect(pendientes()).toContain("hola mundo");
    });

    it("ignora texto vacío tras normalizar", () => {
      expect(anadirPendiente("")).toBe(false);
      expect(anadirPendiente("   ")).toBe(false);
      expect(anadirPendiente("\t\n")).toBe(false);
      expect(pendientes()).toHaveLength(0);
    });

    it("ignora texto de más de 500 caracteres", () => {
      const largo = "a".repeat(501);
      expect(anadirPendiente(largo)).toBe(false);
      expect(pendientes()).toHaveLength(0);
    });

    it("acepta texto de exactamente 500 caracteres", () => {
      const exacto = "a".repeat(500);
      expect(anadirPendiente(exacto)).toBe(true);
      expect(pendientes()).toHaveLength(1);
    });

    it("ignora duplicados en pendientes", () => {
      anadirPendiente("hola");
      expect(anadirPendiente("hola")).toBe(false);
      expect(pendientes()).toHaveLength(1);
    });

    it("ignora duplicados ya en completadas", () => {
      anadirPendiente("hola");
      traducir("hola", "hello");
      expect(anadirPendiente("hola")).toBe(false);
      expect(pendientes()).toHaveLength(0);
    });

    it("respeta el tope de 2000 pendientes", () => {
      for (let i = 0; i < 2000; i++) {
        expect(anadirPendiente(`clave${i}`)).toBe(true);
      }
      expect(anadirPendiente("extra")).toBe(false);
      expect(pendientes()).toHaveLength(2000);
    });

    it("devuelve false si no hay edición abierta", () => {
      cerrarEdicion();
      expect(anadirPendiente("hola")).toBe(false);
    });
  });

  describe("traducir", () => {
    beforeEach(() => {
      abrirEdicion("es-ES", "Español");
      anadirPendiente("hola");
      anadirPendiente("adios");
    });

    it("mueve de pendientes a completadas", () => {
      expect(traducir("hola", "hello")).toBe(true);
      expect(pendientes()).toEqual(["adios"]);
      expect(completadas().get("hola")).toBe("hello");
    });

    it("normaliza el valor de la traducción", () => {
      traducir("hola", "  hello  world  ");
      expect(completadas().get("hola")).toBe("hello world");
    });

    it("ignora valor vacío tras normalizar", () => {
      expect(traducir("hola", "")).toBe(false);
      expect(traducir("hola", "   ")).toBe(false);
      expect(pendientes()).toContain("hola");
      expect(completadas().has("hola")).toBe(false);
    });

    it("devuelve false si la clave no está en pendientes", () => {
      expect(traducir("noexiste", "hello")).toBe(false);
    });

    it("devuelve false si no hay edición abierta", () => {
      cerrarEdicion();
      expect(traducir("hola", "hello")).toBe(false);
    });
  });

  describe("pendientes y completadas", () => {
    beforeEach(() => {
      abrirEdicion("es-ES", "Español");
    });

    it("pendientes devuelve array de claves", () => {
      anadirPendiente("uno");
      anadirPendiente("dos");
      expect(pendientes()).toEqual(["uno", "dos"]);
    });

    it("completadas devuelve mapa independiente", () => {
      anadirPendiente("hola");
      traducir("hola", "hello");
      const mapa = completadas();
      mapa.set("hola", "modificado");
      expect(completadas().get("hola")).toBe("hello");
    });

    it("devuelven vacíos si no hay edición", () => {
      cerrarEdicion();
      expect(pendientes()).toEqual([]);
      expect(completadas().size).toBe(0);
    });
  });

  describe("cerrarEdicion", () => {
    it("limpia el estado y el almacén", () => {
      const almacenFalso = crearAlmacenFalso();
      inyectarAlmacen(almacenFalso);
      abrirEdicion("es-ES", "Español");
      anadirPendiente("hola");
      cerrarEdicion();
      expect(paqueteEnEdicion()).toBeNull();
      expect(almacenFalso.getItem(CLAVE_EDITOR)).toBeNull();
    });
  });

  describe("publicarBorrador", () => {
    beforeEach(() => {
      abrirEdicion("es-ES", "Español");
    });

    it("devuelve null si no hay completadas", async () => {
      const paquete = await publicarBorrador();
      expect(paquete).toBeNull();
    });

    it("devuelve null si no hay edición abierta", async () => {
      cerrarEdicion();
      const paquete = await publicarBorrador();
      expect(paquete).toBeNull();
    });

    it("crea paquete solo con entradas completadas", async () => {
      anadirPendiente("hola");
      anadirPendiente("adios");
      traducir("hola", "hello");
      const paquete = await publicarBorrador();
      expect(paquete).not.toBeNull();
      expect(paquete?.codigo).toBe("es-ES");
      expect(paquete?.nombre).toBe("Español");
      expect(paquete?.entradas.hola).toBe("hello");
      expect(paquete?.entradas.adios).toBeUndefined();
      expect(paquete?.revisado.estado).toBe("automatico");
      expect(paquete?.base).toBe("es");
      expect(paquete?.formato).toBe("starseed-idioma");
      expect(paquete?.version).toBe(1);
    });

    it("incluye autor por defecto", async () => {
      anadirPendiente("hola");
      traducir("hola", "hello");
      const paquete = await publicarBorrador();
      expect(paquete?.autor.nombre).toBe("Editor StarSeed");
    });

    it("incluye licencia MIT por defecto", async () => {
      anadirPendiente("hola");
      traducir("hola", "hello");
      const paquete = await publicarBorrador();
      expect(paquete?.licencia).toBe("MIT");
    });
  });

  describe("inyectarAlmacen", () => {
    it("permite inyectar almacen personalizado", () => {
      const almacenFalso = crearAlmacenFalso();
      inyectarAlmacen(almacenFalso);
      abrirEdicion("es-ES", "Español");
      expect(almacenFalso.getItem(CLAVE_EDITOR)).not.toBeNull();
    });

    it("limpia estado al inyectar null", () => {
      const almacenFalso = crearAlmacenFalso();
      inyectarAlmacen(almacenFalso);
      abrirEdicion("es-ES", "Español");
      inyectarAlmacen(null);
      expect(paqueteEnEdicion()).toBeNull();
    });
  });
});