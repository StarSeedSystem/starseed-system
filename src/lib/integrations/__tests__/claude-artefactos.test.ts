import { describe, it, expect } from "vitest";
import {
  ACCION_ABRIR_EN_CLAUDE,
  CAPACIDAD_MCP,
  esEnlaceArtefacto,
  identificadorDeArtefacto,
  paqueteDeArtefacto,
  pasosConectorClaude,
  urlMcpSegura,
} from "../claude-artefactos";

const ARTEFACTO = "https://claude.ai/artifact/abc123";
const CODIGO = "https://claude.ai/code/artifact/550e8400-e29b-41d4-a716-446655440000";

describe("Claude · enlaces de artefacto", () => {
  it("acepta los dos formatos admitidos, con espacios o barra final", () => {
    expect(esEnlaceArtefacto(ARTEFACTO)).toBe(true);
    expect(esEnlaceArtefacto(CODIGO)).toBe(true);
    expect(esEnlaceArtefacto(`  ${ARTEFACTO}/  `)).toBe(true);
  });

  it("rechaza hosts, protocolos, rutas y uuid que no cuadran", () => {
    const malos = [
      "http://claude.ai/artifact/abc123",
      "https://claude.ai.evil.com/artifact/abc123",
      "https://evil.com/artifact/abc123",
      "https://claude.ai/artifact/",
      "https://claude.ai/artifact/abc123?token=secreto",
      "https://user:pass@claude.ai/artifact/abc123",
      "https://claude.ai:8443/artifact/abc123",
      "https://claude.ai/code/artifact/no-es-uuid",
      "javascript:alert(1)",
      "  ",
      null,
      undefined,
    ];
    for (const url of malos) expect(esEnlaceArtefacto(url), String(url)).toBe(false);
  });

  it("extrae el identificador de la URL", () => {
    expect(identificadorDeArtefacto(ARTEFACTO)).toBe("abc123");
    expect(identificadorDeArtefacto(CODIGO)).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(identificadorDeArtefacto("https://claude.ai/artifact/No_Valido-1")).toBe("No_Valido-1");
    expect(identificadorDeArtefacto("https://claude.ai/artifact/x\u0000y")).toBeNull();
  });
});

describe("Claude · paquete de Biblioteca", () => {
  it("crea un paquete externo con «Abrir en Claude»", () => {
    const p = paqueteDeArtefacto(` ${ARTEFACTO}/ `, "  Tablero de agentes  ");
    expect(p).not.toBeNull();
    expect(p?.id).toBe("claude-artefacto-abc123");
    expect(p?.kind).toBe("app");
    expect(p?.name).toBe("Tablero de agentes");
    expect(p?.payload.externalUrl).toBe(ARTEFACTO);
    expect(p?.payload.accion).toBe(ACCION_ABRIR_EN_CLAUDE);
    expect(p?.payload.capacidad).toBe(CAPACIDAD_MCP);
    expect(p?.payload.route).toBeUndefined();
    expect(p?.free).toBe(true);
  });

  it("usa un título de respaldo si no hay título", () => {
    const p = paqueteDeArtefacto(CODIGO);
    expect(p?.name).toContain("Artefacto de Claude");
    expect(p?.id).toBe("claude-artefacto-550e8400-e29b-41d4-a716-446655440000");
  });

  it("devuelve null si la URL no es un artefacto válido", () => {
    expect(paqueteDeArtefacto("https://claude.ai/artifact/abc?token=x")).toBeNull();
    expect(paqueteDeArtefacto("https://evil.com/artifact/abc123")).toBeNull();
  });
});

describe("Claude · URL MCP y pasos del conector", () => {
  it("acepta una URL pública https y rechaza cualquier posible secreto", () => {
    expect(urlMcpSegura(" https://genesis.example.com/api/mcp ")).toBe("https://genesis.example.com/api/mcp");
    expect(urlMcpSegura("http://genesis.example.com/api/mcp")).toBeNull();
    expect(urlMcpSegura("https://user:token@genesis.example.com/api/mcp")).toBeNull();
    expect(urlMcpSegura("https://genesis.example.com/api/mcp?token=secreto")).toBeNull();
    expect(urlMcpSegura("https://genesis.example.com/api/mcp#token")).toBeNull();
    expect(urlMcpSegura("")).toBeNull();
  });

  it("redacta los pasos de chats, Cowork y artefactos con la capacidad mcp", () => {
    const pasos = pasosConectorClaude("https://genesis.example.com/api/mcp");
    expect(pasos).toHaveLength(5);
    expect(pasos[0].copiar).toBe("https://genesis.example.com/api/mcp");
    for (const paso of pasos) {
      expect(paso.titulo.length).toBeGreaterThan(3);
      expect(paso.detalle.length).toBeGreaterThan(20);
    }
    const texto = pasos.map((p) => `${p.titulo} ${p.detalle}`).join(" ");
    expect(texto).toContain("claude.ai");
    expect(texto).toContain("Cowork");
    expect(texto).toContain("artefacto");
    expect(texto).toContain("watchTool");
    expect(texto).toContain("callTool");
  });

  it("no devuelve pasos ni filtra un token pegado en la URL", () => {
    const pasos = pasosConectorClaude("https://genesis.example.com/api/mcp?token=secreto");
    expect(pasos).toEqual([]);
    expect(JSON.stringify(pasos)).not.toContain("secreto");
    expect(pasosConectorClaude(undefined)).toEqual([]);
  });
});
