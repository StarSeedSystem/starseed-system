import { describe, it, expect } from "vitest";
import {
  CAPACIDADES,
  CODIGO_NEED_LOGIN,
  resolver,
  validarEntrada,
  leerSobre,
  type ComandoEntrada,
} from "../agent-reach-comandos";

describe("agent-reach-comandos · mapa de capacidades", () => {
  it("ids nuevos del cliente → argv de la v1.6", () => {
    expect(resolver("web-search", { q: "starseed os", limit: 5 }).argv).toEqual(["web", "search", "starseed os", "--limit", "5"]);
    expect(resolver("read-web", { url: "https://example.com/a" }).argv).toEqual(["read", "https://example.com/a"]);
    expect(resolver("youtube-transcript", { url: "https://example.com/v" }).argv).toEqual(["youtube", "subtitle", "https://example.com/v"]);
    expect(resolver("github-read", { url: "https://github.com/x/y" }).argv).toEqual(["github", "read", "https://github.com/x/y"]);
  });

  it("ids viejos de la v1.5 también funcionan", () => {
    expect(resolver("search", { url: "redes de ayuda mutua" }).argv?.slice(0, 3)).toEqual(["web", "search", "redes de ayuda mutua"]);
    expect(resolver("youtube", { url: "https://example.com/v" }).argv?.slice(0, 2)).toEqual(["youtube", "subtitle"]);
    expect(resolver("github", { repo: "x/y" }).argv).toEqual(["github", "read", "x/y"]);
    expect(resolver("rss", { feed: "https://example.com/rss" }).argv?.[0]).toBe("read");
    expect(resolver("health")).toEqual({ ok: true, argv: ["version"] });
    expect(resolver("bilibili", { q: "estrellas" }).argv?.[0]).toBe("bilibili");
    expect(Object.keys(CAPACIDADES)).toContain("web-search");
  });

  it("capacidad desconocida → NOT_FOUND", () => {
    expect(resolver("tiktok").codigo).toBe("NOT_FOUND");
    expect(resolver("tiktok", { q: "x" }).ok).toBe(false);
  });
});

describe("R1 · canales con sesión bloqueados", () => {
  it("reddit, twitter y similares dan NEED_LOGIN_BLOQUEADO", () => {
    for (const id of ["reddit", "reddit-search", "twitter", "linkedin", "facebook"]) {
      const r = resolver(id, { url: "https://example.com/p" });
      expect(r.ok).toBe(false);
      expect(r.codigo).toBe(CODIGO_NEED_LOGIN);
      expect(r.hint).toContain("R1");
    }
  });

  it("el canal bloqueado nunca produce argv ejecutable", () => {
    expect(CAPACIDADES["reddit"]({}, false).argv).toBeUndefined();
  });
});

describe("validarEntrada · SSRF e inyección", () => {
  const entra = (e: ComandoEntrada) => validarEntrada(e).ok;
  it("acepta http/https con host público", () => {
    expect(entra({ url: "https://example.com/r?x=1" })).toBe(true);
    expect(entra({ q: "ayuda mutua" })).toBe(true);
  });
  it("rechaza hosts locales, privados y metadatos de nube", () => {
    for (const u of [
      "http://localhost/a", "https://127.0.0.1/a", "http://192.168.1.3/a", "http://10.0.0.1/a",
      "http://172.16.0.5/a", "http://169.254.169.254/latest/meta-data/", "https://metadata.google.internal/",
      "http://[::1]:3000/", "ftp://example.com/a", "javascript:alerta",
    ]) expect(entra({ url: u })).toBe(false);
  });
  it("rechaza consulta larga y argumentos que inyectan opciones", () => {
    expect(entra({ q: "x".repeat(301) })).toBe(false);
    expect(entra({ q: "-h" })).toBe(false);
    expect(entra({ url: "--help" })).toBe(false);
    expect(validarEntrada({}).ok).toBe(false);
  });
});

describe("leerSobre · parseo del JSON de la v1.6", () => {
  const jsonOk = JSON.stringify({
    ok: true,
    items: [{ title: "Título", url: "https://example.com/", text: "Resumen." }, { url: "https://example.com/2", author: "Alguien" }],
  });
  it("éxito: content en Markdown con la URL de cada item", () => {
    const l = leerSobre(jsonOk);
    expect(l.ok).toBe(true);
    expect(l.items).toHaveLength(2);
    expect(l.content).toContain("[Título](https://example.com/)");
    expect(l.content).toContain("Autor: Alguien");
    expect(l.error).toBeUndefined();
  });
  it("cada error.code de la v1.6 sale tal cual", () => {
    for (const code of ["NEED_SETUP", "NEED_LOGIN", "UPSTREAM_BROKEN", "TIMEOUT", "RATE_LIMITED", "PLATFORM_BLOCKED", "BUSY", "NOT_FOUND", "BAD_INPUT"]) {
      const l = leerSobre(JSON.stringify({ ok: false, error: { code, hint: "pista" } }));
      expect(l.ok).toBe(false);
      expect(l.error?.code).toBe(code);
      expect(l.error?.hint).toBe("pista");
    }
  });
  it("salida rota, vacía o sin código: UPSTREAM_BROKEN, sin lanzar", () => {
    expect(leerSobre("").error?.code).toBe("UPSTREAM_BROKEN");
    expect(leerSobre("no-es-json").ok).toBe(false);
    expect(leerSobre("no-es-json").error?.code).toBe("UPSTREAM_BROKEN");
    expect(leerSobre("[1,2]").error?.code).toBe("UPSTREAM_BROKEN");
    expect(leerSobre("{}").ok).toBe(true);
  });
});
