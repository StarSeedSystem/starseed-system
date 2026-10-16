import { describe, it, expect } from "vitest";

import type {
  ConectorCerebro,
  EstadoConector,
  TipoConector,
} from "../conectores";
import {
  alternarEnCerebro,
  cuentaPorEstado,
  claveConectores,
  reunirConectores,
} from "../conectores";

describe("conectores (lógica pura)", () => {
  describe("reunirConectores", () => {
    it("une todos los tipos de conectores", () => {
      const f = {
        conectores: [
          { id: "github", name: "GitHub", status: "connected" },
          { id: "google", name: "Google", status: "needs-auth" },
          { id: "rss", name: "RSS", status: "available" },
        ],
        integraciones: [
          { id: "crawl4ai", name: "Crawl4AI", configurada: true, error: null },
          { id: "firecrawl", name: "Firecrawl", configurada: false, error: null },
          { id: "typesense", name: "Typesense", configurada: true, error: "API error" },
        ],
        mcp: [
          { id: "mcp1", name: "MCP 1", enlazada: true },
          { id: "mcp2", name: "MCP 2", enlazada: false },
        ],
        externos: [
          { id: "ext1", nombre: "Cuenta 1", revocado: false, expira_en: null },
          { id: "ext2", nombre: "Cuenta 2", revocado: true, expira_en: null },
          { id: "ext3", nombre: "Cuenta 3", revocado: false, expira_en: "2020-01-01" },
        ],
        canales: [
          { id: "terminal", name: "Terminal", activo: true },
          { id: "starseed", name: "StarSeed", activo: false },
          { id: "telegram", name: "Telegram", activo: true },
        ],
      };

      const ahora = Date.now();
      const enCerebro: readonly string[] = [
        "conector:github",
        "integracion:crawl4ai",
        "mcp:mcp1",
        "canal:terminal",
      ];

      const resultado = reunirConectores(f, enCerebro, ahora);

      // Verificar que se procesaron todos los elementos
      expect(resultado.length).toBe(14);

      // Verificar tipos y estados correctos
      const github = resultado.find((c) => c.id === "conector:github");
      expect(github).toBeDefined();
      expect(github?.tipo).toBe("conector");
      expect(github?.estado).toBe("conectado");
      expect(github?.enCerebro).toBe(true);

      const google = resultado.find((c) => c.id === "conector:google");
      expect(google).toBeDefined();
      expect(google?.tipo).toBe("conector");
      expect(google?.estado).toBe("falta-clave");
      expect(google?.enCerebro).toBe(false);

      const rss = resultado.find((c) => c.id === "conector:rss");
      expect(rss).toBeDefined();
      expect(rss?.tipo).toBe("conector");
      expect(rss?.estado).toBe("disponible");
      expect(rss?.enCerebro).toBe(false);

      const crawl4ai = resultado.find((c) => c.id === "integracion:crawl4ai");
      expect(crawl4ai).toBeDefined();
      expect(crawl4ai?.tipo).toBe("integracion");
      expect(crawl4ai?.estado).toBe("conectado");
      expect(crawl4ai?.enCerebro).toBe(true);

      const firecrawl = resultado.find((c) => c.id === "integracion:firecrawl");
      expect(firecrawl).toBeDefined();
      expect(firecrawl?.tipo).toBe("integracion");
      expect(firecrawl?.estado).toBe("falta-clave");
      expect(firecrawl?.enCerebro).toBe(false);

      const typesense = resultado.find((c) => c.id === "integracion:typesense");
      expect(typesense).toBeDefined();
      expect(typesense?.tipo).toBe("integracion");
      expect(typesense?.estado).toBe("error");
      expect(typesense?.enCerebro).toBe(false);

      const mcp1 = resultado.find((c) => c.id === "mcp:mcp1");
      expect(mcp1).toBeDefined();
      expect(mcp1?.tipo).toBe("mcp");
      expect(mcp1?.estado).toBe("conectado");
      expect(mcp1?.enCerebro).toBe(true);

      const mcp2 = resultado.find((c) => c.id === "mcp:mcp2");
      expect(mcp2).toBeDefined();
      expect(mcp2?.tipo).toBe("mcp");
      expect(mcp2?.estado).toBe("disponible");
      expect(mcp2?.enCerebro).toBe(false);

      const ext1 = resultado.find((c) => c.id === "externo:ext1");
      expect(ext1).toBeDefined();
      expect(ext1?.tipo).toBe("cuenta-externa");
      expect(ext1?.estado).toBe("disponible");
      expect(ext1?.enCerebro).toBe(false);

      const ext2 = resultado.find((c) => c.id === "externo:ext2");
      expect(ext2).toBeDefined();
      expect(ext2?.tipo).toBe("cuenta-externa");
      expect(ext2?.estado).toBe("error");
      expect(ext2?.enCerebro).toBe(false);

      const ext3 = resultado.find((c) => c.id === "externo:ext3");
      expect(ext3).toBeDefined();
      expect(ext3?.tipo).toBe("cuenta-externa");
      expect(ext3?.estado).toBe("error"); // expirado
      expect(ext3?.enCerebro).toBe(false);

      const terminal = resultado.find((c) => c.id === "canal:terminal");
      expect(terminal).toBeDefined();
      expect(terminal?.tipo).toBe("canal");
      expect(terminal?.estado).toBe("conectado");
      expect(terminal?.enCerebro).toBe(true);

      const starseed = resultado.find((c) => c.id === "canal:starseed");
      expect(starseed).toBeDefined();
      expect(starseed?.tipo).toBe("canal");
      expect(starseed?.estado).toBe("disponible");
      expect(starseed?.enCerebro).toBe(false);

      const telegram = resultado.find((c) => c.id === "canal:telegram");
      expect(telegram).toBeDefined();
      expect(telegram?.tipo).toBe("canal");
      expect(telegram?.estado).toBe("conectado");
      expect(telegram?.enCerebro).toBe(false);
    });

    it("ordena correctamente por estado y luego por nombre", () => {
      const f = {
        conectores: [
          { id: "z", name: "Zeta", status: "available" },
          { id: "a", name: "Alpha", status: "connected" },
          { id: "m", name: "Miguel", status: "needs-auth" },
          { id: "b", name: "Beta", status: "connected" },
        ],
        integraciones: [
          { id: "e", name: "Error", configurada: true, error: "Algo falló" },
        ],
        mcp: [],
        externos: [],
        canales: [],
      };

      const resultado = reunirConectores(f, [], Date.now());

      // El orden esperado es: conectado (Alpha, Beta), falta-clave (Miguel), error (Error), disponible (Zeta)
      expect(resultado[0]?.id).toBe("conector:a"); // Alpha
      expect(resultado[1]?.id).toBe("conector:b"); // Beta
      expect(resultado[2]?.id).toBe("conector:m"); // Miguel
      expect(resultado[3]?.id).toBe("integracion:e"); // Error
      expect(resultado[4]?.id).toBe("conector:z"); // Zeta
    });
  });

  describe("alternarEnCerebro", () => {
    it("añade un ID que no está en la lista", () => {
      const ids = ["a", "b"];
      const resultado = alternarEnCerebro(ids, "c");
      expect(resultado).toEqual(["a", "b", "c"]);
    });

    it("elimina un ID que está en la lista", () => {
      const ids = ["a", "b", "c"];
      const resultado = alternarEnCerebro(ids, "b");
      expect(resultado).toEqual(["a", "c"]);
    });

    it("devuelve una nueva lista sin mutar la original", () => {
      const ids = ["a", "b"];
      const resultado = alternarEnCerebro(ids, "c");
      expect(resultado).not.toBe(ids);
      expect(ids).toEqual(["a", "b"]);
    });
  });

  describe("claveConectores", () => {
    it("devuelve la clave correcta para un brainId", () => {
      expect(claveConectores("cerebro123")).toBe(
        "starseed.brain.cerebro123.conectores"
      );
    });
  });

  describe("cuentaPorEstado", () => {
    it("cuenta correctamente los elementos por estado", () => {
      const lista: ConectorCerebro[] = [
        { id: "1", nombre: "A", tipo: "conector", estado: "conectado", enCerebro: true, enlace: "" },
        { id: "2", nombre: "B", tipo: "conector", estado: "conectado", enCerebro: false, enlace: "" },
        { id: "3", nombre: "C", tipo: "conector", estado: "falta-clave", enCerebro: false, enlace: "" },
        { id: "4", nombre: "D", tipo: "conector", estado: "error", enCerebro: true, enlace: "" },
        { id: "5", nombre: "E", tipo: "conector", estado: "disponible", enCerebro: false, enlace: "" },
        { id: "6", nombre: "F", tipo: "conector", estado: "disponible", enCerebro: true, enlace: "" },
      ];

      const cuenta = cuentaPorEstado(lista);
      expect(cuenta.conectado).toBe(2);
      expect(cuenta["falta-clave"]).toBe(1);
      expect(cuenta.error).toBe(1);
      expect(cuenta.disponible).toBe(2);
    });

    it("devuelve ceros para una lista vacía", () => {
      const cuenta = cuentaPorEstado([]);
      expect(cuenta.conectado).toBe(0);
      expect(cuenta["falta-clave"]).toBe(0);
      expect(cuenta.error).toBe(0);
      expect(cuenta.disponible).toBe(0);
    });
  });
});