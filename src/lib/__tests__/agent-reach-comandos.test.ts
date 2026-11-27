import { describe, it, expect } from "vitest";
import { resolverComando, validarEntrada, IDS_CAPACIDADES, leerSobre, HINT_INSTALACION } from "@/lib/integrations/agent-reach-comandos";

describe("agent-reach-comandos", () => {
  describe("IDS_CAPACIDADES", () => {
    it("includes expected capability ids", () => {
      expect(IDS_CAPACIDADES).toContain("web-search");
      expect(IDS_CAPACIDADES).toContain("read-web");
      expect(IDS_CAPACIDADES).toContain("youtube-transcript");
      expect(IDS_CAPACIDADES).toContain("github-read");
      expect(IDS_CAPACIDADES).toContain("health");
    });
  });

  describe("resolverComando", () => {
    it("resolves web-search with query and limit", () => {
      const result = resolverComando("web-search", { q: "test query", limit: 10 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["web", "search", "test query", "--limit", "10"]);
      }
    });

    it("resolves search alias", () => {
      const result = resolverComando("search", { query: "rust async" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["web", "search", "rust async", "--limit", "5"]);
      }
    });

    it("resolves read-web with url", () => {
      const result = resolverComando("read-web", { url: "https://example.com/page" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["read", "https://example.com/page"]);
      }
    });

    it("resolves youtube-transcript with url", () => {
      const result = resolverComando("youtube-transcript", { url: "https://youtube.com/watch?v=abc123" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["youtube", "subtitle", "https://youtube.com/watch?v=abc123"]);
      }
    });

    it("resolves github-read with repo ref", () => {
      const result = resolverComando("github-read", { repo: "owner/repo" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["github", "read", "owner/repo"]);
      }
    });

    it("rejects unknown capability", () => {
      const result = resolverComando("unknown", { q: "test" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.motivo).toBe("DESCONOCIDA");
      }
    });

    it("rejects session-required capability when login disabled", () => {
      const result = resolverComando("reddit", { url: "https://reddit.com/r/test" }, { login: false });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.motivo).toBe("NEED_LOGIN_BLOQUEADO");
      }
    });

    it("accepts session-required capability when login enabled", () => {
      const result = resolverComando("reddit", { url: "https://reddit.com/r/test" }, { login: true });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["read", "https://reddit.com/r/test"]);
      }
    });

    it("validates missing query", () => {
      const result = resolverComando("web-search", {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.motivo).toBe("BAD_INPUT");
      }
    });

    it("validates argument starting with dash", () => {
      const result = resolverComando("web-search", { q: "-invalid" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.motivo).toBe("BAD_INPUT");
      }
    });

    it("clamps limit to 1-20 range", () => {
      const result = resolverComando("web-search", { q: "test", limit: 100 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toContain("--limit");
        expect(result.argv).toContain("20");
      }
    });
  });

  describe("validarEntrada", () => {
    it("accepts valid query", () => {
      expect(validarEntrada("q", "valid query")).toBeNull();
    });

    it("rejects empty query", () => {
      expect(validarEntrada("q", "")).toBe("Falta el argumento (url, repo o q).");
    });

    it("rejects query with control characters", () => {
      expect(validarEntrada("q", "query\x00")).toBe("El argumento lleva caracteres de control.");
    });

    it("accepts valid URL", () => {
      expect(validarEntrada("url", "https://example.com")).toBeNull();
    });

    it("rejects invalid URL", () => {
      expect(validarEntrada("url", "not-a-url")).toBe("URL inválida.");
    });

    it("rejects localhost URLs", () => {
      expect(validarEntrada("url", "http://localhost:3000")).toBe("No se leen hosts locales, privados ni de metadatos.");
    });

    it("rejects private IP URLs", () => {
      expect(validarEntrada("url", "http://192.168.1.1")).toBe("No se leen hosts locales, privados ni de metadatos.");
    });

    it("rejects URL with credentials", () => {
      expect(validarEntrada("url", "https://user:pass@example.com")).toBe("La URL no puede llevar credenciales.");
    });

    it("accepts valid github ref", () => {
      expect(validarEntrada("ref", "owner/repo")).toBeNull();
    });

    it("rejects invalid github ref", () => {
      expect(validarEntrada("ref", "invalid")).toBe("Referencia de GitHub inválida (dueño/repo).");
    });
  });

  describe("leerSobre", () => {
    it("parses successful agent-reach output", () => {
      const output = JSON.stringify({
        ok: true,
        items: [
          { title: "Test Title", url: "https://example.com", author: "Author", published_at: "2024-01-01", text: "Content" }
        ]
      });
      const result = leerSobre(output);
      expect(result.ok).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Test Title");
      expect(result.content).toContain("Test Title");
    });

    it("parses error output from agent-reach", () => {
      const output = JSON.stringify({
        ok: false,
        error: { code: "NEED_LOGIN", hint: "Login required" }
      });
      const result = leerSobre(output);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NEED_LOGIN");
    });

    it("handles non-JSON output", () => {
      const result = leerSobre("not json at all");
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BAD_OUTPUT");
    });

    it("extracts JSON from mixed output", () => {
      const output = "some text\n{\"ok\":true,\"items\":[]}\nmore text";
      const result = leerSobre(output);
      expect(result.ok).toBe(true);
    });
  });

  describe("HINT_INSTALACION", () => {
    it("contains installation instruction", () => {
      expect(HINT_INSTALACION).toContain("uv tool install");
      expect(HINT_INSTALACION).toContain("Agent-Reach");
    });
  });
});