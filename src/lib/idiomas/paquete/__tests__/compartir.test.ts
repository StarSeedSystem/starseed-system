import { describe, it, expect } from "vitest";
import { aArchivo, aEnlace, desdeEnlace, trocear, reunir } from "../compartir";
import type { PaqueteIdioma } from "../validar";

function paqueteBase(): PaqueteIdioma {
  return {
    codigo: "fr-FR",
    dir: "ltr",
    version: "1.0",
    autor: { nombre: "Alex" },
    revisado: { estado: "manual" },
    hash: "abc123",
    entradas: { hola: "Bonjour", "adiós": "Au revoir", "mañana": "Demain" },
  };
}

const base = "https://starseed-os.vercel.app/library";

describe("compartir · archivo", () => {
  it("aArchivo entrega el JSON con el nombre del paquete", () => {
    const archivo = aArchivo(paqueteBase());
    expect(archivo.nombre).toBe("fr-fr.starseed-lang.json");
    expect(archivo.tipo).toBe("application/json");
    expect(JSON.parse(archivo.contenido).codigo).toBe("fr-FR");
  });
});

describe("compartir · enlace", () => {
  it("aEnlace apunta con ?idioma y no lleva el paquete dentro", () => {
    const enlace = aEnlace(base, "fr");
    expect(enlace).toBe(`${base}?idioma=fr`);
    expect(enlace).not.toContain("entradas");
  });
  it("desdeEnlace devuelve el id del mismo base", () => {
    expect(desdeEnlace(aEnlace(base, "fr-FR"), base)).toBe("fr-FR");
  });
  it("desdeEnlace rechaza otro dominio, http y otra ruta", () => {
    expect(desdeEnlace("https://otro-dominio.example/library?idioma=fr", base)).toBeNull();
    expect(desdeEnlace("http://starseed-os.vercel.app/library?idioma=fr", base)).toBeNull();
    expect(desdeEnlace("https://starseed-os.vercel.app/otra-ruta?idioma=fr", base)).toBeNull();
    expect(desdeEnlace(`${base}/x`, base)).toBeNull();
  });
});

describe("compartir · trozos", () => {
  it("ida y vuelta: trocear y reunir devuelve el mismo paquete", async () => {
    const paquete = paqueteBase();
    const trozos = trocear(paquete, 16);
    expect(trozos.length).toBeGreaterThan(1);
    const resultado = await reunir(trozos, paquete.hash);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.paquete.codigo).toBe("fr-FR");
    expect(resultado.paquete.entradas).toEqual(paquete.entradas);
  });
  it("falta un trozo y lo dice", async () => {
    const trozos = trocear(paqueteBase(), 16);
    const incompletos = trozos.filter((t) => t.indice !== 1);
    const resultado = await reunir(incompletos, "abc123");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("faltan");
  });
  it("un trozo manipulado no coincide con el hash", async () => {
    const trozos = trocear(paqueteBase(), 16);
    const primero = trozos[0];
    const caracter = primero.datos[0] === "A" ? "B" : "A";
    const manipulados = [{ ...primero, datos: caracter + primero.datos.slice(1) }, ...trozos.slice(1)];
    const resultado = await reunir(manipulados, "abc123");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("hash");
  });
  it("un trozo repetido se rechaza", async () => {
    const trozos = trocear(paqueteBase(), 16);
    const resultado = await reunir([...trozos, trozos[0]], "abc123");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("repetido");
  });
  it("un trozo fuera de rango se rechaza", async () => {
    const trozos = trocear(paqueteBase(), 16);
    const fuera = { ...trozos[0], indice: trozos[0].total };
    const resultado = await reunir([...trozos, fuera], "abc123");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("rango");
  });
  it("trozos con hashes distintos se rechazan", async () => {
    const trozos = trocear(paqueteBase(), 16);
    const resultado = await reunir([{ ...trozos[0], hashPaquete: "otro" }, ...trozos.slice(1)], "abc123");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("hashes");
  });
  it("reunir pasa por validarPaquete y rechaza paquetes inválidos", async () => {
    const entradas = JSON.parse('{"__proto__":"hack"}') as Record<string, string>;
    const paquete = { ...paqueteBase(), entradas };
    const trozos = trocear(paquete);
    const resultado = await reunir(trozos, paquete.hash);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("prohibida");
  });
});
