import { describe, it, expect } from "vitest";
import {
  RUTA_MANIFIESTO,
  VERSION_FORMATO_ACTUAL,
  leerManifiestoDesdeObjeto,
  crearManifiesto,
  actualizarFechaManifiesto,
  agregarCerebroAManifiesto,
  eliminarCerebroDeManifiesto,
  establecerParteEnManifiesto,
  eliminarParteDeManifiesto,
  serializarManifiesto,
  parsearManifiesto,
  asegurarVersionActual,
  validarManifiestoEstricto,
  verificarDueño,
  estaCifrado,
  cerebrosEnManifiesto,
} from "../manifiesto";
import { ManifiestoAlmacen } from "../modelo";

describe("manifiesto de almacenes", () => {
  const manifiestoBase: ManifiestoAlmacen = {
    versionFormato: 1,
    idVolumen: "vol-abc-123",
    numeroSerie: "SN-XYZ-789",
    dueño: "cuenta-123",
    cerebros: ["cerebro-1"],
    partes: { "/cerebros/privado": "cerebro-1" },
    cifrado: true,
    algoritmosCifrado: ["AES-GCM-256"],
    fechaCreacion: "2026-11-25T10:00:00Z",
    fechaActualizacion: "2026-11-25T10:00:00Z",
  };

  describe("constantes", () => {
    it("RUTA_MANIFIESTO es .starseed/almacen.json", () => {
      expect(RUTA_MANIFIESTO).toBe(".starseed/almacen.json");
    });

    it("VERSION_FORMATO_ACTUAL es 1", () => {
      expect(VERSION_FORMATO_ACTUAL).toBe(1);
    });
  });

  describe("leerManifiestoDesdeObjeto", () => {
    it("valida y devuelve manifiesto válido", () => {
      const resultado = leerManifiestoDesdeObjeto(manifiestoBase);
      expect(resultado.ok).toBe(true);
      expect(resultado.manifiesto).toEqual(manifiestoBase);
      expect(resultado.ruta).toBe(".starseed/almacen.json");
    });

    it("rechaza manifiesto inválido", () => {
      const invalido = { ...manifiestoBase, versionFormato: 99 };
      const resultado = leerManifiestoDesdeObjeto(invalido);
      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain("versión de formato no soportada");
    });

    it("rechaza objeto nulo", () => {
      const resultado = leerManifiestoDesdeObjeto(null);
      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain("objeto");
    });
  });

  describe("crearManifiesto", () => {
    it("crea manifiesto con valores por defecto", () => {
      const m = crearManifiesto({
        idVolumen: "vol-1",
        numeroSerie: "SN-1",
        dueño: "cuenta-1",
      });

      expect(m.versionFormato).toBe(1);
      expect(m.idVolumen).toBe("vol-1");
      expect(m.numeroSerie).toBe("SN-1");
      expect(m.dueño).toBe("cuenta-1");
      expect(m.cerebros).toEqual([]);
      expect(m.partes).toEqual({});
      expect(m.cifrado).toBe(true);
      expect(m.algoritmosCifrado).toEqual(["AES-GCM-256"]);
      expect(m.fechaCreacion).toBe(m.fechaActualizacion);
    });

    it("permite sobrescribir valores por defecto", () => {
      const m = crearManifiesto({
        idVolumen: "vol-1",
        numeroSerie: "SN-1",
        dueño: "cuenta-1",
        cerebros: ["c1", "c2"],
        partes: { "/test": "c1" },
        cifrado: false,
        algoritmosCifrado: ["AES-GCM-128"],
      });

      expect(m.cerebros).toEqual(["c1", "c2"]);
      expect(m.partes).toEqual({ "/test": "c1" });
      expect(m.cifrado).toBe(false);
      expect(m.algoritmosCifrado).toEqual(["AES-GCM-128"]);
    });
  });

  describe("actualizarFechaManifiesto", () => {
    it("actualiza solo fechaActualizacion", () => {
      const original = { ...manifiestoBase, fechaActualizacion: "2026-11-25T10:00:00Z" };
      const actualizado = actualizarFechaManifiesto(original);

      expect(actualizado.fechaCreacion).toBe(original.fechaCreacion);
      expect(actualizado.fechaActualizacion).not.toBe(original.fechaActualizacion);
      expect(new Date(actualizado.fechaActualizacion).getTime()).toBeGreaterThanOrEqual(
        new Date(original.fechaActualizacion).getTime()
      );
    });

    it("mantiene todos los demás campos", () => {
      const actualizado = actualizarFechaManifiesto(manifiestoBase);
      expect(actualizado.idVolumen).toBe(manifiestoBase.idVolumen);
      expect(actualizado.cerebros).toEqual(manifiestoBase.cerebros);
      expect(actualizado.partes).toEqual(manifiestoBase.partes);
    });
  });

  describe("agregarCerebroAManifiesto", () => {
    it("añade cerebro nuevo", () => {
      const m = agregarCerebroAManifiesto(manifiestoBase, "cerebro-2");
      expect(m.cerebros).toEqual(["cerebro-1", "cerebro-2"]);
      expect(m.fechaActualizacion).not.toBe(manifiestoBase.fechaActualizacion);
    });

    it("no duplica cerebro existente", () => {
      const m = agregarCerebroAManifiesto(manifiestoBase, "cerebro-1");
      expect(m.cerebros).toEqual(["cerebro-1"]);
    });
  });

  describe("eliminarCerebroDeManifiesto", () => {
    it("elimina cerebro existente", () => {
      const m = eliminarCerebroDeManifiesto(manifiestoBase, "cerebro-1");
      expect(m.cerebros).toEqual([]);
      expect(m.fechaActualizacion).not.toBe(manifiestoBase.fechaActualizacion);
    });

    it("no falla si cerebro no existe", () => {
      const m = eliminarCerebroDeManifiesto(manifiestoBase, "inexistente");
      expect(m.cerebros).toEqual(["cerebro-1"]);
    });
  });

  describe("establecerParteEnManifiesto", () => {
    it("añade nueva parte", () => {
      const m = establecerParteEnManifiesto(manifiestoBase, "/nueva/parte", "cerebro-2");
      expect(m.partes).toEqual({
        "/cerebros/privado": "cerebro-1",
        "/nueva/parte": "cerebro-2",
      });
      expect(m.fechaActualizacion).not.toBe(manifiestoBase.fechaActualizacion);
    });

    it("actualiza parte existente", () => {
      const m = establecerParteEnManifiesto(manifiestoBase, "/cerebros/privado", "cerebro-2");
      expect(m.partes).toEqual({ "/cerebros/privado": "cerebro-2" });
    });
  });

  describe("eliminarParteDeManifiesto", () => {
    it("elimina parte existente", () => {
      const m = eliminarParteDeManifiesto(manifiestoBase, "/cerebros/privado");
      expect(m.partes).toEqual({});
      expect(m.fechaActualizacion).not.toBe(manifiestoBase.fechaActualizacion);
    });

    it("no falla si parte no existe", () => {
      const m = eliminarParteDeManifiesto(manifiestoBase, "/inexistente");
      expect(m.partes).toEqual({ "/cerebros/privado": "cerebro-1" });
    });
  });

  describe("serializarManifiesto", () => {
    it("produce JSON válido con formato legible", () => {
      const json = serializarManifiesto(manifiestoBase);
      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(manifiestoBase);
      // Verifica que tiene indentación (formato legible)
      expect(json).toContain("\n");
      expect(json).toContain("  ");
    });
  });

  describe("parsearManifiesto", () => {
    it("parsea JSON válido", () => {
      const json = serializarManifiesto(manifiestoBase);
      const resultado = parsearManifiesto(json);
      expect(resultado.ok).toBe(true);
      expect(resultado.manifiesto).toEqual(manifiestoBase);
    });

    it("rechaza JSON inválido", () => {
      const resultado = parsearManifiesto("{ invalid json }");
      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain("Error parseando JSON");
    });

    it("rechaza JSON válido pero manifiesto inválido", () => {
      const invalido = { ...manifiestoBase, versionFormato: 99 };
      const resultado = parsearManifiesto(JSON.stringify(invalido));
      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain("versión de formato no soportada");
    });
  });

  describe("asegurarVersionActual", () => {
    it("no migra si ya está en versión actual", () => {
      const { manifiesto, migrado } = asegurarVersionActual(manifiestoBase);
      expect(migrado).toBe(false);
      expect(manifiesto).toBe(manifiestoBase);
    });
  });

  describe("validarManifiestoEstricto", () => {
    it("valida manifiesto correcto", () => {
      const resultado = validarManifiestoEstricto(manifiestoBase);
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toEqual([]);
    });

    it("rechaza campos de secretos", () => {
      const conSecreto = { ...manifiestoBase, token: "secret" };
      const resultado = validarManifiestoEstricto(conSecreto);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContainEqual(
        expect.stringContaining("campo prohibido")
      );
    });
  });

  describe("verificarDueño", () => {
    it("devuelve true si el dueño coincide", () => {
      expect(verificarDueño(manifiestoBase, "cuenta-123")).toBe(true);
    });

    it("devuelve false si el dueño no coincide", () => {
      expect(verificarDueño(manifiestoBase, "otra-cuenta")).toBe(false);
    });
  });

  describe("estaCifrado", () => {
    it("devuelve true si cifrado=true y hay algoritmos", () => {
      expect(estaCifrado(manifiestoBase)).toBe(true);
    });

    it("devuelve false si cifrado=false", () => {
      const m = { ...manifiestoBase, cifrado: false };
      expect(estaCifrado(m)).toBe(false);
    });

    it("devuelve false si no hay algoritmos", () => {
      const m = { ...manifiestoBase, algoritmosCifrado: [] };
      expect(estaCifrado(m)).toBe(false);
    });
  });

  describe("cerebrosEnManifiesto", () => {
    it("devuelve cerebros completos y parciales únicos", () => {
      const m = {
        ...manifiestoBase,
        cerebros: ["cerebro-1", "cerebro-2"],
        partes: { "/parte1": "cerebro-2", "/parte2": "cerebro-3" },
      };
      const cerebros = cerebrosEnManifiesto(m);
      expect(cerebros).toEqual(expect.arrayContaining(["cerebro-1", "cerebro-2", "cerebro-3"]));
      expect(new Set(cerebros).size).toBe(cerebros.length); // sin duplicados
    });
  });
});