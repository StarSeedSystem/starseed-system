import { describe, it, expect } from "vitest";
import {
  reunirConectores,
  alternarEnCerebro,
  claveConectores,
  cuentaPorEstado,
  type FuentesConectores,
} from "../conectores";

const fuentes: FuentesConectores = {
  conectores: [
    { id: "searx", name: "SearXNG", status: "connected" },
    { id: "gemini", name: "Gemini", status: "needs-auth" },
    { id: "local", name: "Ollama", status: "available" },
    { id: "roto", name: "SinEstado" },
  ],
  integraciones: [
    { id: "n8n", name: "n8n", configurada: true },
    { id: "dify", name: "Dify", configurada: false },
    { id: "mala", name: "Mala", configurada: true, error: "404" },
  ],
  mcp: [
    { id: "fs", name: "FS", enlazada: true },
    { id: "web", name: "Web", enlazada: false },
  ],
  externos: [
    { id: "e1", nombre: "Cuenta A", revocado: false, expira_en: null },
    { id: "e2", nombre: "Cuenta B", revocado: true, expira_en: null },
    { id: "e3", nombre: "Cuenta C", revocado: false, expira_en: "2020-01-01T00:00:00Z" },
    { id: "e4", nombre: "Cuenta D", revocado: false, expira_en: "2999-01-01T00:00:00Z" },
  ],
  canales: [
    { id: "telegram", name: "Telegram", activo: true },
    { id: "slack", name: "Slack", activo: false },
  ],
};

const AHORA = new Date("2026-10-13T00:00:00Z").getTime();

describe("reunirConectores", () => {
  const lista = reunirConectores(fuentes, ["mcp:fs", "canal:slack"], AHORA);

  it("prefija los ids por tipo", () => {
    expect(lista.map((c) => c.id)).toContain("conector:searx");
    expect(lista.map((c) => c.id)).toContain("externo:e1");
    expect(lista.map((c) => c.id)).toContain("canal:telegram");
    expect(lista).toHaveLength(15);
  });

  it("mapea los estados: connected→conectado, needs-auth→falta-clave, resto→disponible", () => {
    const porId = Object.fromEntries(lista.map((c) => [c.id, c.estado]));
    expect(porId["conector:searx"]).toBe("conectado");
    expect(porId["conector:gemini"]).toBe("falta-clave");
    expect(porId["conector:local"]).toBe("disponible");
    expect(porId["conector:roto"]).toBe("disponible");
    expect(porId["integracion:mala"]).toBe("error");
    expect(porId["mcp:fs"]).toBe("conectado");
    expect(porId["canal:slack"]).toBe("disponible");
  });

  it("externos revocados o caducados → error; vigentes → conectado", () => {
    const porId = Object.fromEntries(lista.map((c) => [c.id, c.estado]));
    expect(porId["externo:e1"]).toBe("conectado");
    expect(porId["externo:e2"]).toBe("error");
    expect(porId["externo:e3"]).toBe("error");
    expect(porId["externo:e4"]).toBe("conectado");
  });

  it("marca enCerebro solo en los ids seleccionados", () => {
    expect(lista.find((c) => c.id === "mcp:fs")?.enCerebro).toBe(true);
    expect(lista.find((c) => c.id === "conector:searx")?.enCerebro).toBe(false);
  });

  it("ordena por estado (conectado, falta-clave, error, disponible) y por nombre", () => {
    const estados = lista.map((c) => c.estado);
    const ordenDe: Record<string, number> = { conectado: 0, "falta-clave": 1, error: 2, disponible: 3 };
    for (let i = 1; i < estados.length; i++) {
      expect(ordenDe[estados[i]]).toBeGreaterThanOrEqual(ordenDe[estados[i - 1]]);
    }
    const conectados = lista.filter((c) => c.estado === "conectado").map((c) => c.nombre);
    expect(conectados).toEqual([...conectados].sort((a, b) => a.localeCompare(b, "es")));
  });
});

describe("alternarEnCerebro", () => {
  it("añade si no está y quita si está, sin mutar", () => {
    const base = ["a", "b"];
    expect(alternarEnCerebro(base, "c")).toEqual(["a", "b", "c"]);
    expect(alternarEnCerebro(base, "a")).toEqual(["b"]);
    expect(base).toEqual(["a", "b"]);
  });
});

describe("claveConectores", () => {
  it("usa el prefijo por cerebro", () => {
    expect(claveConectores("abc")).toBe("starseed.brain.abc.conectores");
  });
});

describe("cuentaPorEstado", () => {
  it("cuenta por cada estado e inicia en 0 los ausentes", () => {
    const lista = reunirConectores(fuentes, [], AHORA);
    const c = cuentaPorEstado(lista);
    expect(c.conectado).toBe(6);
    expect(c["falta-clave"]).toBe(1);
    expect(c.error).toBe(3);
    expect(c.disponible).toBe(5);
    expect(cuentaPorEstado([])).toEqual({ conectado: 0, "falta-clave": 0, disponible: 0, error: 0 });
  });
});
