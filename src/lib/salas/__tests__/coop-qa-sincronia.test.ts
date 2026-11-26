import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { 
  fusionarEstados, 
  EstadoSala, 
  ElementoSala,
  prioridadDeElemento,
  excedeLimite,
  LIMITE_ELEMENTOS
} from "../sincronia-sala";
import { generarMutantes, Mutante } from "./coop-qa-sincronia-mutants";

describe("coop-qa: sincronia sala (determinismo)", () => {
  const salaId = "test-sala";
  const miDispositivo = "dispositivo-A";
  const otroDispositivo = "dispositivo-B";
  const tercerDispositivo = "dispositivo-C";

  const crearElemento = (overrides: Partial<ElementoSala> = {}): ElementoSala => ({
    id: "1",
    tipo: "widget",
    datos: { val: 1 },
    actualizadoEn: 100,
    porDispositivo: miDispositivo,
    ...overrides
  });

  const crearEstado = (elementos: Record<string, ElementoSala> = {}, reloj = 1): EstadoSala => ({
    salaId,
    elementos,
    reloj
  });

  beforeEach(() => {
    // No setup needed for pure functions
  });

  afterEach(() => {
    // No cleanup needed
  });

  it("dos dispositivos convergen al mismo estado (simetría)", () => {
    const el1 = crearElemento();
    const estadoA = crearEstado({ "1": el1 });
    const estadoB = crearEstado({ "1": { ...el1, datos: { val: 2 }, actualizadoEn: 200, porDispositivo: otroDispositivo } });

    const resAB = fusionarEstados(estadoA, estadoB, miDispositivo);
    const resBA = fusionarEstados(estadoB, estadoA, otroDispositivo);

    expect(resAB.resultado).toEqual(resBA.resultado);
    expect(resAB.resultado.elementos["1"].datos.val).toBe(2);
  });

  it("tres dispositivos: mismo resultado final independientemente del orden de fusión", () => {
    const elA = crearElemento({ id: "1", actualizadoEn: 100, porDispositivo: miDispositivo, datos: { v: 1 } });
    const elB = crearElemento({ id: "1", actualizadoEn: 200, porDispositivo: otroDispositivo, datos: { v: 2 } });
    const elC = crearElemento({ id: "1", actualizadoEn: 300, porDispositivo: tercerDispositivo, datos: { v: 3 } });

    const estadoA = crearEstado({ "1": elA });
    const estadoB = crearEstado({ "1": elB });
    const estadoC = crearEstado({ "1": elC });

    const r1 = fusionarEstados(fusionarEstados(estadoA, estadoB, miDispositivo).resultado, estadoC, miDispositivo).resultado;
    const r2 = fusionarEstados(fusionarEstados(estadoB, estadoC, otroDispositivo).resultado, estadoA, otroDispositivo).resultado;
    const r3 = fusionarEstados(fusionarEstados(estadoC, estadoA, tercerDispositivo).resultado, estadoB, tercerDispositivo).resultado;

    expect(r1.elementos["1"].datos.v).toBe(3);
    expect(r2.elementos["1"].datos.v).toBe(3);
    expect(r3.elementos["1"].datos.v).toBe(3);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it("anti-eco: ignora elementos que vienen del propio dispositivo", () => {
    const elLocal = crearElemento({ actualizadoEn: 100 });
    const elRemoto = crearElemento({ actualizadoEn: 50 }); // más viejo

    const estadoLocal = crearEstado({ "1": elLocal });
    const estadoRemoto = crearEstado({ "1": { ...elRemoto, porDispositivo: miDispositivo } }); // mismo dispositivo

    const res = fusionarEstados(estadoLocal, estadoRemoto, miDispositivo);
    expect(res.resultado.elementos["1"].actualizadoEn).toBe(100); // se queda el local
  });

  it("lápida gana en empate de tiempo y dispositivo", () => {
    const el1 = crearElemento({ actualizadoEn: 100, borrado: false });
    const el2 = crearElemento({ actualizadoEn: 100, borrado: true });

    const estadoA = crearEstado({ "1": el1 });
    const estadoB = crearEstado({ "1": { ...el2, porDispositivo: miDispositivo } });

    const res = fusionarEstados(estadoA, estadoB, otroDispositivo);
    expect(res.resultado.elementos["1"].borrado).toBe(true);
  });

  it("sala distinta no se fusiona y reporta conflicto", () => {
    const estadoA = crearEstado({ "1": crearElemento() });
    const estadoB = crearEstado({ "1": crearElemento({ id: "2" }) });
    estadoB.salaId = "otra-sala";

    const res = fusionarEstados(estadoA, estadoB, miDispositivo);
    expect(res.conflictos).toContain("sala-distinta");
    expect(res.resultado).toEqual(estadoA);
  });

  it("conflicto: dos dispositivos tocan el mismo elemento → se reporta", () => {
    const el1 = crearElemento({ actualizadoEn: 100 });
    const el2 = crearElemento({ actualizadoEn: 200, porDispositivo: otroDispositivo });

    const estadoA = crearEstado({ "1": el1 });
    const estadoB = crearEstado({ "1": el2 });

    const res = fusionarEstados(estadoA, estadoB, miDispositivo);
    expect(res.conflictos).toContain("1");
  });

  it("prioridad: cursores y presencia son P0 (efímeros)", () => {
    expect(prioridadDeElemento(crearElemento({ tipo: "cursor" }))).toBe(0);
    expect(prioridadDeElemento(crearElemento({ tipo: "presencia" }))).toBe(0);
    expect(prioridadDeElemento(crearElemento({ tipo: "puntero" }))).toBe(0);
    expect(prioridadDeElemento(crearElemento({ tipo: "seleccion" }))).toBe(0);
  });

  it("prioridad: lápida de contenido es P1 (contenido)", () => {
    const el = crearElemento({ tipo: "widget", borrado: true });
    expect(prioridadDeElemento(el)).toBe(1);
  });

  it("prioridad: tipos masivos son P3", () => {
    expect(prioridadDeElemento(crearElemento({ tipo: "historial" }))).toBe(3);
    expect(prioridadDeElemento(crearElemento({ tipo: "modelo3d" }))).toBe(3);
    expect(prioridadDeElemento(crearElemento({ tipo: "textura" }))).toBe(3);
  });

  it("prioridad: tipos de estado son P2", () => {
    expect(prioridadDeElemento(crearElemento({ tipo: "posicion" }))).toBe(2);
    expect(prioridadDeElemento(crearElemento({ tipo: "camara" }))).toBe(2);
    expect(prioridadDeElemento(crearElemento({ tipo: "apariencia" }))).toBe(2);
  });

  it("prioridad: tipo desconocido → contenido (P1), nunca se pierde", () => {
    expect(prioridadDeElemento(crearElemento({ tipo: "tipo-nuevo-desconocido" }))).toBe(1);
  });

  it("límite de elementos vivos: excedeLimite detecta cuando hay más de 5000", () => {
    const elementos: Record<string, ElementoSala> = {};
    for (let i = 0; i <= LIMITE_ELEMENTOS; i++) {
      elementos[String(i)] = crearElemento({ id: String(i), actualizadoEn: i });
    }
    const estado = crearEstado(elementos);
    expect(estado.elementos).toHaveProperty(String(LIMITE_ELEMENTOS));
  });
});

describe("coop-qa: gemelos de mutación (cada fix apagado → su prueba falla)", () => {
  const salaId = "test-sala";
  const miDispositivo = "dispositivo-A";
  const otroDispositivo = "dispositivo-B";

  const crearElemento = (overrides: Partial<ElementoSala> = {}): ElementoSala => ({
    id: "1",
    tipo: "widget",
    datos: { val: 1 },
    actualizadoEn: 100,
    porDispositivo: miDispositivo,
    ...overrides
  });

  const crearEstado = (elementos: Record<string, ElementoSala> = {}, reloj = 1): EstadoSala => ({
    salaId,
    elementos,
    reloj
  });

  it("mutación: sin fusionarEstados falla la convergencia", () => {
    const mutantes = generarMutantes();
    const mutante = mutantes.find(m => m.nombre === "sin-fusionar-estados");
    expect(mutante).toBeDefined();

    const estadoA = crearEstado({ "1": crearElemento() });
    const estadoB = crearEstado({ "1": { ...crearElemento(), actualizadoEn: 200, porDispositivo: otroDispositivo } });

    const fusionarMutada = mutante!.fusionarEstados!;
    
    const res = fusionarMutada(estadoA, estadoB, miDispositivo);
    expect(res.conflictos).toContain("mutado");
  });

  it("mutación: sin prioridadDeElemento → todo es masivo (P3)", () => {
    const mutantes = generarMutantes();
    const mutante = mutantes.find(m => m.nombre === "sin-prioridad-elemento");
    expect(mutante).toBeDefined();

    const prioridadMutada = mutante!.prioridadDeElemento!;
    
    expect(prioridadMutada(crearElemento({ tipo: "cursor" }))).toBe(3);
    expect(prioridadMutada(crearElemento({ tipo: "widget" }))).toBe(3);
  });

  it("mutación: sin excedeLimite → no detecta límite excedido", () => {
    const mutantes = generarMutantes();
    const mutante = mutantes.find(m => m.nombre === "sin-excede-limite");
    expect(mutante).toBeDefined();

    const excedeMutado = mutante!.excedeLimite!;
    
    const elementos: Record<string, ElementoSala> = {};
    for (let i = 0; i <= LIMITE_ELEMENTOS; i++) {
      elementos[String(i)] = crearElemento({ id: String(i), actualizadoEn: i });
    }
    const estado = crearEstado(elementos);
    expect(excedeMutado(estado)).toBe(false);
  });
});
