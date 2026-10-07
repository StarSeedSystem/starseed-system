import { describe, it, expect } from "vitest";
import { ocultarSecretos, validarTarea, sanearEvento, sanearMensaje, validarLote, VERSION_PROTOCOLO } from "../protocolo";

// (2026-10-06) Las claves de ejemplo se montan en tiempo de ejecución: escritas enteras en el
// archivo, la protección de secretos de GitHub bloqueaba CUALQUIER empuje que llevara este
// commit (también las ramas de la nube). Ninguna es real.
const parte = (...trozos: string[]) => trozos.join("");

describe("ocultarSecretos", () => {
  it("oculta patrones de secreto", () => {
    const txt = "clave " + parte("sk-", "abc123def456ghi789jkl012mno345pqr");
    expect(ocultarSecretos(txt)).toContain("[clave oculta]");
  });
  it("oculta ghp_", () => {
    const txt = "token " + parte("gh", "p_abcdefghijklmnopqrstuvwxyz123456");
    expect(ocultarSecretos(txt)).toContain("[clave oculta]");
  });
  it("oculta github_pat_", () => {
    const txt = "pat " + parte("github", "_pat_abcdefghijklmnopqrstuvwxyz123456");
    expect(ocultarSecretos(txt)).toContain("[clave oculta]");
  });
  it("oculta AKIA", () => {
    const txt = "key " + parte("AKIA", "IOSFODNN7EXAMPLE");
    expect(ocultarSecretos(txt)).toContain("[clave oculta]");
  });
  it("oculta xoxb-", () => {
    const txt = "bot " + parte("xo", "xb-123456789012-abcdefghijklmnopqrstuv");
    expect(ocultarSecretos(txt)).toContain("[clave oculta]");
  });
  it("oculta JWT", () => {
    const txt = "jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(ocultarSecretos(txt)).toContain("[clave oculta]");
  });
  it("oculta PEM", () => {
    const txt = parte("-----BEGIN PRIV", "ATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw\n-----END PRIV", "ATE KEY-----");
    expect(ocultarSecretos(txt)).toContain("[clave oculta]");
  });
  it("oculta asignación KEY", () => {
    const txt = "API_KEY=supersecreto123";
    expect(ocultarSecretos(txt)).toContain("[clave oculta]");
  });
  it("no toca texto normal", () => {
    const txt = "hola mundo sin secretos";
    expect(ocultarSecretos(txt)).toBe(txt);
  });
});

describe("validarTarea", () => {
  it("acepta tarea válida", () => {
    const t = { id: "1", ola: "1007", depende: [], titulo: "t", archivos: [], prompt: "p" };
    expect(validarTarea(t).ok).toBe(true);
  });
  it("rechaza sin id", () => {
    const t = { ola: "1007", depende: [], titulo: "t", archivos: [], prompt: "p" };
    expect(validarTarea(t).ok).toBe(false);
  });
  it("rechaza depende no lista", () => {
    const t = { id: "1", ola: "1007", depende: "no", titulo: "t", archivos: [], prompt: "p" };
    expect(validarTarea(t).ok).toBe(false);
  });
});

describe("sanearEvento", () => {
  it("sanea y oculta secretos", () => {
    const e = { t: 1, tipo: "log", texto: "clave " + parte("sk-", "abcdefghijklmnopqrstuvwxy123456") };
    const r = sanearEvento(e);
    expect(r.ok).toBe(true);
    expect(r.valor?.texto).toContain("[clave oculta]");
  });
  it("rechaza texto largo", () => {
    const e = { t: 1, tipo: "log", texto: "a".repeat(4001) };
    expect(sanearEvento(e).ok).toBe(false);
  });
});

describe("sanearMensaje", () => {
  it("sanea y oculta", () => {
    const m = { canal: "c", autor: "a", rol: "user", texto: "token " + parte("gh", "p_abcdefghijklmnopqrstuvwxyz123456") };
    const r = sanearMensaje(m);
    expect(r.ok).toBe(true);
    expect(r.valor?.texto).toContain("[clave oculta]");
  });
  it("rechaza canal largo", () => {
    const m = { canal: "a".repeat(41), autor: "a", rol: "user", texto: "x" };
    expect(sanearMensaje(m).ok).toBe(false);
  });
});

describe("validarLote", () => {
  it("acepta lote válido", () => {
    const lote = {
      version: VERSION_PROTOCOLO,
      motor_id: "m1",
      ambito_id: "a1",
      eventos: [{ t: 1, tipo: "x", texto: "ok" }],
      progreso: {},
    };
    expect(validarLote(lote).ok).toBe(true);
  });
  it("rechaza versión", () => {
    const lote = {
      version: 2,
      motor_id: "m1",
      ambito_id: "a1",
      eventos: [],
      progreso: {},
    };
    expect(validarLote(lote).ok).toBe(false);
  });
  it("rechaza >64KB", () => {
    const lote: any = {
      version: VERSION_PROTOCOLO,
      motor_id: "m1",
      ambito_id: "a1",
      eventos: [],
      progreso: {},
      relleno: "a".repeat(70 * 1024),
    };
    expect(validarLote(lote).ok).toBe(false);
  });
  it("rechaza 201 eventos", () => {
    const lote = {
      version: VERSION_PROTOCOLO,
      motor_id: "m1",
      ambito_id: "a1",
      eventos: Array.from({ length: 201 }, (_, i) => ({ t: i, tipo: "x", texto: "ok" })),
      progreso: {},
    };
    expect(validarLote(lote).ok).toBe(false);
  });
  it("rechaza medidores con accountId anidado", () => {
    const lote = {
      version: VERSION_PROTOCOLO,
      motor_id: "m1",
      ambito_id: "a1",
      eventos: [],
      progreso: {},
      medidores: { datos: { accountId: "123" } },
    };
    expect(validarLote(lote).ok).toBe(false);
  });
  it("rechaza texto largo en medidores", () => {
    const lote = {
      version: VERSION_PROTOCOLO,
      motor_id: "m1",
      ambito_id: "a1",
      eventos: [],
      progreso: {},
      medidores: { nota: "a".repeat(201) },
    };
    expect(validarLote(lote).ok).toBe(false);
  });
});
