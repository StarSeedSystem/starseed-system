/**
 * Pruebas de las funciones puras de tokens externos para MCP (Ola 1019G · GCA1019T).
 * Solo se importan funciones de `tokens-externos.ts` (nada de Node, ni route,
 * ni parches de módulos): son pruebas de lógica, no de la capa de almacenamiento.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  crearToken,
  verificarToken,
  injectStore,
} from "@/lib/genesis/mcp/tokens-externos";

type TokenDataMock = {
  ambito: string;
  alcance: string;
  caduca: string;
  usosMaximos: number;
  usosActuales: number;
};

// Mock store using a Map
const mockStore = new Map<string, TokenDataMock>();

const mockTokenStore = {
  save: async (hash: string, data: TokenDataMock) => {
    mockStore.set(hash, data);
  },
  findByHash: async (hash: string) => mockStore.get(hash) ?? null,
};

beforeEach(() => {
  mockStore.clear();
  injectStore(mockTokenStore);
});

describe("crearToken", () => {
  it("devuelve token con prefijo ssk_", async () => {
    const token = await crearToken("a", "r", new Date("2030-01-01"));
    expect(token.startsWith("ssk_")).toBe(true);
  });

  it("genera tokens únicos", async () => {
    const t1 = await crearToken("a", "r", new Date("2030-01-01"));
    const t2 = await crearToken("a", "r", new Date("2030-01-01"));
    expect(t1).not.toBe(t2);
  });
});

describe("verificarToken", () => {
  it("devuelve datos para token válido", async () => {
    const ambito = "acc";
    const alcance = "lec";
    const caduca = new Date("2030-01-01");
    const token = await crearToken(ambito, alcance, caduca, 1);
    const result = await verificarToken(token);
    expect(result).toEqual({ ambito, alcance });
  });

  it("devuelve null para token inexistente", async () => {
    const fake = "ssk_" + "a".repeat(8) + "_" + "b".repeat(32);
    expect(await verificarToken(fake)).toBeNull();
  });

  it("devuelve null para token caducado", async () => {
    const token = await crearToken("a", "r", new Date("2020-01-01"), 1);
    expect(await verificarToken(token)).toBeNull();
  });

  it("respeta límite de usos", async () => {
    const token = await crearToken("a", "r", new Date("2030-01-01"), 2);
    let res = await verificarToken(token);
    expect(res).toEqual({ ambito: "a", alcance: "r" });
    res = await verificarToken(token);
    expect(res).toEqual({ ambito: "a", alcance: "r" });
    res = await verificarToken(token);
    expect(res).toBeNull();
  });

  it("no incrementa uso con token inválido", async () => {
    const token = await crearToken("a", "r", new Date("2030-01-01"), 1);
    await verificarToken(token); // first use
    await verificarToken("invalid"); // invalid
    const res = await verificarToken(token);
    expect(res).toBeNull();
  });
});