/**
 * Pruebas de `agent-reach-comandos.ts` (puro): mapa de ids, R1, SSRF,
 * guion en argumentos y parseo de la salida JSON de la v1.6.
 */
import { describe, it, expect } from "vitest";
import {
  CAPACIDADES,
  resolverCapacidad,
  validarEntrada,
  leerSobre,
  tipoDeCapacidad,
  SIN_LOGIN,
} from "@/lib/integrations/agent-reach-comandos";

describe("mapa de ids → argv de la v1.6", () => {
  it("web-search y search construyen la búsqueda con --limit", () => {
    expect(CAPACIDADES["web-search"]("crianza libre", 3)).toEqual(["web", "search", "crianza libre", "--limit", "3"]);
    expect(CAPACIDADES.search("crianza libre", 7)).toEqual(["web", "search", "crianza libre", "--limit", "7"]);
  });

  it("read-web, rss y el viejo web leen la url", () => {
    const esperado = ["read", "https://ejemplo.org/guia"];
    for (const id of ["read-web", "rss", "web"]) expect(CAPACIDADES[id]("https://ejemplo.org/guia", 5)).toEqual(esperado);
  });

  it("youtube transcribe por subtítulo", () => {
    const url = "https://www.youtube.com/watch?v=abc";
    expect(CAPACIDADES["youtube-transcript"](url, 5)).toEqual(["youtube", "subtitle", url]);
    expect(CAPACIDADES.youtube(url, 5)).toEqual(["youtube", "subtitle", url]);
  });

  it("github lee el repo y bilibili busca", () => {
    expect(CAPACIDADES["github-read"]("Panniantong/Agent-Reach", 5)).toEqual(["github", "read", "Panniantong/Agent-Reach"]);
    expect(CAPACIDADES.github("Panniantong/Agent-Reach", 5)).toEqual(["github", "read", "Panniantong/Agent-Reach"]);
    expect(CAPACIDADES.bilibili("hu Tao", 5)).toEqual(["bilibili", "search", "hu Tao"]);
  });

  it("health pide la versión", () => {
    expect(CAPACIDADES.health("", 5)).toEqual(["version"]);
    expect(tipoDeCapacidad("health")).toBe("ninguno");
  });
});

describe("bloqueo de canales con sesión (R1)", () => {
  it("reddit, twitter y reddit-search se rechazan sin la bandera", () => {
    for (const id of ["reddit", "twitter", "reddit-search"]) {
      expect(SIN_LOGIN[id]).toBe(true);
      expect(resolverCapacidad(id, "ping")).toEqual({ accion: "rechazar", tipo: expect.any(String), motivo: "NEED_LOGIN_BLOQUEADO" });
    }
  });

  it("ids desconocidos se rechazan", () => {
    expect(resolverCapacidad("tienda", "x").accion).toBe("rechazar");
  });
});

describe("validarEntrada · SSRF y guion", () => {
  const url = (u: string) => validarEntrada("url", u);

  it("acepta https públicas", () => {
    expect(url("https://ejemplo.org/guia")).toEqual({ ok: true });
    expect(validarEntrada("q", "crianza libre")).toEqual({ ok: true });
  });

  it("rechaza host local, IP privada y metadatos de nube", () => {
    for (const mala of [
      "http://localhost/api", "http://localhost.ejemplo.org/", "http://127.0.0.1:4321/",
      "http://10.0.0.2/", "http://192.168.1.4/", "http://172.16.5.9/", "http://172.31.255.1/",
      "http://169.254.169.254/latest/meta-data/", "http://metadata.google.internal/",
      "http://[::1]:9002/", "http://0.0.0.0/", "ftp://ejemplo.org/fichero",
    ]) {
      expect(url(mala).ok).toBe(false);
    }
  });

  it("rechaza q de más de 300 y argumentos que empiezan por guion", () => {
    expect(validarEntrada("q", "a".repeat(301)).ok).toBe(false);
    expect(validarEntrada("q", "a".repeat(300)).ok).toBe(true);
    for (const arg of ["--version", "-", "--limit", "9"]) {
      expect(validarEntrada("q", arg).ok).toBe(false);
    }
    expect(url("--version").ok).toBe(false);
  });
});

describe("leerSobre · parseo del JSON de la v1.6", () => {
  const salida = JSON.stringify({
    ok: true,
    items: [{ title: "Guía", url: "https://ejemplo.org", author: "Ana", published_at: "2026-10-23", text: "Cuerpo" }],
    meta: { capability: "web" },
  });

  it("éxito: ok, contenido Markdown con url e items limpios", () => {
    const sobre = leerSobre(salida);
    expect(sobre.ok).toBe(true);
    expect(sobre.error).toEqual([]);
    expect(sobre.items).toHaveLength(1);
    expect(sobre.content).toContain("https://ejemplo.org");
    expect(sobre.content).toContain("## Guía");
    expect(sobre.content).toContain("Autor: Ana");
    expect(sobre.content).toContain("Cuerpo");
  });

  it("cada error.code de la v1.6 se conserva", () => {
    for (const code of ["NEED_SETUP", "NEED_LOGIN", "UPSTREAM_BROKEN", "TIMEOUT", "RATE_LIMITED", "PLATFORM_BLOCKED", "BUSY", "NOT_FOUND", "BAD_INPUT"]) {
      expect(leerSobre(JSON.stringify({ ok: false, error: { code, hint: "?" } })).error).toEqual([code]);
    }
  });

  it("JSON roto o vacío no lanza y avisa", () => {
    expect(leerSobre("seg fault").error).toEqual(["UNKNOWN"]);
    expect(leerSobre("").error).toEqual(["UNKNOWN"]);
  });
});
