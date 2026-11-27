import { describe, expect, it } from "vitest";
import { armarEspejo, CADA_MS_ESPEJO, elegirDirector, leerEspejo, MAX_BYTES_ESPEJO, sanearLinea, tocaEmitir } from "@/lib/malla/espejo-registro-malla";

const L1 = "2026-11-27T10:00:00.000Z web ble conectado";
const L2 = "2026-11-27T10:00:05.000Z web ble caída";
const dir = { syncDeviceId: "d1", nombre: "Mac", rol: "director" };

describe("espejo del registro por la malla", () => {
  it("sin director no envía", () => {
    expect(elegirDirector([{ syncDeviceId: "a", nombre: "Móvil", rol: "aparato-de-prueba" }, { syncDeviceId: "b", nombre: "TV" }])).toBeNull();
    expect(tocaEmitir({ activo: true, director: null, ahora: 1e6, ultimo: undefined })).toBe(false);
  });
  it("elige al par director", () => {
    expect(elegirDirector([{ nombre: "x" }, dir])).toEqual(dir);
  });
  it("interruptor apagado ⇒ no manda", () => {
    expect(tocaEmitir({ activo: false, director: dir, ahora: 1e6, ultimo: undefined })).toBe(false);
    expect(tocaEmitir({ activo: true, director: dir, ahora: 1e6, ultimo: undefined })).toBe(true);
  });
  it("respeta el suelo de 15 s por par", () => {
    expect(tocaEmitir({ activo: true, director: dir, ahora: 1e6 + CADA_MS_ESPEJO - 1, ultimo: 1e6 })).toBe(false);
    expect(tocaEmitir({ activo: true, director: dir, ahora: 1e6 + CADA_MS_ESPEJO, ultimo: 1e6 })).toBe(true);
  });
  it("no reenvía líneas con prefijo (sin bucles)", () => {
    const m = armarEspejo([`(Móvil) ${L1}`, L2], null);
    expect(m?.l).toEqual([L2]);
    expect(armarEspejo([`(Móvil) ${L1}`], null)).toBeNull();
  });
  it("solo manda las posteriores a la última enviada", () => {
    const m = armarEspejo([L1, L2], "2026-11-27T10:00:00.000Z", new Set([L1]));
    expect(m?.l).toEqual([L2]);
    expect(m?.desde).toBe("2026-11-27T10:00:05.000Z");
  });
  it("respeta 16 KB", () => {
    const muchas = Array.from({ length: 2000 }, (_, i) => `2026-11-27T10:00:00.${String(i).padStart(3, "0")}Z web ble linea-${i} ${"x".repeat(40)}`);
    const m = armarEspejo(muchas, null);
    expect(new TextEncoder().encode(JSON.stringify(m)).length).toBeLessThanOrEqual(MAX_BYTES_ESPEJO);
  });
  it("sanearLinea quita IP, correo, ruta de usuario y token", () => {
    const s = sanearLinea("a 192.168.1.20 b fe80::1a2b:3c4d c yo@correo.com d /Users/alex/Documents/x e C:\\Users\\Ana\\f g /home/pepe/h t eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc123");
    expect(s).not.toMatch(/192\.168|fe80|@correo|alex|Ana|pepe|eyJhbGci/);
  });
  it("tipo desconocido o receptor apagado se ignora", () => {
    const ok = { recibir: true, esMismaCuenta: true, nombre: "Móvil" };
    expect(leerEspejo({ t: "otra.cosa", l: [L1] }, ok)).toBeNull();
    expect(leerEspejo({ t: "registro.espejo", l: [L1] }, { ...ok, recibir: false })).toBeNull();
    expect(leerEspejo("texto", ok)).toBeNull();
  });
  it("mensaje de otra cuenta ignorado", () => {
    expect(leerEspejo({ t: "registro.espejo", l: [L1] }, { recibir: true, esMismaCuenta: false, nombre: "X" })).toBeNull();
  });
  it("recibe con el prefijo del par", () => {
    expect(leerEspejo({ t: "registro.espejo", l: [L1, `(otro) ${L2}`] }, { recibir: true, esMismaCuenta: true, nombre: "Móvil" })).toEqual([`(Móvil) ${L1}`]);
  });
});
