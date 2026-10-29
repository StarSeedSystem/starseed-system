import { describe, expect, it } from "vitest";
import { getIntegration } from "@/ai/astraura/integration-catalog";
import { getIntegration as getRegistro } from "@/lib/integrations/registry";
import { read_reddit, web_search } from "@/lib/integrations/clients/agent-reach";

const ficha = getIntegration("agent-reach");
const registro = getRegistro("agent-reach");
const comoTexto = (x: unknown): string => JSON.stringify(x);
const INSTALACION =
  "uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip";

describe("catálogo de integraciones · Agent-Reach 1.6 dice la verdad", () => {
  it("existe y no manda al paquete equivocado de PyPI ni a npx", () => {
    expect(ficha).not.toBeNull();
    expect(registro).toBeDefined();
    for (const texto of [comoTexto(ficha), comoTexto(registro)]) {
      expect(texto).not.toContain("pip install agent-reach");
      expect(texto).not.toContain("npx agent-reach");
      expect(texto).toContain(INSTALACION);
      expect(texto).toContain("PyPI");
    }
  });

  it("el repo y el watch usan la forma canónica", () => {
    expect(ficha?.repo).toBe("https://github.com/Panniantong/Agent-Reach");
    expect(ficha?.autoUpdate.github).toBe("Panniantong/Agent-Reach");
    expect(registro?.docsUrl).toBe("https://github.com/Panniantong/Agent-Reach");
  });

  it("las capacidades dicen la verdad y las acciones conservan sus ids", () => {
    const caps = (registro?.capabilities ?? []).join(" ");
    expect(caps).toContain("Exa");
    expect(caps).toContain("Jina Reader");
    expect(caps).toContain("GitHub");
    expect(caps).toContain("YouTube");
    expect(caps).toContain("V2EX");
    expect(caps).toContain("Bilibili");
    expect(caps).toMatch(/Reddit, X y LinkedIn/);
    expect(registro?.actions.map((a) => a.id)).toEqual([
      "web-search", "read-web", "youtube-transcript", "github-read", "reddit-search", "health",
    ]);
  });
});

describe("cliente Agent-Reach · R1", () => {
  it("Reddit devuelve NEED_LOGIN_BLOQUEADO como fallo normal", async () => {
    const r = await read_reddit({}, { url: "https://www.reddit.com/r/x" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("NEED_LOGIN_BLOQUEADO");
    expect(r.motivo).toBe("NEED_LOGIN_BLOQUEADO");
    expect(r.hint).toContain("Reddit");
  });

  it("una búsqueda sin q se rechaza sin tocar la red", async () => {
    const r = await web_search({}, {});
    expect(r).toMatchObject({ ok: false, error: "Indica el término de búsqueda (q)." });
  });
});
