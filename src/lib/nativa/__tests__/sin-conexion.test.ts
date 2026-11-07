/*
 * «Sin conexión: trabajando en local» y el contrato de puertos del servidor local (APP1107A).
 * Los diez puertos viven en tres sitios (Rust, capabilities de Tauri y este módulo): si uno cambia
 * y los otros no, la web del servidor local se queda sin acceso a la app nativa. Esto lo pone rojo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUERTOS_SERVIDOR_LOCAL,
  TITULO_SIN_CONEXION,
  decidirAviso,
  esFalloDeRed,
  esServidorLocal,
  interpretarRed,
} from "../sin-conexion";

const NATIVA = join(process.cwd(), "native/src-tauri");

describe("servidor local · puertos", () => {
  it("son los mismos que en Rust", () => {
    const rust = readFileSync(join(NATIVA, "src/servidor_local_logica.rs"), "utf8");
    const m = rust.match(/pub const PUERTOS: \[u16; \d+\] = \[([^\]]+)\]/);
    expect(m).not.toBeNull();
    const enRust = m![1].split(",").map((s) => Number(s.trim()));
    expect(enRust).toEqual([...PUERTOS_SERVIDOR_LOCAL]);
  });

  it.each(["capabilities/default.json", "capabilities/desktop.json"])("%s los declara como remote.urls (y solo esos de loopback)", (f) => {
    const cap = JSON.parse(readFileSync(join(NATIVA, f), "utf8")) as { remote: { urls: string[] } };
    const loopback = cap.remote.urls.filter((u) => /127\.0\.0\.1|localhost/.test(u));
    expect(loopback).toEqual(PUERTOS_SERVIDOR_LOCAL.map((p) => `http://127.0.0.1:${p}`));
  });

  it("reconoce la página servida por la app y nada más", () => {
    expect(esServidorLocal({ protocol: "http:", hostname: "127.0.0.1", port: "47610" })).toBe(true);
    expect(esServidorLocal({ protocol: "http:", hostname: "127.0.0.1", port: "47619" })).toBe(true);
    expect(esServidorLocal({ protocol: "http:", hostname: "127.0.0.1", port: "9002" })).toBe(false);
    expect(esServidorLocal({ protocol: "http:", hostname: "localhost", port: "47610" })).toBe(false);
    expect(esServidorLocal({ protocol: "https:", hostname: "starseed-os.vercel.app", port: "" })).toBe(false);
  });
});

describe("aviso sin conexión", () => {
  it("lee la respuesta del servidor local", () => {
    expect(interpretarRed({ red: "sin-conexion" })).toBe("sin-conexion");
    expect(interpretarRed({ red: "en-linea", web: "x" })).toBe("en-linea");
    expect(interpretarRed({ red: "rara" })).toBeNull();
    expect(interpretarRed(null)).toBeNull();
    expect(interpretarRed("sin-conexion")).toBeNull();
  });

  it("sale sin red (navegador o servidor local) y se puede cerrar", () => {
    const base = { navegadorEnLinea: true, enServidorLocal: true, redServidor: "en-linea" as const, descartado: false };
    expect(decidirAviso(base).mostrar).toBe(false);
    expect(decidirAviso({ ...base, navegadorEnLinea: false }).mostrar).toBe(true);
    // Wi-Fi sin salida: el navegador dice «en línea», el servidor local sabe que no.
    const sinSalida = decidirAviso({ ...base, redServidor: "sin-conexion" });
    expect(sinSalida.mostrar).toBe(true);
    expect(sinSalida.titulo).toBe(TITULO_SIN_CONEXION);
    expect(sinSalida.titulo).toBe("Sin conexión: trabajando en local");
    expect(sinSalida.detalle).toMatch(/propio servidor/);
    expect(decidirAviso({ ...base, redServidor: "sin-conexion", descartado: true }).mostrar).toBe(false);
    expect(decidirAviso({ ...base, redServidor: "desconocida" }).mostrar).toBe(false);
    expect(decidirAviso({ ...base, enServidorLocal: false, redServidor: null, navegadorEnLinea: false }).detalle).not.toMatch(/propio servidor/);
  });

  it("un fallo de red no es «sin sesión»", () => {
    expect(esFalloDeRed({ name: "AuthRetryableFetchError", status: 0 })).toBe(true);
    expect(esFalloDeRed({ name: "AuthApiError", status: 0 })).toBe(true);
    expect(esFalloDeRed({ name: "AuthSessionMissingError", status: 400 })).toBe(false);
    expect(esFalloDeRed(null)).toBe(false);
  });
});
