import { describe, expect, it } from "vitest";
import {
  OrigenPeticion,
  NivelConfirmacion,
  NeuronaDestino,
  PeticionRemota,
  CambioVista,
  OrdenRemota,
  VistaPrevia,
  MotivoRechazo,
  ResultadoPropuesta,
  SinPreguntarPorNeurona,
  buscarNeurona,
  armarPropuestaRemota,
  puedeEnviarse,
} from "@/lib/astraura/herramientas/neuronas-remotas";

const neuronas: readonly NeuronaDestino[] = [
  {
    id: "neurona-01",
    nombre: "Neurona Principal",
    configurarADistancia: true,
    terminal: "usuario",
  },
  {
    id: "neurona-02",
    nombre: "Neurona Secundaria",
    configurarADistancia: false,
    terminal: "administrador",
  },
  {
    id: "neurona-03",
    nombre: "Otra Neurona",
    configurarADistancia: true,
    terminal: "ninguno",
  },
];

const sinPreguntar: SinPreguntarPorNeurona = {
  "neurona-01": true,
};

describe("buscarNeurona", () => {
  it("busca neurona exacta por nombre", () => {
    const r = buscarNeurona("Neurona Principal", neuronas);
    expect(r).toEqual(neuronas[0]);
  });

  it("busca neurona exacta por id", () => {
    const r = buscarNeurona("neurona-01", neuronas);
    expect(r).toEqual(neuronas[0]);
  });

  it("devuelve null para nombre vacío", () => {
    const r = buscarNeurona("", neuronas);
    expect(r).toBeNull();
  });

  it("devuelve objeto cuando hay un match exacto único", () => {
    const r = buscarNeurona("Neurona Principal", neuronas);
    expect(r).toBeInstanceOf(Object);
    expect((r as any).id).toBe("neurona-01");
  });

  it("devuelve 'ambigua' cuando hay varios matches exactos", () => {
    const muchas: readonly NeuronaDestino[] = [
      { id: "a", nombre: "Alpha", configurarADistancia: true, terminal: "usuario" },
      { id: "b", nombre: "Alpha", configurarADistancia: true, terminal: "usuario" },
    ];
    const r = buscarNeurona("Alpha", muchas);
    expect(r).toBe("ambigua");
  });

  it("devuelve null cuando no hay matches", () => {
    const r = buscarNeurona("Neurona Inexistente", neuronas);
    expect(r).toBeNull();
  });
});

describe("armarPropuestaRemota", () => {
  it("devuelve neurona-desconocida para neurona que no existe", () => {
    const p: PeticionRemota = {
      origen: "persona",
      neurona: "Inexistente",
      tipo: "ajuste",
      clave: "brillo",
      valor: true,
      ambito: "ajuste" as const,
    };
    const r = armarPropuestaRemota(p, neuronas);
    expect(r).toEqual({
      ok: false,
      motivo: "neurona-desconocida",
      ayuda: `No encuentro una neurona llamada «Inexistente».`,
    });
  });

  it("devuelve neurona-ambigua cuando hay varios matches", () => {
    const p: PeticionRemota = {
      origen: "persona",
      neurona: "Neurona",
      tipo: "ajuste",
      clave: "brillo",
      valor: true,
      ambito: "ajuste" as const,
    };
    const r = armarPropuestaRemota(p, neuronas);
    expect(r).toEqual({
      ok: false,
      motivo: "neurona-ambigua",
      ayuda: `Hay varias neuronas que encajan con «Neurona»: dime el nombre completo.`,
    });
  });

  it("devuelve seguridad cuando la clave es de seguridad", () => {
    const p: PeticionRemota = {
      origen: "persona",
      neurona: "neurona-01",
      tipo: "ajuste",
      clave: "agent",
      valor: true,
      ambito: "ajuste" as const,
    };
    const r = armarPropuestaRemota(p, neuronas);
    expect(r).toEqual({
      ok: false,
      motivo: "seguridad",
      ayuda: `«agent» es de seguridad: solo se cambia en la propia neurona, nunca a distancia.`,
    });
  });

  it("devuelve permiso-apagado cuando configurarADistancia es falso", () => {
    const p: PeticionRemota = {
      origen: "persona",
      neurona: "neurona-02",
      tipo: "ajuste",
      clave: "brillo",
      valor: true,
      ambito: "ajuste" as const,
    };
    const r = armarPropuestaRemota(p, neuronas);
    expect(r).toEqual({
      ok: false,
      motivo: "permiso-apagado",
      ayuda: `«Neurona Secundaria» no deja configurarla a distancia. Para darlo: abre Ajustes en esa neurona, entra en «Control entre mis neuronas» y enciende «Configurar a distancia».`,
    });
  });

  it("devuelve resultado ok para ajuste con todas las condiciones ok", () => {
    const p: PeticionRemota = {
      origen: "persona",
      neurona: "neurona-01",
      tipo: "ajuste",
      clave: "brillo",
      valor: 75,
      ambito: "ajuste" as const,
    };
    const r = armarPropuestaRemota(p, neuronas);
    expect(r).toEqual({
      ok: true,
      nivel: "pregunta",
      orden: { neuronaId: "neurona-01", nombre: "poner-ajuste", args: { clave: "brillo", valor: 75, ambito: "ajuste" } },
      vista: { titulo: `Cambiar «brillo» en Neurona Principal`, cambios: [{ clave: "brillo", ambito: "ajuste", anterior: null, nuevo: 75 }], reversible: true },
    });
  });

  it("devuelve sin-preguntar cuando la neurona está marcada", () => {
    const p: PeticionRemota = {
      origen: "persona",
      neurona: "neurona-01",
      tipo: "ajuste",
      clave: "brillo",
      valor: 75,
      ambito: "ajuste" as const,
    };
    const r = armarPropuestaRemota(p, neuronas, sinPreguntar);
    expect(r.nivel).toBe("sin-preguntar");
  });

  it("devuelve resultado ok para terminal", () => {
    const p: PeticionRemota = {
      origen: "persona",
      neurona: "neurona-02",
      tipo: "terminal",
      comando: "almacen-estado",
      args: {},
    };
    const r = armarPropuestaRemota(p, neuronas);
    expect(r).toEqual({
      ok: true,
      nivel: "pregunta",
      orden: { neuronaId: "neurona-02", nombre: "almacen-estado", args: {} },
      vista: { titulo: `Estado de los almacenes en Neurona Secundaria`, cambios: [], reversible: false },
    });
  });

  it("devuelve argumentos when validarArgsAjusteRemoto falls", () => {
    const p: PeticionRemota = {
      origen: "persona",
      neurona: "neurona-01",
      tipo: "ajuste",
      clave: "brillo",
      valor: { tipo: "invalid" } as any,
      ambito: "ajuste" as const,
    };
    const r = armarPropuestaRemota(p, neuronas);
    expect(r).toEqual({
      ok: false,
      motivo: "argumentos",
      ayuda: "El ajuste pedido no tiene una forma válida.",
    });
  });
});

describe("puedeEnviarse", () => {
  it("devuelve true cuando nivel es sin-preguntar", () => {
    expect(puedeEnviarse("sin-preguntar", true)).toBe(true);
  });

  it("devuelve true cuando persona dijo sí", () => {
    expect(puedeEnviarse("pregunta", true)).toBe(true);
  });

  it("devuelve false cuando persona no dijo sí", () => {
    expect(puedeEnviarse("pregunta", false)).toBe(false);
  });

  it("devuelve false para pregunta cuando persona no dijo sí", () => {
    expect(puedeEnviarse("pregunta", false)).toBe(false);
  });
});