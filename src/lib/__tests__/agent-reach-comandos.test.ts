import { describe, it, expect } from "vitest";
import {
  IDS_CAPACIDADES,
  resolverComando,
  validarEntrada,
  leerSobre,
  type CapacidadId,
} from "@/lib/integrations/agent-reach-comandos";

describe("agent-reach-comandos", () => {
  describe("IDS_CAPACIDADES", () => {
    it("contiene todas las capacidades esperadas", () => {
      const esperadas: CapacidadId[] = [
        "web-search",
        "search",
        "read-web",
        "web",
        "rss",
        "youtube-transcript",
        "youtube",
        "github-read",
        "github",
        "bilibili",
        "health",
        "reddit",
        "reddit-search",
        "twitter",
      ];
      esperadas.forEach((id) => {
        expect(IDS_CAPACIDADES).toContain(id);
      });
    });
  });

  describe("resolverComando", () => {
    it("resuelve web-search con q y limit", () => {
      const r = resolverComando("web-search", { q: "test", limit: 5 });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toEqual(["web", "search", "test", "--limit", "5"]);
      }
    });

    it("resuelve search (alias) con q y limit por defecto", () => {
      const r = resolverComando("search", { query: "otro test" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toEqual(["web", "search", "otro test", "--limit", "5"]);
      }
    });

    it("resuelve read-web con url", () => {
      const r = resolverComando("read-web", { url: "https://example.com" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toEqual(["read", "https://example.com"]);
      }
    });

    it("resuelve youtube-transcript con url", () => {
      const r = resolverComando("youtube-transcript", { url: "https://youtube.com/watch?v=abc" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toEqual(["youtube", "subtitle", "https://youtube.com/watch?v=abc"]);
      }
    });

    it("resuelve github-read con repo", () => {
      const r = resolverComando("github-read", { repo: "owner/repo" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toEqual(["github", "read", "owner/repo"]);
      }
    });

    it("resuelve bilibili con q", () => {
      const r = resolverComando("bilibili", { q: "rust async" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toEqual(["bilibili", "search", "rust async"]);
      }
    });

    it("resuelve health sin args", () => {
      const r = resolverComando("health", {});
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toEqual(["version"]);
      }
    });

    it("rechaza capacidad desconocida", () => {
      const r = resolverComando("no-existe", { q: "test" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.motivo).toBe("DESCONOCIDA");
      }
    });

    it("rechaza reddit sin login habilitado", () => {
      const r = resolverComando("reddit-search", { q: "test" }, { login: false });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.motivo).toBe("NEED_LOGIN_BLOQUEADO");
      }
    });

    it("acepta reddit con login habilitado", () => {
      const r = resolverComando("reddit-search", { url: "https://reddit.com/r/test" }, { login: true });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toEqual(["read", "https://reddit.com/r/test"]);
      }
    });

    it("valida limit fuera de rango (acota a 1-20)", () => {
      const r = resolverComando("web-search", { q: "test", limit: 100 });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.argv).toContain("--limit");
        expect(r.argv).toContain("20");
      }
    });
  });

  describe("validarEntrada", () => {
    it("acepta query válida", () => {
      expect(validarEntrada("q", "búsqueda normal")).toBeNull();
    });

    it("rechaza query vacía", () => {
      expect(validarEntrada("q", "")).toBe("Falta el argumento (url, repo o q).");
    });

    it("rechaza query que empieza con guion", () => {
      expect(validarEntrada("q", "-injection")).toBe("Un argumento no puede empezar por «-».");
    });

    it("rechaza query demasiado larga", () => {
      const larga = "a".repeat(301);
      expect(validarEntrada("q", larga)).toBe("El argumento es demasiado largo.");
    });

    it("acepta URL válida https", () => {
      expect(validarEntrada("url", "https://example.com/path")).toBeNull();
    });

    it("acepta URL válida http", () => {
      expect(validarEntrada("url", "http://example.com/path")).toBeNull();
    });

    it("rechaza URL con protocolo inválido", () => {
      expect(validarEntrada("url", "ftp://example.com")).toBe("Solo se aceptan URLs http o https.");
    });

    it("rechaza URL con credenciales", () => {
      expect(validarEntrada("url", "https://user:pass@example.com")).toBe("La URL no puede llevar credenciales.");
    });

    it("rechaza localhost (SSRF)", () => {
      expect(validarEntrada("url", "http://localhost:3000")).toBe("No se leen hosts locales, privados ni de metadatos.");
    });

    it("rechaza IP privada 10.x (SSRF)", () => {
      expect(validarEntrada("url", "http://10.0.0.1")).toBe("No se leen hosts locales, privados ni de metadatos.");
    });

    it("rechaza IP privada 192.168.x (SSRF)", () => {
      expect(validarEntrada("url", "http://192.168.1.1")).toBe("No se leen hosts locales, privados ni de metadatos.");
    });

    it("acepta referencia GitHub owner/repo", () => {
      expect(validarEntrada("ref", "owner/repo")).toBeNull();
    });

    it("acepta referencia GitHub owner/repo/path", () => {
      expect(validarEntrada("ref", "owner/repo/src/file.ts")).toBeNull();
    });

    it("rechaza referencia GitHub inválida", () => {
      expect(validarEntrada("ref", "no-valido")).toBe("Referencia de GitHub inválida (dueño/repo).");
    });
  });

  describe("leerSobre", () => {
    it("parsea respuesta OK v1.6", () => {
      const json = JSON.stringify({
        ok: true,
        items: [
          { title: "Título 1", url: "https://a.com", author: "Autor", published_at: "2024-01-01", text: "Contenido 1" },
          { title: "Título 2", url: "https://b.com", text: "Contenido 2" },
        ],
      });
      const r = leerSobre(json);
      expect(r.ok).toBe(true);
      expect(r.items).toHaveLength(2);
      expect(r.content).toContain("### Título 1");
      expect(r.content).toContain("Fuente: https://a.com");
      expect(r.content).toContain("---");
    });

    it("parsea respuesta ERROR v1.6", () => {
      const json = JSON.stringify({
        ok: false,
        error: { code: "NEED_SETUP", hint: "Instala el CLI" },
      });
      const r = leerSobre(json);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe("NEED_SETUP");
      expect(r.error?.hint).toBe("Instala el CLI");
    });

    it("maneja JSON inválido", () => {
      const r = leerSobre("no es json");
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe("BAD_OUTPUT");
    });

    it("extrae JSON de salida con texto alrededor", () => {
      const salida = "algo antes\n{\"ok\":true,\"items\":[]}\nalgo después";
      const r = leerSobre(salida);
      expect(r.ok).toBe(true);
    });
  });
});