import { describe, it, expect } from "vitest";
import { CAPACIDADES, HINT_INSTALACION, leerSobre, resolverComando, validarEntrada } from "../agent-reach-comandos";
import { INTEGRATIONS } from "../registry";
import { getIntegration as getIntegracionCatalogo } from "@/ai/astraura/integration-catalog";

const argv = (cap: string, cuerpo: Record<string, unknown>, login = false) => {
  const r = resolverComando(cap, cuerpo, { login });
  if (!r.ok) throw new Error(`${cap}: ${r.motivo} · ${r.error}`);
  return r.argv;
};

describe("Agent-Reach v1.6 · mapa de capacidades (INV1025A)", () => {
  it("los ids del cliente y los viejos dan la misma orden de la v1.6", () => {
    expect(argv("web-search", { q: "starseed", limit: 3 })).toEqual(["web", "search", "starseed", "--limit", "3"]);
    expect(argv("search", { query: "starseed" })).toEqual(["web", "search", "starseed", "--limit", "5"]);
    expect(argv("read-web", { url: "https://example.org/a" })).toEqual(["read", "https://example.org/a"]);
    expect(argv("rss", { feed: "https://example.org/feed.xml" })).toEqual(["read", "https://example.org/feed.xml"]);
    expect(argv("web", { url: "https://example.org" })).toEqual(["read", "https://example.org"]);
    expect(argv("youtube-transcript", { url: "https://youtu.be/x" })).toEqual(["youtube", "subtitle", "https://youtu.be/x"]);
    expect(argv("youtube", { url: "https://youtu.be/x" })).toEqual(["youtube", "subtitle", "https://youtu.be/x"]);
    expect(argv("github-read", { url: "https://github.com/a/b" })).toEqual(["github", "read", "https://github.com/a/b"]);
    expect(argv("github", { repo: "Panniantong/Agent-Reach" })).toEqual(["github", "read", "Panniantong/Agent-Reach"]);
    expect(argv("bilibili", { q: "音乐" })).toEqual(["bilibili", "search", "音乐"]);
    expect(argv("health", {})).toEqual(["version"]);
  });

  it("el límite se acota entre 1 y 20", () => {
    expect(argv("web-search", { q: "x", limit: 999 })).toContain("20");
    expect(argv("web-search", { q: "x", limit: -4 })).toContain("1");
  });

  it("una capacidad desconocida (o heredada de Object) no pasa", () => {
    for (const c of ["shell", "__proto__", "constructor", "toString"]) {
      const r = resolverComando(c, { q: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("DESCONOCIDA");
    }
  });

  it("los canales con sesión se rechazan salvo con login encendido (R1)", () => {
    for (const c of ["reddit", "reddit-search", "twitter"]) {
      expect(CAPACIDADES[c]?.conSesion).toBe(true);
      const r = resolverComando(c, { url: "https://www.reddit.com/r/x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("NEED_LOGIN_BLOQUEADO");
    }
    expect(argv("reddit", { url: "https://www.reddit.com/r/x" }, true)).toEqual(["read", "https://www.reddit.com/r/x"]);
  });
});

describe("validarEntrada · SSRF y argumentos", () => {
  const bloqueadas = [
    "http://localhost:9002/api/mando/estado", "http://127.0.0.1/", "http://2130706433/", "http://10.0.0.5/",
    "http://172.20.1.1/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[fd00::1]/",
    "http://0.0.0.0/", "http://router.local/", "http://100.64.0.1/", "file:///etc/passwd", "ftp://example.org/",
    "https://usuario:clave@example.org/",
  ];
  it.each(bloqueadas)("rechaza %s", (u) => {
    expect(validarEntrada("url", u)).not.toBeNull();
    expect(resolverComando("read-web", { url: u }).ok).toBe(false);
  });

  it("acepta URLs públicas", () => {
    expect(validarEntrada("url", "https://example.org/a?b=1")).toBeNull();
    expect(validarEntrada("url", "http://172.32.0.1/")).toBeNull();
  });

  it("ningún argumento empieza por guion", () => {
    expect(validarEntrada("q", "--help")).not.toBeNull();
    expect(validarEntrada("ref", "-x/y")).not.toBeNull();
    const r = resolverComando("web-search", { q: "-rf" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("BAD_INPUT");
  });

  it("q hasta 300 caracteres, sin controles y sin vacío", () => {
    expect(validarEntrada("q", "a".repeat(300))).toBeNull();
    expect(validarEntrada("q", "a".repeat(301))).not.toBeNull();
    expect(validarEntrada("q", "hola\nmundo")).not.toBeNull();
    expect(resolverComando("web-search", {}).ok).toBe(false);
    expect(validarEntrada("ref", "dueño mal/repo")).not.toBeNull();
  });
});

describe("leerSobre · JSON de la v1.6", () => {
  it("convierte los items en Markdown con su fuente", () => {
    const s = leerSobre(JSON.stringify({ ok: true, items: [
      { title: "Uno", url: "https://a.org", author: "Ana", published_at: "2026-10-23", text: "Hola" },
      { title: "", url: "https://b.org", text: "Adiós" },
    ], meta: {} }));
    expect(s.ok).toBe(true);
    expect(s.items).toHaveLength(2);
    expect(s.items[0].author).toBe("Ana");
    expect(s.content).toContain("### Uno\n\nHola\n\nFuente: https://a.org");
    expect(s.content).toContain("### https://b.org");
    expect(s.error).toBeUndefined();
  });

  it("tolera ruido antes del JSON y nunca lanza con basura", () => {
    expect(leerSobre('aviso\n{"ok":true,"items":[]}').ok).toBe(true);
    for (const basura of ["", "no json", "[]", "null", "{roto", "42"]) {
      const s = leerSobre(basura);
      expect(s.ok).toBe(false);
      expect(s.error?.code).toBe("BAD_OUTPUT");
    }
  });

  const codigos = ["NEED_SETUP", "NEED_LOGIN", "UPSTREAM_BROKEN", "TIMEOUT", "RATE_LIMITED", "PLATFORM_BLOCKED", "BUSY", "NOT_FOUND", "BAD_INPUT"];
  it.each(codigos)("lee el error %s con su pista", (code) => {
    const conHint = leerSobre(JSON.stringify({ ok: false, items: [], error: { code, hint: "pista del origen" } }));
    expect(conHint).toMatchObject({ ok: false, error: { code, hint: "pista del origen" } });
    const sinHint = leerSobre(JSON.stringify({ ok: false, error: { code } }));
    expect(sinHint.error?.code).toBe(code);
    expect(sinHint.error?.hint.length).toBeGreaterThan(10);
  });

  it("la pista de instalación avisa de PyPI y da la orden de uv", () => {
    expect(HINT_INSTALACION).toContain("uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip");
    expect(HINT_INSTALACION).toContain("PyPI");
  });
});

describe("catálogo y registro · Agent-Reach dice la verdad (INV1025B)", () => {
  it("ningún texto manda a pip ni a npx; la instalación es la de uv", () => {
    const registro = INTEGRATIONS.find((i) => i.id === "agent-reach");
    const catalogo = getIntegracionCatalogo("agent-reach");
    expect(registro).toBeDefined();
    expect(catalogo).not.toBeNull();
    const texto = JSON.stringify({ registro, catalogo });
    expect(texto).not.toContain("pip install agent-reach");
    expect(texto).not.toContain("npx agent-reach");
    expect(texto).toContain("uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip");
  });
});
