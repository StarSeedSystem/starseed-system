import { describe, it, expect } from "vitest";
import { cupoBanco } from "../cupo-banco";
import type { AjustesBanco, VentanaBanco } from "../tipos";

function crearAjustes(overrides: Partial<AjustesBanco> = {}): AjustesBanco {
  return {
    activo: true,
    modo: "diario",
    diarioMb: 100,
    ventanas: [],
    ...overrides,
  };
}

const ahoraBase = new Date("2026-11-16T12:00:00");

describe("cupoBanco", () => {
  describe("modo apagado (activo=false)", () => {
    it("cuando activo es false: aplica=false, permitido=true, restanteMb=Infinity, motivo 'modo banco apagado'", () => {
      const ajustes = crearAjustes({ activo: false });
      const resultado = cupoBanco(ajustes, 0, ahoraBase);
      expect(resultado.aplica).toBe(false);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restanteMb).toBe(Infinity);
      expect(resultado.motivo).toBe("modo banco apagado");
    });
  });

  describe("modo diario", () => {
    it("diario con saldo positivo: restanteMb = diarioMb - usadoHoyMb, permitido=true", () => {
      const ajustes = crearAjustes({ modo: "diario", diarioMb: 100 });
      const resultado = cupoBanco(ajustes, 30, ahoraBase);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restanteMb).toBe(70);
      expect(resultado.motivo).toBe("dentro de la ración diaria");
    });

    it("diario con saldo cero exacto: restanteMb = 0, permitido=false", () => {
      const ajustes = crearAjustes({ modo: "diario", diarioMb: 100 });
      const resultado = cupoBanco(ajustes, 100, ahoraBase);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(false);
      expect(resultado.restanteMb).toBe(0);
      expect(resultado.motivo).toBe("ración diaria agotada");
    });

    it("diario agotado: restanteMb=0, permitido=false, motivo agotado", () => {
      const ajustes = crearAjustes({ modo: "diario", diarioMb: 100 });
      const resultado = cupoBanco(ajustes, 150, ahoraBase);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(false);
      expect(resultado.restanteMb).toBe(0);
      expect(resultado.motivo).toBe("ración diaria agotada");
    });

    it("diario con usadoHoyMb negativo (inválido): permitido=false, motivo claro", () => {
      const ajustes = crearAjustes({ modo: "diario", diarioMb: 100 });
      const resultado = cupoBanco(ajustes, -10, ahoraBase);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toContain("inválido");
    });

    it("diario con usadoHoyMb NaN (inválido): permitido=false, motivo claro", () => {
      const ajustes = crearAjustes({ modo: "diario", diarioMb: 100 });
      const resultado = cupoBanco(ajustes, Number.NaN, ahoraBase);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toContain("inválido");
    });
  });

  describe("modo programado", () => {
    const ventanaVigente: VentanaBanco = {
      desde: "2026-11-16",
      hasta: "2026-11-16",
      horaDesde: "08:00",
      horaHasta: "12:00",
      limiteMb: 50,
    };

    it("ventana vigente en el mismo día: use el límite de esa ventana", () => {
      const ajustes = crearAjustes({
        modo: "programado",
        diarioMb: 100,
        ventanas: [ventanaVigente],
      });
      const resultado = cupoBanco(ajustes, 10, ahoraBase);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restanteMb).toBe(40);
      expect(resultado.motivo).toBe("dentro de la franja programada");
    });

    it("dentro de franja horaria: restanteMb = limiteMb - usadoHoyMb", () => {
      const ahora = new Date("2026-11-16T10:00:00");
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [{ ...ventanaVigente, limiteMb: 100 }],
      });
      const resultado = cupoBanco(ajustes, 25, ahora);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restanteMb).toBe(75);
    });

    it("franja cruza medianoche (22:00-06:00) - antes de medianoche: aplica", () => {
      const ahora = new Date("2026-11-16T23:00:00");
      const ventanaNocturna: VentanaBanco = {
        desde: "2026-11-16",
        hasta: "2026-11-16",
        horaDesde: "22:00",
        horaHasta: "06:00",
        limiteMb: 80,
      };
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [ventanaNocturna],
      });
      const resultado = cupoBanco(ajustes, 20, ahora);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restanteMb).toBe(60);
    });

    it("franja cruza medianoche (22:00-06:00) - después de medianoche: aplica", () => {
      const ahora = new Date("2026-11-16T04:00:00");
      const ventanaNocturna: VentanaBanco = {
        desde: "2026-11-16",
        hasta: "2026-11-16",
        horaDesde: "22:00",
        horaHasta: "06:00",
        limiteMb: 80,
      };
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [ventanaNocturna],
      });
      const resultado = cupoBanco(ajustes, 10, ahora);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restanteMb).toBe(70);
    });

    it("fuera de franja horaria: permitido=false, motivo franjas", () => {
      const ahora = new Date("2026-11-16T15:00:00");
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [ventanaVigente],
      });
      const resultado = cupoBanco(ajustes, 10, ahora);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toBe("fuera de las franjas del modo banco");
    });

    it("fecha fuera de rango ventana: busca siguiente ventana válida", () => {
      const ahora = new Date("2026-11-16T10:00:00");
      const ventanaAnterior: VentanaBanco = {
        desde: "2026-11-15",
        hasta: "2026-11-15",
        horaDesde: "08:00",
        horaHasta: "12:00",
        limiteMb: 50,
      };
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [ventanaAnterior],
      });
      const resultado = cupoBanco(ajustes, 10, ahora);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toBe("fuera de las franjas del modo banco");
    });

    it("dos ventanas: usa la primera que está vigente (orden de array)", () => {
      const ahora = new Date("2026-11-16T09:00:00");
      const ventana1: VentanaBanco = {
        desde: "2026-11-16",
        hasta: "2026-11-16",
        horaDesde: "08:00",
        horaHasta: "10:00",
        limiteMb: 50,
      };
      const ventana2: VentanaBanco = {
        desde: "2026-11-16",
        hasta: "2026-11-16",
        horaDesde: "14:00",
        horaHasta: "18:00",
        limiteMb: 100,
      };
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [ventana1, ventana2],
      });
      const resultado = cupoBanco(ajustes, 10, ahora);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restanteMb).toBe(40);
    });

    it("sin ventanas vigentes (lista vacía): permitido=false", () => {
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [],
      });
      const resultado = cupoBanco(ajustes, 10, ahoraBase);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toBe("fuera de las franjas del modo banco");
    });

    it("sin ventanas válidas (todo fuera de rango): permitido=false", () => {
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [ventanaVigente],
      });
      const resultado = cupoBanco(ajustes, 10, new Date("2026-11-17T10:00:00"));
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toBe("fuera de las franjas del modo banco");
    });
  });

  describe("desfase horario", () => {
    it("aplica desfaseMin a la hora local para cálculos", () => {
      const ahoraUTC = new Date("2026-11-16T18:00:00Z");
      const desfaseMin = -300;
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [{
          desde: "2026-11-16",
          hasta: "2026-11-16",
          horaDesde: "12:00",
          horaHasta: "14:00",
          limiteMb: 50,
        }],
      });
      const resultado = cupoBanco(ajustes, 10, ahoraUTC, desfaseMin);
      expect(resultado.aplica).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restanteMb).toBe(40);
    });
  });

  describe("entradas inválidas", () => {
    it("diarioMb negativo: permitido=false con motivo claro", () => {
      const ajustes = crearAjustes({ modo: "diario", diarioMb: -50 });
      const resultado = cupoBanco(ajustes, 0, ahoraBase);
      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toContain("inválido");
    });

    it("diarioMb NaN: permitido=false con motivo claro", () => {
      const ajustes = { ...crearAjustes({ modo: "diario" }), diarioMb: Number.NaN };
      const resultado = cupoBanco(ajustes, 0, ahoraBase);
      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toContain("inválido");
    });

    it("limiteMb en ventana negativo: ventana ignorada, fuera de franja", () => {
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [{
          desde: "2026-11-16",
          hasta: "2026-11-16",
          horaDesde: "10:00",
          horaHasta: "12:00",
          limiteMb: -10,
        }],
      });
      const resultado = cupoBanco(ajustes, 10, new Date("2026-11-16T11:00:00"));
      expect(resultado.permitido).toBe(false);
    });

    it("fecha mal escrita en ventana (desde vacío): ventana ignorada", () => {
      const ajustes = crearAjustes({
        modo: "programado",
        ventanas: [{
          desde: "",
          hasta: "2026-11-16",
          horaDesde: "10:00",
          horaHasta: "12:00",
          limiteMb: 50,
        } as VentanaBanco],
      });
      const resultado = cupoBanco(ajustes, 10, new Date("2026-11-16T11:00:00"));
      expect(resultado.permitido).toBe(false);
    });

    it("ahora inválido (NaN Date): permitido=false con motivo claro", () => {
      const ajustes = crearAjustes({ modo: "diario", diarioMb: 100 });
      const resultado = cupoBanco(ajustes, 0, new Date(NaN));
      expect(resultado.permitido).toBe(false);
    });
  });
});