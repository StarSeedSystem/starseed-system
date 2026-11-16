/**
 * IMA5 (TRA1116-IDIOMAS) · Pruebas de `src/lib/idiomas/paquete/formato.ts`
 */

import { describe, it, expect } from "vitest";
import { construirPaquete, canonico, hashDe, nombreDeArchivo, PaqueteIdioma, Revisado } from "../formato";

/** SHA-256 determinista sobre un JSON canónico (claves ordenadas). */
describe("hashDe", () => {
  it("devuelve el mismo hash cuando el JSON reordena sus claves", async () => {
    const a = { z: 1, a: 2 };
    const b = { a: 2, z: 1 };
    const hashA = await hashDe(a);
    const hashB = await hashDe(b);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambia cuando una entrada se modifica", async () => {
    const entrada = {
      codigo: "fr",
      nombre: "Francés",
      entradas: {
        "hola": "bonjour",
        "gracias": "merci",
      },
    };
    const hash1 = await hashDe(entrada);
    const entradaMod = { ...entrada, entradas: { ...entrada.entradas, gracias: "thanks" } };
    const hash2 = await hashDe(entradaMod);
    expect(hash1).not.toBe(hash2);
  });
});

describe("canonico", () => {
  it("ordena las claves al stringify", () => {
    const a = { z: 1, a: 2, b: { y: 3, x: 4 } };
    const b = { a: 2, b: { x: 4, y: 3 }, z: 1 };
    expect(canonico(a)).toBe(canonico(b));
    expect(canonico(a)).toBe('{"a":2,"b":{"x":4,"y":3},"z":1}')
  });
});

describe("construirPaquete", () => {
  const datosBase = {
    codigo: "fr",
    nombre: "Francés",
    dir: "ltr" as const,
    autor: { nombre: "Autor Prueba" },
    revisado: { estado: "automatico" } as Revisado,
    licencia: "MIT",
    entradas: { "hola": "bonjour" },
  };

  it("setea `base: 'es'` y `version: 1` y `hash: ''` provisional", () => {
    const p = construirPaquete(datosBase);
    expect(p.base).toBe("es");
    expect(p.version).toBe(1);
    expect(p.hash).toBe("");
    expect(p.formato).toBe("starseed-idioma");
    expect(p.creado).toMatch(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\..{3}Z$/);
  });

  it("respeta el `revisado` si viene del OS (no lo sobreescribe)", () => {
    const p = construirPaquete({ ...datosBase, revisado: { estado: "revisado", por: "Alex", fecha: "2025-01-01T00:00:00.000Z" } });
    expect(p.revisado.estado).toBe("revisado");
    expect(p.revisado.por).toBe("Alex");
  });

  it("fuerza `revisado.estado = \"automatico\"` por defecto", () => {
    const p = construirPaquete(datosBase);
    expect(p.revisado.estado).toBe("automatico");
    expect(p.revisado.fecha).toBeUndefined();
  });
});

describe("nombreDeArchivo", () => {
  const paquete: PaqueteIdioma = {
    formato: "starseed-idioma",
    version: 1,
    codigo: "es",
    nombre: "Español",
    dir: "ltr",
    autor: { nombre: "Autor" },
    creado: "2025-01-01T00:00:00.000Z",
    revisado: { estado: "automatico" },
    licencia: "MIT",
    base: "es",
    entradas: { "hola": "hola" },
    hash: "abc123",
  };

  it("produce solo a-z0-9- sin puntos ni tildes, convierte espacios a -", () => {
    expect(nombreDeArchivo(paquete)).toBe("es.starseed-lang.json");
  });

  it("usa `nombreIngles` si existe, ignora `codigo`", () => {
    const pIngles = { ...paquete, nombreIngles: "English Name" };
    expect(nombreDeArchivo(pIngles)).toBe("english-name.starseed-lang.json");
  });
});