import { describe, it, expect } from "vitest";
import {
  FORMATO_CEREBRO_PORTATIL,
  VERSION_CEREBRO_PORTATIL,
  exportarCerebroPortatil,
  abrirCerebroPortatil,
  importarCerebroPortatil,
  validarPaquete,
  serializarPaquete,
  parsearPaquete,
  resumenPaquete,
  esSoloLectura,
  type EntradaExportacion,
  type PaqueteCerebroPortatil,
} from "../cerebro-portatil";
import { generarClave, type ClaveCifrado } from "../fragmentos";

const base: EntradaExportacion = {
  cerebroId: "cerebro-1",
  nombre: "Cerebro privado",
  modalidad: "cerebro-completo",
  contenido: "memorias del dueño",
  clave: generarClave(),
  idPaquete: "paquete-1",
  creadoEn: "2026-11-25T10:00:00Z",
};

async function crear(over: Partial<EntradaExportacion> = {}): Promise<{
  paquete: PaqueteCerebroPortatil;
  clave: ClaveCifrado;
}> {
  const clave = over.clave ?? base.clave;
  const r = await exportarCerebroPortatil({ ...base, ...over, clave });
  if (!r.ok || !r.paquete) throw new Error(r.error ?? "no se pudo exportar");
  return { paquete: r.paquete, clave };
}

describe("exportar cerebro portátil", () => {
  it("produce un paquete válido, cifrado y sin el texto en claro", async () => {
    const { paquete } = await crear();
    expect(validarPaquete(paquete).valido).toBe(true);
    expect(paquete.formato).toBe(FORMATO_CEREBRO_PORTATIL);
    expect(paquete.version).toBe(VERSION_CEREBRO_PORTATIL);
    expect(paquete.modalidad).toBe("cerebro-completo");
    expect(paquete.cifrado.algoritmo).toBe("AES-GCM-256");
    expect(paquete.contenido).not.toContain("memorias del dueño");
    expect(paquete.huella).toHaveLength(64);
    expect(serializarPaquete(paquete)).not.toContain("memorias del dueño");
  });

  it("rechaza nombre vacío, modalidad inválida y llave de otro tamaño", async () => {
    expect((await exportarCerebroPortatil({ ...base, nombre: " " })).ok).toBe(false);
    expect(
      (await exportarCerebroPortatil({ ...base, modalidad: "replica" as never })).ok
    ).toBe(false);
    const corta = new Uint8Array(31);
    expect((await exportarCerebroPortatil({ ...base, clave: corta })).ok).toBe(false);
    expect((await exportarCerebroPortatil({ ...base, clave: corta })).error).toContain("32 bytes");
  });

  it("guarda las partes indicadas en modalidad «parte»", async () => {
    const { paquete } = await crear({ modalidad: "parte", partes: ["/capa/soul", "/capa/ego"] });
    expect(paquete.modalidad).toBe("parte");
    expect(paquete.partes).toEqual(["/capa/soul", "/capa/ego"]);
    expect(validarPaquete(paquete).valido).toBe(true);
  });
});

describe("abrir cerebro portátil", () => {
  it("con la llave del dueño abre en lectura y escritura y devuelve el contenido", async () => {
    const { paquete, clave } = await crear();
    const estado = await abrirCerebroPortatil(paquete, clave);
    expect(estado.modo).toBe("lectura-escritura");
    expect(estado.contenido).toBe("memorias del dueño");
    expect(esSoloLectura(estado)).toBe(false);
  });

  it("sin llave abre en solo lectura y no expone el contenido", async () => {
    const { paquete } = await crear();
    const estado = await abrirCerebroPortatil(paquete);
    expect(estado.modo).toBe("solo-lectura");
    expect(estado.contenido).toBeUndefined();
    expect(estado.motivo).toContain("solo lectura");
    expect(esSoloLectura(estado)).toBe(true);
  });

  it("con una llave que no coincide abre en solo lectura", async () => {
    const { paquete } = await crear();
    const estado = await abrirCerebroPortatil(paquete, generarClave());
    expect(estado.modo).toBe("solo-lectura");
    expect(estado.contenido).toBeUndefined();
    expect(estado.motivo).toContain("no coincide");
  });

  it("un paquete inválido se abre en solo lectura sin lanzar", async () => {
    const { paquete } = await crear();
    const roto = { ...paquete, version: 99 } as PaqueteCerebroPortatil;
    const estado = await abrirCerebroPortatil(roto, base.clave);
    expect(estado.modo).toBe("solo-lectura");
    expect(estado.contenido).toBeUndefined();
  });

  it("el resumen es legible y nunca lleva el contenido", async () => {
    const { paquete } = await crear();
    const resumen = resumenPaquete(paquete);
    expect(resumen.nombre).toBe("Cerebro privado");
    expect(resumen.cifrado).toBe(true);
    expect(JSON.stringify(resumen)).not.toContain("memorias del dueño");
  });
});

describe("importar cerebro portátil", () => {
  it("sin llave importa en solo lectura", async () => {
    const { paquete } = await crear();
    const r = await importarCerebroPortatil(paquete);
    expect(r.ok).toBe(true);
    expect(r.modo).toBe("solo-lectura");
    expect(r.contenido).toBeUndefined();
  });

  it("con la llave importa el contenido en una neurona nueva", async () => {
    const { paquete, clave } = await crear();
    const r = await importarCerebroPortatil(paquete, clave);
    expect(r.ok).toBe(true);
    expect(r.modo).toBe("lectura-escritura");
    expect(r.contenido).toBe("memorias del dueño");
    expect(r.conflicto).toBeUndefined();
  });

  it("si el destino ya tiene otra versión, propone variación y no pisa", async () => {
    const { paquete, clave } = await crear();
    const r = await importarCerebroPortatil(paquete, clave, {
      ruta: "memorias.md",
      contenido: "versión local distinta",
    });
    expect(r.ok).toBe(true);
    expect(r.conflicto?.ruta).toBe("memorias.md");
    expect(r.conflicto?.guardarComo).toContain("(conflicto portatil");
    expect(r.contenido).toBeUndefined();
  });

  it("si el destino ya tiene el mismo contenido, no hay conflicto", async () => {
    const { paquete, clave } = await crear();
    const r = await importarCerebroPortatil(paquete, clave, {
      ruta: "memorias.md",
      contenido: "memorias del dueño",
    });
    expect(r.conflicto).toBeUndefined();
    expect(r.contenido).toBe("memorias del dueño");
  });

  it("rechaza un paquete inválido", async () => {
    const { paquete } = await crear();
    const r = await importarCerebroPortatil({ ...paquete, cerebroId: "" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Paquete inválido");
  });
});

describe("validación y parseo", () => {
  it("rechaza campos que puedan llevar un secreto", async () => {
    const { paquete } = await crear();
    const conSecreto = { ...paquete, token: "oculto" } as unknown as Record<string, unknown>;
    const v = validarPaquete(conSecreto);
    expect(v.valido).toBe(false);
    expect(v.errores.join(" ")).toContain("campo prohibido");
  });

  it("rechaza versión, formato y modalidad desconocidos", async () => {
    const { paquete } = await crear();
    expect(validarPaquete({ ...paquete, version: 99 }).valido).toBe(false);
    expect(validarPaquete({ ...paquete, formato: "otro" }).valido).toBe(false);
    expect(validarPaquete({ ...paquete, modalidad: "replica" }).valido).toBe(false);
  });

  it("serializa y parsea el paquete completo", async () => {
    const { paquete } = await crear();
    const r = parsearPaquete(serializarPaquete(paquete));
    expect(r.ok).toBe(true);
    expect(r.paquete).toEqual(paquete);
  });

  it("parsea paquetes con JSON roto o estructura inválida", () => {
    expect(parsearPaquete("{ roto }").ok).toBe(false);
    expect(parsearPaquete(JSON.stringify({ formato: "x" })).ok).toBe(false);
  });
});