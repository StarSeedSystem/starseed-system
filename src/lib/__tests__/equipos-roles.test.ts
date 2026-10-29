import { describe, expect, it } from "vitest";
import {
  EQUIPOS_BASE, ordenDeTareas, validarEquipo,
  type EquipoRoles, type RolEquipo,
} from "@/lib/agentes/equipos-roles";

function equipo(id: string): EquipoRoles {
  const encontrado = EQUIPOS_BASE.find((e) => e.id === id);
  if (!encontrado) throw new Error(`equipo de prueba inexistente: ${id}`);
  return JSON.parse(JSON.stringify(encontrado)) as EquipoRoles;
}

function otroRol(base: RolEquipo): RolEquipo {
  return { ...base, objetivo: "Objetivo distinto para la prueba" };
}

describe("equipos base", () => {
  it("declara tres equipos con identificadores únicos", () => {
    const ids = EQUIPOS_BASE.map((e) => e.id);
    expect(ids).toEqual(["publicacion", "app-widget", "atomo-proto"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los tres equipos son válidos en ámbito personal", () => {
    for (const e of EQUIPOS_BASE) {
      expect(validarEquipo(e)).toEqual([]);
    }
  });

  it("publicacion no es válido en grupo público por el uso de internet", () => {
    const problemas = validarEquipo(equipo("publicacion"), { ambito: "grupo-publico" });
    expect(problemas.some((p) => p.includes("internet"))).toBe(true);
  });

  it("ordenDeTareas de publicacion respeta la cadena", () => {
    expect(ordenDeTareas(equipo("publicacion"))).toEqual(["investigar", "redactar", "revisar"]);
  });
});

describe("validarEquipo detecta cada regla rota", () => {
  it("rol repetido", () => {
    const e = equipo("publicacion");
    e.roles.push(otroRol(e.roles[0]));
    expect(validarEquipo(e).some((p) => p.includes("rol repetido"))).toBe(true);
  });

  it("tarea con dependencia inexistente", () => {
    const e = equipo("publicacion");
    e.tareas[1].depende = ["no-existe"];
    expect(validarEquipo(e).some((p) => p.includes("tarea inexistente"))).toBe(true);
  });

  it("ciclo entre tareas", () => {
    const e = equipo("publicacion");
    e.tareas[0].depende = ["revisar"];
    expect(validarEquipo(e).some((p) => p.includes("ciclo entre tareas"))).toBe(true);
  });

  it("detecta que la última tarea no la ejecuta un rol que verifica", () => {
    const e = equipo("publicacion");
    const revisar = e.tareas[e.tareas.length - 1];
    revisar.rol = "redactor";
    expect(validarEquipo(e).some((p) => p.includes("última tarea") && p.includes("verifica"))).toBe(true);
  });

  it("detecta que no se declara ningún motor", () => {
    const e = equipo("publicacion");
    e.motoresValidos = [];
    expect(validarEquipo(e).some((p) => p.includes("motoresValidos está vacío"))).toBe(true);
  });

  it("sin ningún rol que verifique", () => {
    const e = equipo("publicacion");
    for (const r of e.roles) r.verifica = false;
    expect(validarEquipo(e)).toContain("ningún rol verifica");
  });

  it("herramienta inventada", () => {
    const e = equipo("publicacion");
    e.roles[0].herramientas.push("herramienta:inventada");
    expect(validarEquipo(e).some((p) => p.includes("herramienta:inventada"))).toBe(true);
  });

  it("publicaciones sin revisión humana", () => {
    const e = equipo("publicacion");
    e.revisionHumana = false;
    expect(validarEquipo(e).some((p) => p.includes("revisión humana"))).toBe(true);
  });

  it("motor de referencia como omo-slim", () => {
    const e = equipo("publicacion");
    e.motoresValidos = ["omo-slim"];
    expect(validarEquipo(e).some((p) => p.includes("referencia"))).toBe(true);
  });

  it("motor inexistente", () => {
    const e = equipo("publicacion");
    e.motoresValidos = ["motor-que-no-existe"];
    expect(validarEquipo(e).some((p) => p.includes("inexistente"))).toBe(true);
  });

  it("texto con forma de clave montado en tiempo de ejecución", () => {
    const e = equipo("publicacion");
    e.nombre = ["sk", "-", "a".repeat(24)].join("");
    expect(validarEquipo(e).some((p) => p.includes("secreto"))).toBe(true);
  });

  it("un ciclo A→B→A devuelve los ids sin resolver", () => {
    const e: EquipoRoles = {
      id: "ciclo", nombre: "Ciclo", contexto: "protogenesis", proceso: "secuencial",
      roles: [otroRol(EQUIPOS_BASE[2].roles[0])], tareas: [
        { id: "A", descripcion: "A", rol: "director", depende: ["B"], salidaEsperada: "A" },
        { id: "B", descripcion: "B", rol: "director", depende: ["A"], salidaEsperada: "B" },
      ], motoresValidos: ["nativo"], revisionHumana: false,
    };
    expect(ordenDeTareas(e)).toEqual({ ciclo: ["A", "B"] });
  });
});
