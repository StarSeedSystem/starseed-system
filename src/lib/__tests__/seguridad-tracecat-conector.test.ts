// Prueba de src/lib/security/tracecat-conector.ts · INF1025B · Ola 1025R.
// El secreto de la prueba se construye en TIEMPO DE EJECUCIÓN (no es una clave
// de verdad) y jamás debe aparecer en las salidas de texto.
import { describe, expect, it } from "vitest";
import {
  CABECERAS_TRACECAT,
  describirEnvio,
  firmarCuerpo,
  prepararEnvio,
  validarDestino,
} from "@/lib/security/tracecat-conector";
import { construirEventoSeguridad, type EventoSeguridad } from "@/lib/security/eventos-seguridad";

const AHORA = 1770000000000;
const SECRETO = "secreto-" + "de-prueba".repeat(3);
const DESTINO = "https://webhooks.tracecat.midominio.org/c";
const ENTRADA = {
  tipo: "limite-peticiones",
  severidad: "media",
  elemento: "api",
  detalle: { ruta: "/api/feed", limite: 120, ventanaMs: 60000 },
} as const;
const eventoDe = construirEventoSeguridad(ENTRADA, AHORA) as EventoSeguridad;

/** Referencia de la firma, calculada aquí con la misma receta del módulo. */
async function hmacReferencia(marca: string, cuerpo: string, secreto: string): Promise<string> {
  const clave = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await globalThis.crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(`${marca}.${cuerpo}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("validarDestino", () => {
  it("acepta un https sencillo", () => {
    expect(validarDestino(DESTINO).ok).toBe(true);
  });

  it("rechaza http fuera de la red local; en localhost, 127.0.0.1 o *.local solo si se autoriza", () => {
    expect(validarDestino("http://tracecat.midominio.org/c").ok).toBe(false);
    expect(validarDestino("http://localhost:8080/webhook").ok).toBe(false);
    expect(validarDestino("http://localhost:8080/webhook", { permitirRedLocal: true }).ok).toBe(true);
    expect(validarDestino("http://127.0.0.1/webhook", { permitirRedLocal: true }).ok).toBe(true);
    expect(validarDestino("http://tracecat.casa.local/c", { permitirRedLocal: true }).ok).toBe(true);
    expect(validarDestino("http://127.0.0.1.evil.com/webhook", { permitirRedLocal: true }).ok).toBe(false);
  });

  it("rechaza credenciales insertadas en la URL y fragmentos", () => {
    expect(validarDestino("https://user:clave@webhooks.tracecat.midominio.org/c").ok).toBe(false);
    expect(validarDestino(`${DESTINO}#x`).ok).toBe(false);
  });

  it("rechaza una URL enorme", () => {
    expect(validarDestino(`https://t.mk/${"a".repeat(2100)}`).ok).toBe(false);
  });
});

describe("firmarCuerpo", () => {
  it("firma «marca.cuerpo» y coincide con la HMAC calculada en esta prueba", async () => {
    const cuerpo = JSON.stringify(eventoDe);
    const r = await firmarCuerpo(cuerpo, SECRETO, AHORA);
    expect(r.marca).toBe("1770000000");
    expect(/^[0-9a-f]{64}$/.test(r.firma)).toBe(true);
    expect(r.firma).toBe(await hmacReferencia(r.marca, cuerpo, SECRETO));
  });

  it("cambia al cambiar un byte del cuerpo o de la marca", async () => {
    const a = await firmarCuerpo("cuerpo-a", SECRETO, AHORA);
    const b = await firmarCuerpo("cuerpo-b", SECRETO, AHORA);
    const c = await firmarCuerpo("cuerpo-a", SECRETO, AHORA + 1000);
    expect(a.firma).not.toBe(b.firma);
    expect(a.firma).not.toBe(c.firma);
  });

  it("rechaza un secreto vacío o de menos de 16 caracteres, con mensaje en español", async () => {
    await expect(firmarCuerpo("cuerpo", "s" + "c".repeat(14), AHORA)).rejects.toThrow(/secreto/i);
    await expect(firmarCuerpo("cuerpo", "", AHORA)).rejects.toThrow(/secreto/i);
  });
});

describe("prepararEnvio", () => {
  it("prepara un POST JSON firmado, con idempotency-key, y no envía nada", async () => {
    const r = await prepararEnvio(eventoDe, DESTINO, SECRETO, AHORA);
    if (!r.ok) throw new Error("debería preparar el envío");
    expect(r.init.method).toBe("POST");
    expect(r.init.headers[CABECERAS_TRACECAT.tipo]).toBe("application/json");
    expect(r.init.headers[CABECERAS_TRACECAT.idempotencia]).toBe(eventoDe.id);
    const marca = r.init.headers[CABECERAS_TRACECAT.marca] ?? "";
    expect(r.init.headers[CABECERAS_TRACECAT.firma]).toBe(await hmacReferencia(marca, r.init.body, SECRETO));
  });

  it("rechaza un destino inválido y un cuerpo de más de 16 KB", async () => {
    expect((await prepararEnvio(eventoDe, "http://tracecat.midominio.org/c", SECRETO, AHORA)).ok).toBe(false);
    const enorme: EventoSeguridad = { ...eventoDe, detalle: { ruta: "a".repeat(17000) } };
    expect((await prepararEnvio(enorme, DESTINO, SECRETO, AHORA)).ok).toBe(false);
  });

  it("rechaza un secreto muy corto con un motivo en claro", async () => {
    const r = await prepararEnvio(eventoDe, DESTINO, "s" + "c".repeat(14), AHORA);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("debería rechazar el secreto corto");
    expect(r.motivo).toMatch(/secreto/i);
  });
});

describe("describirEnvio", () => {
  it("describe lo que saldría sin revelar el secreto y con 6 letras de la firma", async () => {
    const preparado = await prepararEnvio(eventoDe, DESTINO, SECRETO, AHORA);
    if (!preparado.ok) throw new Error("debería preparar el envío");
    const texto = describirEnvio(preparado);
    expect(texto).not.toContain(SECRETO);
    const firma = preparado.init.headers[CABECERAS_TRACECAT.firma] ?? "";
    expect(texto).toContain(`${firma.slice(0, 6)}…`);
    expect(texto).toContain(eventoDe.id);
  });

  it("si la preparación falla, lo dice en claro", () => {
    expect(describirEnvio({ ok: false, motivo: "no hay destino" })).toContain("no hay destino");
  });
});
