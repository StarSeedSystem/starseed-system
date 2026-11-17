import { describe, it, expect } from "vitest";
import { TEXTOS_INTERNET, TEXTOS_EXTRA_INTERNET, type TextosInternet } from "../textos-internet";

describe("TEXTOS_INTERNET", () => {
  const clavesRequeridas: (keyof TextosInternet)[] = [
    "bancoTitulo",
    "bancoAyuda",
    "racionDiaria",
    "programacion",
    "mb",
    "gb",
    "quedaHoy",
    "agotadoHoy",
    "meshTitulo",
    "meshAyuda",
    "meshSinLimite",
    "meshConLimite",
    "conexionLimitada",
    "conexionNoLimitada",
    "conexionDesconocida",
    "fuenteDeclarada",
    "fuenteNativa",
    "fuenteNavegador",
    "sugerirTitulo",
    "sugerirCuerpo",
    "sugerirActivar",
    "sugerirAhoraNo",
    "audMiCuenta",
    "audEntidad",
    "audPublico",
  ];

  it("tiene todas las claves requeridas y no están vacías", () => {
    for (const clave of clavesRequeridas) {
      const valor = TEXTOS_INTERNET[clave];
      expect(valor).toBeDefined();
      if (typeof valor === "string") {
        expect(valor.trim().length).toBeGreaterThan(0);
      } else if (typeof valor === "function") {
        expect(typeof valor).toBe("function");
      }
    }
  });

  it("no contiene 'Mando' en ningún texto", () => {
    const textos = Object.values(TEXTOS_INTERNET).filter((v): v is string => typeof v === "string");
    for (const texto of textos) {
      expect(texto.toLowerCase()).not.toContain("mando");
    }
  });

  it("no contiene 'llamadas' en ningún texto", () => {
    const textos = Object.values(TEXTOS_INTERNET).filter((v): v is string => typeof v === "string");
    for (const texto of textos) {
      expect(texto.toLowerCase()).not.toContain("llamadas");
    }
  });

  it("no contiene 'banco de llamadas' en ningún texto", () => {
    const textos = Object.values(TEXTOS_INTERNET).filter((v): v is string => typeof v === "string");
    for (const texto de textos) {
      expect(texto.toLowerCase()).not.toContain("banco de llamadas");
    }
  });

  it("'modo banco' aparece en bancoTitulo", () => {
    expect(TEXTOS_INTERNET.bancoTitulo.toLowerCase()).toContain("modo banco");
  });

  it("'modo mesh' aparece en meshTitulo", () => {
    expect(TEXTOS_INTERNET.meshTitulo.toLowerCase()).toContain("modo mesh");
  });

  describe("bancoAyuda", () => {
    it("explica que sirve para cuando el internet es limitado y se reparte datos entre neuronas", () => {
      const ayuda = TEXTOS_INTERNET.bancoAyuda.toLowerCase();
      expect(ayuda).toContain("limitado");
      expect(ayuda).toContain("repart");
    });
  });

  describe("meshAyuda", () => {
    it("explica que comparte internet por la malla P2P, con o sin límite", () => {
      const ayuda = TEXTOS_INTERNET.meshAyuda.toLowerCase();
      expect(ayuda).toContain("malla");
      expect(ayuda).toContain("p2p");
    });
  });

  describe("sugerirCuerpo", () => {
    it("dice que la conexión parece de pago", () => {
      expect(TEXTOS_INTERNET.sugerirCuerpo.toLowerCase()).toContain("pago");
    });
    it("dice que es solo una sugerencia", () => {
      expect(TEXTOS_INTERNET.sugerirCuerpo.toLowerCase()).toContain("sugerencia");
    });
    it("dice que nada cambia hasta que la persona acepte", () => {
      const cuerpo = TEXTOS_INTERNET.sugerirCuerpo.toLowerCase();
      expect(cuerpo).toContain("acept");
    });
  });

  describe("quedaHoy", () => {
    it("formatea 512 MB terminando en 'MB'", () => {
      expect(TEXTOS_INTERNET.quedaHoy(512)).toMatch(/MB$/);
    });

    it("formatea 2048 MB como '2,0 GB'", () => {
      expect(TEXTOS_INTERNET.quedaHoy(2048)).toContain("2,0 GB");
    });

    it("formatea 1000 MB como '1,0 GB'", () => {
      expect(TEXTOS_INTERNET.quedaHoy(1000)).toContain("1,0 GB");
    });

    it("formatea 999 MB como '999 MB'", () => {
      expect(TEXTOS_INTERNET.quedaHoy(999)).toContain("999 MB");
    });

    it("formatea 1536 MB como '1,5 GB'", () => {
      expect(TEXTOS_INTERNET.quedaHoy(1536)).toContain("1,5 GB");
    });
  });

  describe("meshConLimite", () => {
    it("formatea 512 MB terminando en 'MB'", () => {
      expect(TEXTOS_INTERNET.meshConLimite(512)).toMatch(/MB$/);
    });

    it("formatea 2048 MB como '2,0 GB'", () => {
      expect(TEXTOS_INTERNET.meshConLimite(2048)).toContain("2,0 GB");
    });

    it("formatea 1000 MB como '1,0 GB'", () => {
      expect(TEXTOS_INTERNET.meshConLimite(1000)).toContain("1,0 GB");
    });
  });
});

describe("TEXTOS_EXTRA_INTERNET", () => {
  const clavesExtra: (keyof typeof TEXTOS_EXTRA_INTERNET)[] = [
    "desde",
    "hasta",
    "limite",
    "compartirConOtros",
    "declararDePago",
    "declararNoDePago",
  ];

  it("tiene todas las claves requeridas y no están vacías", () => {
    for (const clave of clavesExtra) {
      const valor = TEXTOS_EXTRA_INTERNET[clave];
      expect(valor).toBeDefined();
      expect(valor.trim().length).toBeGreaterThan(0);
    }
  });

  it("no contiene 'Mando' en ningún texto", () => {
    for (const clave of clavesExtra) {
      expect(TEXTOS_EXTRA_INTERNET[clave].toLowerCase()).not.toContain("mando");
    }
  });
});