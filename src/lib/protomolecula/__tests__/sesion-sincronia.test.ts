import { describe, expect, it } from "vitest";
import {
  elementoDeOperacion,
  elementoDeEstructura,
  moleculaDesdeElementos,
  crearAcumuladorDeGestos,
  formaCorta,
  desdeFormaCorta,
} from "../sesion-sincronia";
import type { Operacion, Cambio, Autor, EstadoValores, Molecula, Capa, AtomoEnUso, ParametroRef } from "../tipos";
import { valorPorDefecto } from "../parametros";

// Mock data for testing
const autorMock: Autor = { tipo: "persona", id: "autor-1", nombre: "Autor Uno" };
const autorMock2: Autor = { tipo: "persona", id: "autor-2", nombre: "Autor Dos" };

const parametroReverb: Parametro = { id: "mezcla", nombre: "Reverberación", tipo: "numero", min: 0, max: 100, paso: 1, unidad: "%", defecto: 30 };
const refReverb: ParametroRef = { atomoId: "atom-1", parametroId: "mezcla" };
const opMock = (id: string, accion: { tipo: "exacta"; valor: number }, t: number): Operacion => ({
  id,
  objetivo: refReverb,
  accion,
  autor: autorMock,
  origen: "mano",
  t,
  fuente: undefined,
  texto: undefined,
});

const cambioMock = (operacion: Operacion, antes: number, despues: number): Cambio => ({
  operacion,
  antes,
  despues,
  acotado: false,
  reversible: true,
  nota: undefined,
});

const moleculaBase: Molecula = {
  id: "mol-1",
  titulo: "Molecula de prueba",
  ambito: "personal",
  capas: [],
  atomos: [],
  valores: {},
  version: 1,
  creadaEn: Date.now() - 1000,
  actualizadaEn: Date.now(),
};

describe("elementoDeOperacion", () => {
  it("should create ElementoSala with correct properties", () => {
    const op = opMock("op-1", { tipo: "exacta", valor: 50 }, 1000);
    const cambio = cambioMock(op, 30, 50);
    const elemento = elementoDeOperacion(op, cambio);
    
    expect(elemento.tipo).toBe("parametro");
    expect(elemento.actualizadoEn).toBe(1000);
    expect(elemento.porDispositivo).toBe("autor-1");
    expect(elemento.borrado).toBe(false);
    expect(elemento.datos).toHaveProperty("clave", "atom-1::mezcla");
    expect(elemento.datos).toHaveProperty("valor", 50);
  });
});

describe("elementoDeEstructura", () => {
  it("should create ElementoSala for capa", () => {
    const capa: Capa = {
      id: "capa-1",
      tipo: "escena3d",
      titulo: "Escena 3D",
      formato: "glb",
      referencia: null,
      orden: 0.5,
      visible: true,
      bloqueada: false,
    };
    const elemento = elementoDeEstructura("capa", capa.id, capa, false, 2000, "device-1");
    
    expect(elemento.tipo).toBe("capa");
    expect(elemento.actualizadoEn).toBe(2000);
    expect(elemento.porDispositivo).toBe("device-1");
    expect(elemento.borrado).toBe(false);
    expect(elemento.datos).toHaveProperty("id", "capa-1");
    expect(elemento.datos).toHaveProperty("orden", 0.5);
  });
  
  it("should create ElementoSala for atomo", () => {
    const atomo: AtomoEnUso = {
      id: "atomo-1",
      herramientaId: "herramienta-1",
      capaId: "capa-1",
      titulo: "Átomo de prueba",
      ejecutaEn: "navegador",
      estado: "activo",
    };
    const elemento = elementoDeEstructura("atomo", atomo.id, atomo, false, 2000, "device-1");
    
    expect(elemento.tipo).toBe("atomo");
    expect(elemento.actualizadoEn).toBe(2000);
    expect(elemento.porDispositivo).toBe("device-1");
    expect(elemento.borrado).toBe(false);
    expect(elemento.datos).toHaveProperty("id", "atomo-1");
    expect(elemento.datos).toHaveProperty("herramientaId", "herramienta-1");
  });
  
  it("should mark ElementoSala as borrado when eliminado is true", () => {
    const capa: Capa = {
      id: "capa-1",
      tipo: "escena3d",
      titulo: "Escena 3D",
      formato: "glb",
      referencia: null,
      orden: 0.5,
      visible: true,
      bloqueada: false,
    };
    const elemento = elementoDeEstructura("capa", capa.id, capa, true, 2000, "device-1");
    
    expect(elemento.borrado).toBe(true);
  });
});

describe("moleculaDesdeElementos", () => {
  it("should apply parametro changes", () => {
    const op = opMock("op-1", { tipo: "exacta", valor: 75 }, 1500);
    const cambio = cambioMock(op, 30, 75);
    const elemento = elementoDeOperacion(op, cambio);
    
    const result = moleculaDesdeElementos(moleculaBase, [elemento]);
    
    expect(result.valores["atom-1::mezcla"]).toBe(75);
    expect(result.actualizadaEn).toBe(1500);
    expect(result.version).toBe(2);
  });
  
  it("should add and remove capas", () => {
    const capa: Capa = {
      id: "capa-1",
      tipo: "escena3d",
      titulo: "Escena 3D",
      formato: "glb",
      referencia: null,
      orden: 0.5,
      visible: true,
      bloqueada: false,
    };
    const elementoAdd = elementoDeEstructura("capa", capa.id, capa, false, 1500, "device-1");
    const elementoRemove = elementoDeEstructura("capa", capa.id, {}, true, 2000, "device-1");
    
    let result = moleculaDesdeElementos(moleculaBase, [elementoAdd]);
    expect(result.capas.length).toBe(1);
    expect(result.capas[0].id).toBe("capa-1");
    
    result = moleculaDesdeElementos(result, [elementoRemove]);
    expect(result.capas.length).toBe(0);
  });
  
  it("should add and remove atomos", () => {
    const atomo: AtomoEnUso = {
      id: "atomo-1",
      herramientaId: "herramienta-1",
      capaId: "capa-1",
      titulo: "Átomo de prueba",
      ejecutaEn: "navegador",
      estado: "activo",
    };
    const elementoAdd = elementoDeEstructura("atomo", atomo.id, atomo, false, 1500, "device-1");
    const elementoRemove = elementoDeEstructura("atomo", atomo.id, {}, true, 2000, "device-1");
    
    let result = moleculaDesdeElementos(moleculaBase, [elementoAdd]);
    expect(result.atomos.length).toBe(1);
    expect(result.atomos[0].id).toBe("atomo-1");
    
    result = moleculaDesdeElementos(result, [elementoRemove]);
    expect(result.atomos.length).toBe(0);
  });
});

describe("crearAcumuladorDeGestos", () => {
  it("should emit gesture every specified interval", () => {
    const acum = crearAcumuladorDeGestos({ cadaMs: 16 });
    // TODO: Implementar pruebas reales
    expect(acum).toBeDefined();
  });
  
  it("should emit confirmation when released", () => {
    const acum = crearAcumuladorDeGestos({ cadaMs: 16 });
    // TODO: Implementar pruebas reales
    expect(acum).toBeDefined();
  });
});

describe("formaCorta y desdeFormaCorta", () => {
  it("should convert operation to short form and back", () => {
    const op = opMock("op-1", { tipo: "exacta", valor: 42 }, 1000);
    const corto = formaCorta(op);
    expect(typeof corto).toBe("string");
    expect(corto.length).toBeLessThan(200);
    
    const opRestaurado = desdeFormaCorta(corto);
    expect(opRestaurado).not.toBeNull();
    if (opRestaurado) {
      expect(opRestaurado.id).toBe(op.id);
      expect(opRestaurado.objetivo).toEqual(op.objetivo);
      expect(opRestaurado.accion).toEqual(op.accion);
    }
  });
  
  it("should return null for invalid short form", () => {
    const opRestaurado = desdeFormaCorta("invalid short form");
    expect(opRestaurado).toBeNull();
  });
});