import { describe, it, expect } from "vitest";
import {
  CABECERAS_TRACECAT, describirEnvio, firmarCuerpo, prepararEnvio, validarDestino,
} from "@/lib/security/tracecat-conector";
import { construirEventoSeguridad, type EventoSeguridad } from "@/lib/security/eventos-seguridad";

const AHORA = 1_760_000_000_123;
// El secreto y las cadenas con forma de clave se construyen en tiempo de ejecución.
const SECRETO = ["prueba", "de", "firma", "tracecat", "1025r"].join("-");
const EVENTO = construirEventoSeguridad(
  {
    tipo: "secreto-detectado", severidad: "critica", elemento: "api",
    detalle: { familia: "detector-claves", campo: "cuerpo" },
  },
  AHORA,
) as EventoSeguridad;
const DESTINO = "https://tracecat.example.org/webhooks/seguridad";

async function firmaDePrueba(cuerpo: string, secreto: string, marca: string): Promise<string> {
  const codificador = new TextEncoder();
  const clave = await globalThis.crypto.subtle.importKey(
    "raw", codificador.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await globalThis.crypto.subtle.sign("HMAC", clave, codificador.encode(`${marca}.${cuerpo}`));
  return Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("validarDestino", () => {
  it("acepta https y rechaza http salvo red local explícita", () => {
    expect(validarDestino(DESTINO).ok).toBe(true);
    expect(validarDestino("http://localhost:8080/hook").ok).toBe(false);
    for (const local of ["http://localhost:8080/hook", "http://127.0.0.1/hook", "http://tracecat.local/hook"]) {
      expect(validarDestino(local, { permitirRedLocal: true }).ok).toBe(true);
    }
    expect(validarDestino("http://example.org/hook", { permitirRedLocal: true }).ok).toBe(false);
  });

  it("rechaza credenciales, fragmento, esquema raro y URL enorme", () => {
    expect(validarDestino("https://usuario:clave@tracecat.example.org/hook").ok).toBe(false);
    expect(validarDestino("https://tracecat.example.org/hook#seccion").ok).toBe(false);
    expect(validarDestino("ftp://tracecat.example.org/hook").ok).toBe(false);
    expect(validarDestino("no es una url").ok).toBe(false);
    expect(validarDestino("https://tracecat.example.org/" + "a".repeat(2048)).ok).toBe(false);
  });
});

describe("firmarCuerpo", () => {
  it("firma reproducible con HMAC-SHA-256 sobre marca.cuerpo", async () => {
    const cuerpo = JSON.stringify(EVENTO);
    const { marca, firma } = await firmarCuerpo(cuerpo, SECRETO, AHORA);
    expect(marca).toBe(String(Math.floor(AHORA / 1000)));
    expect(firma).toBe(await firmaDePrueba(cuerpo, SECRETO, marca));
    expect(firma).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambia al cambiar un byte del cuerpo o la marca", async () => {
    const base = await firmarCuerpo("cuerpo-a", SECRETO, AHORA);
    const otroCuerpo = await firmarCuerpo("cuerpo-b", SECRETO, AHORA);
    const otraMarca = await firmarCuerpo("cuerpo-a", SECRETO, AHORA + 1000);
    expect(otroCuerpo.firma).not.toBe(base.firma);
    expect(otraMarca.firma).not.toBe(base.firma);
    expect(otraMarca.marca).not.toBe(base.marca);
  });

  it("rechaza secretos vacíos o cortos con mensaje en español", async () => {
    await expect(firmarCuerpo("x", "", AHORA)).rejects.toThrow(/secreto/i);
    await expect(firmarCuerpo("x", "corto", AHORA)).rejects.toThrow(/16/);
  });
});

describe("prepararEnvio", () => {
  it("prepara un POST firmado sin enviarlo", async () => {
    const resultado = await prepararEnvio(EVENTO, DESTINO, SECRETO, AHORA);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.init.method).toBe("POST");
    expect(resultado.init.body).toBe(JSON.stringify(EVENTO));
    expect(resultado.url.host).toBe("tracecat.example.org");
    expect(resultado.init.headers[CABECERAS_TRACECAT.contenido]).toBe("application/json");
    expect(resultado.init.headers[CABECERAS_TRACECAT.idempotencia]).toBe(EVENTO.id);
    const { marca, firma } = await firmarCuerpo(resultado.init.body, SECRETO, AHORA);
    expect(resultado.init.headers[CABECERAS_TRACECAT.marca]).toBe(marca);
    expect(resultado.init.headers[CABECERAS_TRACECAT.firma]).toBe(firma);
  });

  it("rechaza un destino inválido y un cuerpo de más de 16 KB", async () => {
    expect((await prepararEnvio(EVENTO, "http://example.org/hook", SECRETO, AHORA)).ok).toBe(false);
    const grande = { ...EVENTO, resumen: "x".repeat(17_000) };
    const resultado = await prepararEnvio(grande, DESTINO, SECRETO, AHORA);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toMatch(/16/);
  });
});

describe("describirEnvio", () => {
  it("cuenta lo que saldría sin el secreto y con la firma recortada", async () => {
    const resultado = await prepararEnvio(EVENTO, DESTINO, SECRETO, AHORA);
    if (!resultado.ok) throw new Error("el envío de prueba debía prepararse");
    const firma = resultado.init.headers[CABECERAS_TRACECAT.firma];
    const texto = await describirEnvio(EVENTO, DESTINO, SECRETO, AHORA);
    expect(texto).toContain(firma.slice(0, 6) + "…");
    expect(texto).not.toContain(SECRETO);
    expect(texto.toLowerCase()).toContain("tracecat");
  });
});
