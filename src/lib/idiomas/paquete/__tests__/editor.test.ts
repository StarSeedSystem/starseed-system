import { describe, it, expect, beforeEach, vi } from "vitest";
import { crearEditor, type EditorEstado } from "../editor";
import { crearAlmacenPaquetes, type AlmacenPaquetes } from "../almacen";
import type { PaqueteIdioma } from "../formato";

function crearAlmacenFalso(): AlmacenPaquetes {
  const datos = new Map<string, string>();
  return {
    listarPaquetes() {
      const paquetes: PaqueteIdioma[] = [];
      for (const [clave, valor] of datos.entries()) {
        try {
          const parsed = JSON.parse(valor);
          paquetes.push({
            formato: "starseed-idioma",
            version: 1,
            codigo: clave,
            nombre: parsed.nombre ?? clave,
            dir: "ltr",
            autor: { nombre: parsed.autor?.nombre ?? "Test" },
            creado: parsed.creado ?? new Date().toISOString(),
            revisado: { estado: parsed.revisado?.estado ?? "automatico" },
            licencia: parsed.licencia ?? "MIT",
            base: "es",
            entradas: parsed.entradas ?? {},
            hash: parsed.hash ?? "",
          });
        } catch {
          // ignora
        }
      }
      return paquetes;
    },
    guardarPaquete(paquete) {
      try {
        datos.set(paquete.codigo, JSON.stringify(paquete));
        return { ok: true };
      } catch {
        return { ok: false, motivo: "Error" };
      }
    },
    quitarPaquete(codigo) {
      datos.delete(codigo);
    },
    leerPaquete(codigo) {
      const valor = datos.get(codigo);
      if (!valor) return null;
      try {
        return JSON.parse(valor) as PaqueteIdioma;
      } catch {
        return null;
      }
    },
  };
}

describe("editor de paquetes de idioma", () => {
  let almacen: AlmacenPaquetes;
  let editor: ReturnType<typeof crearEditor>;

  beforeEach(() => {
    almacen = crearAlmacenFalso();
    editor = crearEditor(almacen);
  });

  describe("abrirEdicion y paqueteEnEdicion", () => {
    it("paqueteEnEdicion devuelve null cuando no hay edición abierta", () => {
      expect(editor.paqueteEnEdicion()).toBeNull();
    });

    it("abrirEdicion permite establecer código y nombre", () => {
      editor.abrirEdicion("es-ES", "Español de España");
      const paquete = editor.paqueteEnEdicion();
      expect(paquete).not.toBeNull();
      expect(paquete!.codigo).toBe("es-ES");
      expect(paquete!.nombre).toBe("Español de España");
      expect(paquete!.base).toBe("es");
      expect(paquete!.version).toBe(1);
      expect(paquete!.formato).toBe("starseed-idioma");
      expect(paquete!.revisado.estado).toBe("automatico");
    });

    it("paqueteEnEdicion inicializa entradas vacías", () => {
      editor.abrirEdicion("es-ES", "Español");
      const paquete = editor.paqueteEnEdicion();
      expect(paquete!.entradas).toEqual({});
    });
  });

  describe("anadirPendiente", () => {
    beforeEach(() => {
      editor.abrirEdicion("es-ES", "Español");
    });

    it("añade texto español normalizado a la lista de pendientes", () => {
      const resultado = editor.anadirPendiente("hola mundo");
      expect(resultado).toBe(true);
      expect(editor.pendientes()).toContain("hola mundo");
    });

    it("normaliza texto con espacios extra", () => {
      editor.anadirPendiente("  hola   mundo  ");
      expect(editor.pendientes()).toContain("hola mundo");
    });

    it("ignora texto vacío", () => {
      const resultado = editor.anadirPendiente("   ");
      expect(resultado).toBe(false);
      expect(editor.pendientes()).toHaveLength(0);
    });

    it("ignora texto que excede 500 caracteres", () => {
      const texto = "a".repeat(501);
      const resultado = editor.anadirPendiente(texto);
      expect(resultado).toBe(false);
    });

    it("ignora textos duplicados", () => {
      editor.anadirPendiente("hola");
      const resultado = editor.anadirPendiente("hola");
      expect(resultado).toBe(false);
      expect(editor.pendientes()).toHaveLength(1);
    });

    it("respeta el tope de 2000 entradas", () => {
      for (let i = 0; i < 2000; i++) {
        expect(editor.anadirPendiente(`texto${i}`)).toBe(true);
      }
      expect(editor.anadirPendiente("extra")).toBe(false);
    });

    it("devuelve false si no hay edición abierta", () => {
      editor.cerrarEdicion();
      expect(editor.anadirPendiente("hola")).toBe(false);
    });
  });

  describe("traducir", () => {
    beforeEach(() => {
      editor.abrirEdicion("es-ES", "Español");
      editor.anadirPendiente("hola");
    });

    it("marca una entrada como traducida", () => {
      editor.traducir("hola", "hello");
      expect(editor.completadas()).toContain("hola");
      expect(editor.pendientes()).not.toContain("hola");
    });

    it("actualiza una traducción existente", () => {
      editor.traducir("hola", "hello");
      editor.traducir("hola", "hi");
      const paquete = editor.publicarBorrador()!;
      expect(paquete.entradas["hola"]).toBe("hi");
    });
  });

  describe("pendientes y completadas", () => {
    beforeEach(() => {
      editor.abrirEdicion("es-ES", "Español");
      editor.anadirPendiente("uno");
      editor.anadirPendiente("dos");
      editor.traducir("uno", "one");
    });

    it("devuelve solo las claves sin traducir", () => {
      expect(editor.pendientes()).toEqual(["dos"]);
    });

    it("devuelve solo las claves traducidas", () => {
      expect(editor.completadas()).toEqual(["uno"]);
    });
  });

  describe("cerrarEdicion", () => {
    it("cierra la edición y limpia estado", () => {
      editor.abrirEdicion("es-ES", "Español");
      editor.anadirPendiente("hola");
      editor.cerrarEdicion();
      expect(editor.paqueteEnEdicion()).toBeNull();
      expect(editor.pendientes()).toHaveLength(0);
    });
  });

  describe("publicarBorrador", () => {
    beforeEach(() => {
      editor.abrirEdicion("es-ES", "Español");
    });

    it("devuelve null si no hay edición abierta", () => {
      editor.cerrarEdicion();
      expect(editor.publicarBorrador()).toBeNull();
    });

    it("publica solo entradas traducidas", () => {
      editor.anadirPendiente("hola");
      editor.anadirPendiente("adios");
      editor.traducir("hola", "hello");
      const borrador = editor.publicarBorrador()!;
      expect(borrador.entradas).toEqual({ hola: "hello" });
    });

    it("devuelve paquete con revisado.estado=automatico", () => {
      editor.anadirPendiente("hola");
      editor.traducir("hola", "hello");
      const borrador = editor.publicarBorrador()!;
      expect(borrador.revisado.estado).toBe("automatico");
    });

    it("inicializa el paquete con metadata correcta", () => {
      editor.anadirPendiente("hola");
      editor.traducir("hola", "hello");
      const borrador = editor.publicarBorrador()!;
      expect(borrador.codigo).toBe("es-ES");
      expect(borrador.nombre).toBe("Español");
      expect(borrador.base).toBe("es");
      expect(borrador.version).toBe(1);
    });
  });

  describe("importar (formatos comunes conectados con importar-json-csv)", () => {
    beforeEach(() => {
      editor.abrirEdicion("es-ES", "Español");
    });

    it("JSON anidado de 3 niveles se aplana con «.» y rellena el paquete", () => {
      const r = editor.importar(
        '{"menu":{"archivo":{"guardar":"Guardar","cerrar":"Cerrar"},"ayuda":"Ayuda"}}',
        { tipo: "json-anidado" }
      );
      expect(r.entradas).toBe(3);
      expect(r.descartadas).toHaveLength(0);
      const paquete = editor.paqueteEnEdicion()!;
      expect(paquete.entradas["menu.archivo.guardar"]).toBe("Guardar");
      expect(paquete.entradas["menu.archivo.cerrar"]).toBe("Cerrar");
      expect(paquete.entradas["menu.ayuda"]).toBe("Ayuda");
    });

    it("JSON plano añade claves con valor textual", () => {
      const r = editor.importar('{"hola":"Hello"}', { tipo: "json-plano" });
      expect(r.entradas).toBe(1);
      expect(editor.completadas()).toContain("hola");
    });

    it("CSV con comas y comillas: los saltos y las comas dentro de comillas se respetan", () => {
      const r = editor.importar(
        'clave,traducción\n"hola, mundo","Hello, world"\nadiós,"Bye,\nadiós"',
        { tipo: "csv", separador: "," }
      );
      expect(r.entradas).toBe(2);
      const paquete = editor.paqueteEnEdicion()!;
      expect(paquete.entradas["hola, mundo"]).toBe("Hello, world");
      expect(paquete.entradas["adiós"]).toBe("Bye,\nadiós");
    });

    it("CSV con fila de cabecera: la primera fila no se cuenta como entrada", () => {
      const r = editor.importar("key,traducción\nhola,hello", { tipo: "csv", separador: "," });
      expect(r.entradas).toBe(1);
      const paquete = editor.paqueteEnEdicion()!;
      expect(paquete.entradas["hola"]).toBe("hello");
      expect(paquete.entradas["key"]).toBeUndefined();
    });

    it("JSON roto no lanza: devuelve 0 entradas y un motivo", () => {
      const r = editor.importar('{"hola": "Hello"', { tipo: "json-plano" });
      expect(r.entradas).toBe(0);
      expect(r.descartadas).toHaveLength(1);
      expect(r.descartadas[0].motivo).toBe("El texto no es un JSON válido");
    });

    it("sin paquete en edición: 0 entradas y motivo", () => {
      editor.cerrarEdicion();
      const r = editor.importar('{"hola":"Hello"}', { tipo: "json-plano" });
      expect(r.entradas).toBe(0);
      expect(r.descartadas.some((d) => d.motivo === "No hay paquete en edición")).toBe(true);
    });

    it("respeta el tope de entradas: lo que no cabe se descarta con motivo", () => {
      for (let i = 0; i < 2000; i++) editor.anadirPendiente(`texto${i}`);
      const r = editor.importar('{"extra":"Extra"}', { tipo: "json-plano" });
      expect(r.entradas).toBe(0);
      expect(r.descartadas.some((d) => d.motivo.includes("tope de 2000 entradas"))).toBe(true);
    });
  });

  describe("estado persistente", () => {
    it("recupera estado tras recargar el editor", () => {
      editor.abrirEdicion("es-MX", "Mexicano");
      editor.anadirPendiente("hola");
      editor.traducir("hola", "hola");
      const nuevoEditor = crearEditor(almacen);
      expect(nuevoEditor.paqueteEnEdicion()?.codigo).toBe("es-MX");
      expect(nuevoEditor.paqueteEnEdicion()?.nombre).toBe("Mexicano");
    });
  });
});