import { describe, it, expect } from "vitest";
import {
  CAPACIDADES,
  Q_MAXIMO,
  leerSobre,
  limitSano,
  loginPermitido,
  resolverCapacidad,
} from "../agent-reach-comandos";

const SIN_LOGIN = false;
const CON_LOGIN = true;

describe("mapa de capacidades: id (cliente o v1.5) → argv de la v1.6", () => {
  it("los ids del cliente caen en la orden de la v1.6", () => {
    expect(resolverCapacidad("web-search", { q: "astronautics" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["web", "search", "astronautics", "--limit", "5"],
    });
    expect(resolverCapacidad("read-web", { url: "https://ejemplo.org" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["read", "https://ejemplo.org"],
    });
    expect(resolverCapacidad("youtube-transcript", { url: "https://youtu.be/x" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["youtube", "subtitle", "https://youtu.be/x"],
    });
    expect(resolverCapacidad("github-read", { url: "https://github.com/Panniantong/Agent-Reach" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["github", "read", "https://github.com/Panniantong/Agent-Reach"],
    });
  });

  it("los ids de la ruta vieja v1.5 siguen resolviendo igual", () => {
    expect(resolverCapacidad("search", { q: "olas enjambre", limit: 2 }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["web", "search", "olas enjambre", "--limit", "2"],
    });
    expect(resolverCapacidad("web", { url: "https://ejemplo.org" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["read", "https://ejemplo.org"],
    });
    expect(resolverCapacidad("rss", { url: "https://blog.ejemplo.org/feed" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["read", "https://blog.ejemplo.org/feed"],
    });
    expect(resolverCapacidad("youtube", { url: "https://www.youtube.com/watch?v=x" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["youtube", "subtitle", "https://www.youtube.com/watch?v=x"],
    });
    expect(resolverCapacidad("github", { url: "https://github.com/x/y" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["github", "read", "https://github.com/x/y"],
    });
  });

  it("bilibili busca con --limit y health pide `version`", () => {
    expect(resolverCapacidad("bilibili", { q: "starseed" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["bilibili", "search", "starseed", "--limit", "5"],
    });
    expect(resolverCapacidad("health", {}, SIN_LOGIN)).toEqual({ ok: true, argv: ["version"] });
    expect(Object.keys(CAPACIDADES)).toContain("reddit");
    expect(limitSano(99)).toBe(20);
  });
});

describe("canales con sesión bloqueados de fábrica (regla R1)", () => {
  it("reddit, reddit-search y twitter dan NEED_LOGIN_BLOQUEADO sin la variable", () => {
    for (const id of ["reddit", "reddit-search", "twitter"]) {
      const r = resolverCapacidad(id, { q: "q", url: "https://reddit.com/r/x" }, SIN_LOGIN);
      expect(r).toMatchObject({ ok: false, code: "NEED_LOGIN_BLOQUEADO" });
    }
    for (const id of ["linkedin", "facebook", "instagram", "xiaohongshu"]) {
      expect(resolverCapacidad(id, { q: "x" }, SIN_LOGIN)).toMatchObject({ ok: false, code: "NEED_LOGIN_BLOQUEADO" });
    }
  });

  it("con STARSEED_AGENT_REACH_LOGIN=1 (mayLogin) se habilitan y siguen validando", () => {
    expect(resolverCapacidad("reddit", { q: "consulta" }, CON_LOGIN)).toEqual({
      ok: true,
      argv: ["reddit", "search", "consulta"],
    });
    expect(resolverCapacidad("twitter", { url: "https://x.com/alguien" }, CON_LOGIN)).toEqual({
      ok: true,
      argv: ["twitter", "https://x.com/alguien"],
    });
    expect(resolverCapacidad("reddit-search", { url: "https://reddit.com/r/x" }, CON_LOGIN)).toEqual({
      ok: true,
      argv: ["reddit", "search", "https://reddit.com/r/x"],
    });
  });

  it("la variable solo activa con el valor exacto 1", () => {
    expect(loginPermitido({ STARSEED_AGENT_REACH_LOGIN: "1" })).toBe(true);
    expect(loginPermitido({ STARSEED_AGENT_REACH_LOGIN: "0" })).toBe(false);
    expect(loginPermitido(undefined)).toBe(false);
  });
});

describe("SSRF: la lectura solo llega a hosts públicos http/https", () => {
  const rechazosSSRF = (url: string) =>
    expect(resolverCapacidad("read-web", { url }, SIN_LOGIN)).toMatchObject({ ok: false, code: "BAD_INPUT" });

  it("rechaza localhost, IPs de loopback y privadas", () => {
    rechazosSSRF("http://localhost:3000/api");
    rechazosSSRF("http://127.0.0.1:9002");
    rechazosSSRF("https://10.1.2.3/x");
    rechazosSSRF("https://192.168.0.12/x");
    rechazosSSRF("https://172.16.5.4/x");
    rechazosSSRF("https://169.254.169.254/latest/meta-data/");
    rechazosSSRF("http://[::1]:3000/");
  });

  it("rechaza metadatos de nube, hosts internos y esquemas no web", () => {
    rechazosSSRF("http://metadata.google.internal/computeMetadata/v1/");
    rechazosSSRF("https://algo.internal/secreto");
    rechazosSSRF("file:///etc/passwd");
    rechazosSSRF("ftp://ejemplo.org/archivo");
    rechazosSSRF("no es una url");
  });

  it("0.0.0.0 se rechaza y el host público de verdad pasa", () => {
    rechazosSSRF("http://0.0.0.0/");
    expect(resolverCapacidad("read-web", { url: "https://starseed-os.vercel.app" }, SIN_LOGIN)).toEqual({
      ok: true,
      argv: ["read", "https://starseed-os.vercel.app"],
    });
  });
});

describe("argumentos controlados: guiones y tamaño", () => {
  it("ningún argumento del usuario puede empezar por '-'", () => {
    expect(resolverCapacidad("web-search", { q: "-hola" }, SIN_LOGIN)).toMatchObject({ ok: false, code: "BAD_INPUT" });
    expect(resolverCapacidad("github", { url: "--version" }, SIN_LOGIN)).toMatchObject({ ok: false, code: "BAD_INPUT" });
    expect(resolverCapacidad("reddit", { q: "--help" }, CON_LOGIN)).toMatchObject({ ok: false, code: "BAD_INPUT" });
  });

  it("la consulta no puede pasar del tope", () => {
    expect(resolverCapacidad("web-search", { q: "a".repeat(Q_MAXIMO) }, SIN_LOGIN)).toMatchObject({ ok: true });
    expect(resolverCapacidad("web-search", { q: "a".repeat(Q_MAXIMO + 1) }, SIN_LOGIN)).toMatchObject({
      ok: false,
      code: "BAD_INPUT",
    });
  });

  it("sin argumento hay BAD_INPUT, y un id de verdad ajeno es NOT_FOUND", () => {
    expect(resolverCapacidad("web-search", {}, SIN_LOGIN)).toMatchObject({ ok: false, code: "BAD_INPUT" });
    expect(resolverCapacidad("read-web", {}, SIN_LOGIN)).toMatchObject({ ok: false, code: "BAD_INPUT" });
    expect(resolverCapacidad("telegram", { q: "x" }, SIN_LOGIN)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("leerSobre: parseo del JSON de la v1.6, sin lanzar nunca", () => {
  const JSON_EXITO = JSON.stringify({
    ok: true,
    items: [
      { title: "Agent Reach", url: "https://github.com/Panniantong/Agent-Reach", author: "Panniantong", published_at: "2026-10-23", text: "Un CLI de lectura." },
      { title: "Vale", url: "https://ejemplo.org/dos" },
    ],
    meta: {},
  });

  it("éxito: ok, items intactos y Markdown con el enlace de cada item", () => {
    const s = leerSobre(JSON_EXITO);
    expect(s.ok).toBe(true);
    expect(s.error).toBeNull();
    expect(s.items).toHaveLength(2);
    expect(s.items[0]?.url).toBe("https://github.com/Panniantong/Agent-Reach");
    expect(s.content).toContain("- [Agent Reach](https://github.com/Panniantong/Agent-Reach)");
    expect(s.content).toContain("Panniantong · 2026-10-23");
    expect(s.content).toContain("- [Vale](https://ejemplo.org/dos)");
    expect(s.content).toContain("Un CLI de lectura.");
  });

  it("los códigos de error de la v1.6 pasan tal cual", () => {
    for (const code of [
      "NEED_SETUP",
      "NEED_LOGIN",
      "UPSTREAM_BROKEN",
      "TIMEOUT",
      "RATE_LIMITED",
      "PLATFORM_BLOCKED",
      "BUSY",
      "NOT_FOUND",
      "BAD_INPUT",
    ]) {
      const s = leerSobre(JSON.stringify({ ok: false, error: { code, hint: `pista ${code}` } }));
      expect(s.ok).toBe(false);
      expect(s.error?.code).toBe(code);
      expect(s.error?.hint).toBe(`pista ${code}`);
      expect(s.content).toBe("");
    }
  });

  it("salida corrupta o rara → UPSTREAM_BROKEN, y nunca lanza", () => {
    expect(leerSobre("ni json").error?.code).toBe("UPSTREAM_BROKEN");
    expect(leerSobre("").error?.code).toBe("UPSTREAM_BROKEN");
    expect(leerSobre(null).ok).toBe(false);
    expect(leerSobre(undefined).ok).toBe(false);
    expect(leerSobre(42).ok).toBe(false);
    expect(leerSobre("[1,2,3]").error?.code).toBe("UPSTREAM_BROKEN");
    const sinErrorObjeto = JSON.stringify({ ok: false });
    expect(leerSobre(sinErrorObjeto).error?.code).toBe("UPSTREAM_BROKEN");
  });

  it("error sin objeto (string suelto) sigue devolviendo ok false con el texto", () => {
    const s = leerSobre(JSON.stringify({ ok: false, error: "falló el upstream" }));
    expect(s.ok).toBe(false);
    expect(s.error?.code).toBe("UPSTREAM_BROKEN");
    expect(s.error?.hint).toBe("falló el upstream");
  });
});
