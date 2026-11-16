import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  abrirEdicion,
  paqueteEnEdicion,
  anadirPendiente,
  traducir,
  pendientes,
  completadas,
  cerrarEdicion,
  publicarBorrador,
  CLAVE_EDITOR,
} from "../editor";
import { normalizarTexto } from "../../catalogo";
import type { PaqueteIdioma } from "../formato";

function crearAlmacenFalso() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => { datos.set(clave, valor); },
    removeItem: (clave: string) => { datos.delete(clave); },
  };
}

type AlmacenEditor = ReturnType<typeof crearAlmacenFalso>;

let almacen: AlmacenEditor;

beforeEach(() => {
  almacen = crearAlmacenFalso();
  vi.stubGlobal("window", { localStorage: almacen });
  cerrarEdicion();
});

describe("editor de paquete de idioma", () => {
  describe("abrirEdicion", () => {
    it("inicia una nueva edición con código y nombre", () => {
      abrirEdicion("fr-FR", "Francés");
      const estado = paqueteEnEdicion();
      expect(estado).not.toBeNull();
      expect(estado?.codigo).toBe("fr-FR");
      expect(estado?.nombre).toBe("Francés");
      expect(estado?.pendientes).toEqual([]);
      expect(estado?.completadas).toEqual({});
    });

    it("persiste el estado en el almacén", () => {
      abrirEdicion("de-DE", "Alemán");
      const guardado = almacen.getItem(CLAVE_EDITOR);
      expect(guardado).not.toBeNull();
      const parsed = JSON.parse(guardado!);
      expect(parsed.codigo).toBe("de-DE");
      expect(parsed.nombre).toBe("Alemán");
    });

    it("sobrescribe edición anterior", () => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("hola");
      abrirEdicion("it-IT", "Italiano");
      const estado = paqueteEnEdicion();
      expect(estado?.codigo).toBe("it-IT");
      expect(estado?.pendientes).toEqual([]);
    });
  });

  describe("paqueteEnEdicion", () => {
    it("devuelve null si no hay edición abierta", () => {
      expect(paqueteEnEdicion()).toBeNull();
    });

    it("recupera el estado tras recargar (almacén falso)", () => {
      abrirEdicion("pt-PT", "Portugués");
      anadirPendiente("olá");
      traducir("olá", "olá");
      // Simular recarga creando nuevo almacen pero con los mismos datos
      const guardado = almacen.getItem(CLAVE_EDITOR);
      const nuevoAlmacen = crearAlmacenFalso();
      if (guardado) nuevoAlmacen.setItem(CLAVE_EDITOR, guardado);
      vi.stubGlobal("window", { localStorage: nuevoAlmacen });

      const estado = paqueteEnEdicion();
      expect(estado).not.toBeNull();
      expect(estado?.codigo).toBe("pt-PT");
      expect(estado?.completadas).toEqual({ "olá": "olá" });
    });
  });

  describe("anadirPendiente", () => {
    beforeEach(() => {
      abrirEdicion("fr-FR", "Francés");
    });

    it("añade texto normalizado a pendientes", () => {
      anadirPendiente("  hola   mundo  ");
      expect(pendientes()).toContain("hola mundo");
    });

    it("ignora texto vacío tras normalizar", () => {
      anadirPendiente("   ");
      anadirPendiente("");
      expect(pendientes()).toHaveLength(0);
    });

    it("ignora textos de más de 500 caracteres", () => {
      const largo = "a".repeat(501);
      anadirPendiente(largo);
      expect(pendientes()).toHaveLength(0);
    });

    it("ignora duplicados (mismo texto normalizado)", () => {
      anadirPendiente("hola");
      anadirPendiente("  hola  ");
      expect(pendientes()).toHaveLength(1);
    });

    it("respeta el tope de 2000 pendientes", () => {
      for (let i = 0; i < 2000; i++) {
        anadirPendiente(`texto ${i}`);
      }
      expect(pendientes()).toHaveLength(2000);
      anadirPendiente("uno más");
      expect(pendientes()).toHaveLength(2000);
    });

    it("no hace nada si no hay edición abierta", () => {
      cerrarEdicion();
      anadirPendiente("hola");
      expect(paqueteEnEdicion()).toBeNull();
    });
  });

  describe("traducir", () => {
    beforeEach(() => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("hola");
      anadirPendiente("adiós");
    });

    it("mueve de pendientes a completadas", () => {
      traducir("hola", "bonjour");
      expect(pendientes()).not.toContain("hola");
      expect(completadas()).toEqual({ hola: "bonjour" });
    });

    it("sobrescribe traducción existente", () => {
      traducir("hola", "bonjour");
      traducir("hola", "salut");
      expect(completadas()).toEqual({ hola: "salut" });
    });

    it("no hace nada si la clave no está en pendientes", () => {
      traducir("no-existe", "traducción");
      expect(pendientes()).toHaveLength(2);
      expect(completadas()).toEqual({});
    });

    it("persiste el cambio en el almacén", () => {
      traducir("hola", "bonjour");
      const guardado = almacen.getItem(CLAVE_EDITOR);
      expect(guardado).toContain("bonjour");
    });

    it("no hace nada si no hay edición abierta", () => {
      cerrarEdicion();
      traducir("hola", "bonjour");
      expect(paqueteEnEdicion()).toBeNull();
    });
  });

  describe("pendientes", () => {
    it("devuelve array vacío si no hay edición", () => {
      expect(pendientes()).toEqual([]);
    });

    it("devuelve solo los pendientes actuales", () => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("uno");
      anadirPendiente("dos");
      traducir("uno", "un");
      expect(pendientes()).toEqual(["dos"]);
    });
  });

  describe("completadas", () => {
    it("devuelve objeto vacío si no hay edición", () => {
      expect(completadas()).toEqual({});
    });

    it("devuelve las traducciones completadas", () => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("hola");
      anadirPendiente("adiós");
      traducir("hola", "bonjour");
      expect(completadas()).toEqual({ hola: "bonjour" });
    });
  });

  describe("cerrarEdicion", () => {
    it("limpia el estado y el almacén", () => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("hola");
      traducir("hola", "bonjour");
      cerrarEdicion();
      expect(paqueteEnEdicion()).toBeNull();
      expect(almacen.getItem(CLAVE_EDITOR)).toBeNull();
    });

    it("no falla si no hay edición abierta", () => {
      expect(() => cerrarEdicion()).not.toThrow();
    });
  });

  describe("publicarBorrador", () => {
    it("devuelve null si no hay edición", () => {
      expect(publicarBorrador()).toBeNull();
    });

    it("devuelve null si no hay traducciones completadas", () => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("hola");
      expect(publicarBorrador()).toBeNull();
    });

    it("crea PaqueteIdioma solo con entradas traducidas", () => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("hola");
      anadirPendiente("adiós");
      traducir("hola", "bonjour");
      const paquete = publicarBorrador();
      expect(paquete).not.toBeNull();
      expect(paquete?.codigo).toBe("fr-FR");
      expect(paquete?.nombre).toBe("Francés");
      expect(paquete?.entradas).toEqual({ hola: "bonjour" });
      expect(paquete?.revisado.estado).toBe("automatico");
    });

    it("incluye campos requeridos del formato", () => {
      abrirEdicion("de-DE", "Deutsch");
      anadirPendiente("hallo");
      traducir("hallo", "hallo");
      const paquete = publicarBorrador();
      expect(paquete).not.toBeNull();
      expect(paquete?.formato).toBe("starseed-idioma");
      expect(paquete?.version).toBe(1);
      expect(paquete?.dir).toBe("ltr");
      expect(paquete?.autor.nombre).toBe("StarSeed OS");
      expect(paquete?.licencia).toBe("MIT");
      expect(paquete?.base).toBe("es");
      expect(paquete?.hash).toBeDefined();
    });

    it("no limpia la edición tras publicar", () => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("hola");
      traducir("hola", "bonjour");
      publicarBorrador();
      expect(paqueteEnEdicion()).not.toBeNull();
      expect(completadas()).toEqual({ hola: "bonjour" });
    });
  });

  describe("normalizarTexto (integración)", () => {
    it("se usa internamente al añadir pendientes", () => {
      abrirEdicion("fr-FR", "Francés");
      anadirPendiente("  hola   mundo  ");
      expect(pendientes()).toContain(normalizarTexto("  hola   mundo  "));
    });
  });
});