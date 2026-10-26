import { describe, it, expect } from "vitest";
import { estadoVacio, asignar, afirmacion, asignacionValida, EstadoRecursosIa } from "../asignaciones";
import { ofertaDesdeAsignaciones } from "../oferta-desde-asignaciones";

function crearModelo(id: string, tamano: number): any {
  return {
    tipo: "modelo",
    id,
    nombre: id,
    tamanoGb: tamano,
  };
}

function crearAsignacion(elemento: any, almacen: string): any {
  return {
    elemento,
    almacenEn: almacen,
    alcance: { tipo: "perfil", id: "p1", visibilidad: "privada" },
    t: 1,
  };
}

describe("ofertaDesdeAsignaciones", () => {
  it("neurona sin servidor propio", () => {
    const e: EstadoRecursosIa = estadoVacio();
    e.asignaciones = {
      modelo: crearAsignacion(crearModelo("mod1", 5), "storage1"),
    };
    const oferta = ofertaDesdeAsignaciones(e);
    expect(oferta.presta.cuenta).toBe(false);
    expect(oferta.almacen.prestaMb).toBe(5);
  });

  it("neurona con servidor propio privado", () => {
    const e: EstadoRecursosIa = estadoVacio();
    e.topologias = {
      p1: {
        topologia: "servidor-propio",
        alcance: { tipo: "perfil", id: "p1", visibilidad: "privada" },
        vias: ["local"],
      },
    };
    const oferta = ofertaDesdeAsignaciones(e);
    expect(oferta.presta.cuenta).toBe(true);
  });

  it("neurona con alcance de grupo", () => {
    const e: EstadoRecursosIa = estadoVacio();
    e.topologias = {
      p1: {
        topologia: "almacen-externo",
        alcance: { tipo: "grupo", id: "g1", visibilidad: "publica" },
        vias: ["local"],
      },
    };
    const oferta = ofertaDesdeAsignaciones(e);
    expect(oferta.presta.grupos).toContain("g1");
  });
});