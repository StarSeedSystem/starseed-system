import { describe, it, expect } from "vitest";
import { procesar } from "../../.agent/skills/mcp-sqlite/index";

describe("mcp-sqlite", () => {
  const dbPath = ":memory:";

  describe("initialize", () => {
    it("devuelve protocolVersion 2025-03-26", () => {
      const r = procesar({ jsonrpc: "2.0", id: 1, method: "initialize" }, dbPath);
      expect(r.result.protocolVersion).toBe("2025-03-26");
    });

    it("devuelve serverInfo con nombre correcto", () => {
      const r = procesar({ jsonrpc: "2.0", id: 1, method: "initialize" }, dbPath);
      expect(r.result.serverInfo.name).toBe("starseed-sqlite");
    });

    it("devuelve instructions", () => {
      const r = procesar({ jsonrpc: "2.0", id: 1, method: "initialize" }, dbPath);
      expect(r.result.instructions.toLowerCase()).toContain("starseed");
    });
  });

  describe("ping", () => {
    it("devuelve resultado vacío", () => {
      const r = procesar({ jsonrpc: "2.0", id: 1, method: "ping" }, dbPath);
      expect(r.result).toEqual({});
    });
  });

  describe("tools/list", () => {
    it("devuelve las 4 herramientas", () => {
      const r = procesar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, dbPath);
      const nombres = r.result.tools.map((t: { name: string }) => t.name);
      expect(nombres).toEqual(expect.arrayContaining([
        "sqlite_consultar",
        "sqlite_taberas",
        "sqlite_esquema",
        "sqlite_contar"
      ]));
    });
  });

  describe("sqlite_consultar", () => {
    it("ejecuta SQL valido", () => {
      const r = procesar({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "sqlite_consultar", arguments: { sql: "SELECT 1 as test" } }
      }, dbPath);
      expect(r.result).toBeDefined();
      expect(r.result.content[0].text).toBeDefined();
    });

    it("requiere sql", () => {
      const r = procesar({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "sqlite_consultar", arguments: {} }
      }, dbPath);
      expect(r.result.isError).toBe(true);
    });
  });

  describe("sqlite_contar", () => {
    it("requiere tabla", () => {
      const r = procesar({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "sqlite_contar", arguments: {} }
      }, dbPath);
      expect(r.result.isError).toBe(true);
    });
  });

  describe("herramienta desconocida", () => {
    it("devuelve error -32602", () => {
      const r = procesar({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "no_existe", arguments: {} }
      }, dbPath);
      expect(r.error.code).toBe(-32602);
    });
  });
});