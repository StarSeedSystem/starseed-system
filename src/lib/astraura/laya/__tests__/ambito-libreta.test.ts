import { describe, it, expect } from "vitest";
import {
  puedeLeer,
  puedeSalir,
  soloPublicoParaAdaptador,
  type AmbitoLibreta,
  type EjemploLibreta,
  type QuienPuedeLeer,
} from "../ambito-libreta";

const ejemploPrivado = (ambito: AmbitoLibreta): EjemploLibreta => ({
  id: "e1",
  punto: "test.punto",
  ambito,
  estado: "estado test",
  esPrivado: true,
});

const ejemploPublico = (ambito: AmbitoLibreta, aprobado: boolean = true): EjemploLibreta => ({
  id: "e2",
  punto: "test.punto",
  ambito,
  estado: "estado test",
  esPrivado: false,
  entidad: { tipo: "pagina", id: "p1", nombre: "Página test", aprobado },
});

describe("puedeLeer", () => {
  describe("personal", () => {
    it("solo el propietario puede leer", () => {
      expect(puedeLeer("personal", { esPropietario: true })).toBe(true);
      expect(puedeLeer("personal", { esPropietario: false })).toBe(false);
    });
  });

  describe("pagina", () => {
    it("solo si la entidad lo aprobó", () => {
      expect(puedeLeer("pagina", { esPropietario: true, aprobadoPorEntidad: true })).toBe(true);
      expect(puedeLeer("pagina", { esPropietario: true, aprobadoPorEntidad: false })).toBe(false);
      expect(puedeLeer("pagina", { esPropietario: false, aprobadoPorEntidad: true })).toBe(true);
    });
  });

  describe("grupo", () => {
    it("solo si la entidad lo aprobó", () => {
      expect(puedeLeer("grupo", { esPropietario: true, aprobadoPorEntidad: true })).toBe(true);
      expect(puedeLeer("grupo", { esPropietario: false, aprobadoPorEntidad: true })).toBe(true);
      expect(puedeLeer("grupo", { esPropietario: false, aprobadoPorEntidad: false })).toBe(false);
    });
  });

  describe("colectivo", () => {
    it("cualquiera con acceso al ámbito puede leer", () => {
      expect(puedeLeer("colectivo", { esPropietario: true, aprobadoPorEntidad: true })).toBe(true);
      expect(puedeLeer("colectivo", { esPropietario: false, aprobadoPorEntidad: true })).toBe(true);
      expect(puedeLeer("colectivo", { esPropietario: false, aprobadoPorEntidad: false })).toBe(true);
    });
  });

  describe("fabrica", () => {
    it("solo Alex puede leer (fuera del repo, se considera que no puede leer desde el código)", () => {
      expect(puedeLeer("fabrica", { esPropietario: true })).toBe(false);
      expect(puedeLeer("fabrica", { esPropietario: false })).toBe(false);
    });
  });
});

describe("puedeSalir", () => {
  describe("personal", () => {
    it("solo sale con elección explícita", () => {
      const ejemplo = ejemploPrivado("personal");
      expect(puedeSalir("personal", ejemplo, "explicito")).toBe(true);
      expect(puedeSalir("personal", ejemplo, "sal")).toBe(false);
      expect(puedeSalir("personal", ejemplo, "no-sal")).toBe(false);
    });

    it("ejemplo privado nunca sale", () => {
      expect(puedeSalir("personal", ejemploPrivado("personal"))).toBe(false);
    });
  });

  describe("pagina", () => {
    it("solo sale si la entidad está aprobada", () => {
      expect(puedeSalir("pagina", ejemploPublico("pagina", true))).toBe(true);
      expect(puedeSalir("pagina", ejemploPublico("pagina", false))).toBe(false);
    });

    it("ejemplo privado nunca sale", () => {
      expect(puedeSalir("pagina", ejemploPrivado("pagina"))).toBe(false);
    });
  });

  describe("grupo", () => {
    it("solo sale si la entidad está aprobada", () => {
      expect(puedeSalir("grupo", ejemploPublico("grupo", true))).toBe(true);
      expect(puedeSalir("grupo", ejemploPublico("grupo", false))).toBe(false);
    });

    it("ejemplo privado nunca sale", () => {
      expect(puedeSalir("grupo", ejemploPrivado("grupo"))).toBe(false);
    });
  });

  describe("colectivo", () => {
    it("solo admite ejemplos públicos", () => {
      expect(puedeSalir("colectivo", ejemploPublico("colectivo", true))).toBe(true);
      expect(puedeSalir("colectivo", ejemploPublico("colectivo", false))).toBe(true);
    });

    it("ejemplo privado nunca sale", () => {
      expect(puedeSalir("colectivo", ejemploPrivado("colectivo"))).toBe(false);
    });
  });

  describe("fabrica", () => {
    it("nunca sale al repo", () => {
      expect(puedeSalir("fabrica", ejemploPublico("fabrica", true))).toBe(false);
      expect(puedeSalir("fabrica", ejemploPrivado("fabrica"))).toBe(false);
    });
  });
});

describe("soloPublicoParaAdaptador", () => {
  describe("pagina", () => {
    it("solo aprobados y no privados", () => {
      const ejemplos: EjemploLibreta[] = [
        ejemploPublico("pagina", true),
        ejemploPublico("pagina", true),
      ];
      expect(soloPublicoParaAdaptador(ejemplos, "pagina")).toBe(true);

      const conPrivado = [...ejemplos, ejemploPrivado("pagina")];
      expect(soloPublicoParaAdaptador(conPrivado, "pagina")).toBe(false);

      const conNoAprobado = [...ejemplos, ejemploPublico("pagina", false)];
      expect(soloPublicoParaAdaptador(conNoAprobado, "pagina")).toBe(false);
    });
  });

  describe("grupo", () => {
    it("solo aprobados y no privados", () => {
      const ejemplos: EjemploLibreta[] = [
        ejemploPublico("grupo", true),
        ejemploPublico("grupo", true),
      ];
      expect(soloPublicoParaAdaptador(ejemplos, "grupo")).toBe(true);

      const conPrivado = [...ejemplos, ejemploPrivado("grupo")];
      expect(soloPublicoParaAdaptador(conPrivado, "grupo")).toBe(false);
    });
  });

  describe("personal", () => {
    it("siempre devuelve true (no es pagina ni grupo)", () => {
      expect(soloPublicoParaAdaptador([ejemploPrivado("personal")], "personal")).toBe(true);
    });
  });

  describe("colectivo", () => {
    it("solo aprobados y no privados", () => {
      const ejemplos: EjemploLibreta[] = [
        ejemploPublico("colectivo", true),
      ];
      expect(soloPublicoParaAdaptador(ejemplos, "colectivo")).toBe(true);

      const conNoAprobado = [...ejemplos, ejemploPublico("colectivo", false)];
      expect(soloPublicoParaAdaptador(conNoAprobado, "colectivo")).toBe(false);
    });
  });

  describe("fabrica", () => {
    it("siempre devuelve true (no es pagina ni grupo)", () => {
      expect(soloPublicoParaAdaptador([ejemploPrivado("fabrica")], "fabrica")).toBe(true);
    });
  });

  describe("lista vacía", () => {
    it("lista vacía es válida", () => {
      expect(soloPublicoParaAdaptador([], "pagina")).toBe(true);
      expect(soloPublicoParaAdaptador([], "grupo")).toBe(true);
      expect(soloPublicoParaAdaptador([], "colectivo")).toBe(true);
    });
  });
});