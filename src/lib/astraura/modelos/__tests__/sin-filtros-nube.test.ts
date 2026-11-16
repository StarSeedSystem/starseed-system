import { describe, expect, it } from "vitest";
import { CASOS_SIN_FILTROS, type ContextoUso } from "../recomendar";
import type { CasoUso } from "../tipos";
import {
  PROVEEDORES_SIN_FILTROS_NUBE,
  proveedorEsSinFiltros,
  proveedorSinFiltrosPermitido,
  type EntradaProveedorSinFiltros,
} from "../sin-filtros-nube";

const CASOS: CasoUso[] = ["conversacion", "codigo-agentes", "archivos-privados", "vision", "voz", "bots-dots", "capas-conciencia", "segundo-plano"];
const CONTEXTOS: ContextoUso[] = ["privado-propio", "compartido", "publico", "segundo-plano", "malla-ajena"];

const base: EntradaProveedorSinFiltros = {
  activado: true,
  disponible: true,
  caso: "conversacion",
  claveDeLaCuenta: "mi-clave-propia",
  proveedor: "abliteration",
};

describe("PROVEEDORES_SIN_FILTROS_NUBE", () => {
  it("contiene solo 'abliteration'", () => {
    expect(PROVEEDORES_SIN_FILTROS_NUBE).toEqual(["abliteration"]);
  });
});

describe("proveedorEsSinFiltros", () => {
  it("devuelve true para 'abliteration'", () => {
    expect(proveedorEsSinFiltros("abliteration")).toBe(true);
  });

  it("devuelve false para otros proveedores", () => {
    expect(proveedorEsSinFiltros("astraura-158")).toBe(false);
    expect(proveedorEsSinFiltros("groq")).toBe(false);
    expect(proveedorEsSinFiltros("openrouter")).toBe(false);
    expect(proveedorEsSinFiltros("")).toBe(false);
  });
});

describe("proveedorSinFiltrosPermitido", () => {
  describe("proveedor no reconocido", () => {
    it("devuelve permitido: false y aviso: null para proveedor desconocido", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, proveedor: "otro" });
      expect(r).toEqual({ permitido: false, aviso: null });
    });
  });

  describe("disponibilidad", () => {
    it("niega cuando disponible es false", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, disponible: false });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("Las variantes sin filtros no están disponibles en este perfil.");
    });
  });

  describe("interruptor activado", () => {
    it("niega cuando activado es false", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, activado: false });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("«Mostrar variantes sin filtros» está apagado.");
    });
  });

  describe("contexto", () => {
    it("permite con contexto 'privado-propio'", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "privado-propio" });
      expect(r.permitido).toBe(true);
      expect(r.aviso).toBeNull();
    });

    it("niega con contexto 'compartido' (bots, dots, grupos)", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "compartido" });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("solo se usan en tus conversaciones privadas en tu neurona, no en bots, dots o asistentes de grupo, comunidad o página (hablan con otras personas).");
    });

    it("niega con contexto 'publico' (capas públicas)", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "publico" });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("solo se usan en tus conversaciones privadas en tu neurona, no en capas públicas.");
    });

    it("niega con contexto 'segundo-plano'", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "segundo-plano" });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("solo se usan en tus conversaciones privadas en tu neurona, no en segundo plano y aprendizaje colectivo.");
    });

    it("niega con contexto 'malla-ajena' (servir a otra cuenta)", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "malla-ajena" });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("solo se usan en tus conversaciones privadas en tu neurona, no en servir a otra cuenta por la malla.");
    });

    it("niega por defecto cuando no se declara contexto (trata como 'compartido')", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: undefined });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("solo se usan en tus conversaciones privadas en tu neurona, no en bots, dots o asistentes de grupo, comunidad o página (hablan con otras personas).");
    });
  });

  describe("caso", () => {
    for (const caso of CASOS) {
      const permitido = CASOS_SIN_FILTROS.has(caso);
      it(`${permitido ? "permite" : "niega"} para caso '${caso}'`, () => {
        const r = proveedorSinFiltrosPermitido({ ...base, contexto: "privado-propio", caso });
        expect(r.permitido).toBe(permitido);
        if (!permitido) {
          expect(r.aviso).toBe("ese uso habla con otras personas o corre sin ti delante.");
        }
      });
    }
  });

  describe("clave de la cuenta", () => {
    it("niega cuando la cuenta no tiene clave", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "privado-propio", claveDeLaCuenta: null });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("la cuenta no tiene su propia clave para proveedores sin filtros.");
    });

    it("niega cuando la clave está vacía", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "privado-propio", claveDeLaCuenta: "" });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("la cuenta no tiene su propia clave para proveedores sin filtros.");
    });

    it("niega cuando la clave es solo espacios", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "privado-propio", claveDeLaCuenta: "   " });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("la cuenta no tiene su propia clave para proveedores sin filtros.");
    });

    it("permite cuando la cuenta tiene su clave", () => {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "privado-propio", claveDeLaCuenta: "mi-clave" });
      expect(r.permitido).toBe(true);
      expect(r.aviso).toBeNull();
    });
  });

  describe("clave de otra cuenta (malla)", () => {
    it("niega cuando hay clave de otra cuenta distinta", () => {
      const r = proveedorSinFiltrosPermitido({
        ...base,
        contexto: "privado-propio",
        claveDeLaCuenta: "mi-clave",
        claveDeOtraCuenta: "otra-clave",
      });
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBe("nunca se sirve a otra cuenta con un proveedor sin filtros.");
    });

    it("permite cuando no hay clave de otra cuenta", () => {
      const r = proveedorSinFiltrosPermitido({
        ...base,
        contexto: "privado-propio",
        claveDeLaCuenta: "mi-clave",
        claveDeOtraCuenta: null,
      });
      expect(r.permitido).toBe(true);
      expect(r.aviso).toBeNull();
    });

    it("permite cuando la clave de otra cuenta es la misma (misma cuenta)", () => {
      const r = proveedorSinFiltrosPermitido({
        ...base,
        contexto: "privado-propio",
        claveDeLaCuenta: "mi-clave",
        claveDeOtraCuenta: "mi-clave",
      });
      expect(r.permitido).toBe(true);
      expect(r.aviso).toBeNull();
    });
  });

  describe("tabla completa: contexto × caso × interruptor × disponibilidad × clave", () => {
    for (const contexto of CONTEXTOS) {
      for (const caso of CASOS) {
        for (const activado of [true, false]) {
          for (const disponible of [true, false]) {
            for (const tieneClave of [true, false]) {
              const claveDeLaCuenta = tieneClave ? "mi-clave" : null;
              const r = proveedorSinFiltrosPermitido({
                ...base,
                contexto,
                caso,
                activado,
                disponible,
                claveDeLaCuenta,
              });

              const contextoOK = contexto === "privado-propio";
              const casoOK = CASOS_SIN_FILTROS.has(caso);
              const interruptorOK = activado && disponible;
              const claveOK = !!claveDeLaCuenta;

              const esperado = contextoOK && casoOK && interruptorOK && claveOK;

              it(`contexto=${contexto} caso=${caso} activado=${activado} disponible=${disponible} clave=${tieneClave} ⇒ ${esperado ? "permitido" : "negado"}`, () => {
                expect(r.permitido).toBe(esperado);
                if (!esperado) {
                  expect(r.aviso).not.toBeNull();
                }
              });
            }
          }
        }
      }
    }
  });
});