import { describe, it, expect } from "vitest";

import {
  ORDEN_ALCANCE,
  MINIMO_FUGA,
  alcanceVisiblePara,
  filtrarParaAlcance,
  puedeEscribirEn,
  detectarFuga,
  type ActorMemoria,
  type FragmentoMemoria,
} from "@/lib/nucleo/alcance-memoria";

// Por qué existe este test (Ola 307, 2026-09-09): la promesa es «cerebros con memoria y
// acceso a toda la red». La contrapartida innegociable es que un agente de grupo o público
// jamás vea —ni escriba en— la memoria personal de su dueño. Si alguien invierte un día
// esta matriz por comodidad, el fallo salta aquí y no en una filtración real.

const USUARIO: ActorMemoria = { tipo: "usuario" };
const PERSONAL: ActorMemoria = { tipo: "agente-personal" };
const GRUPO: ActorMemoria = { tipo: "agente-grupo", grupoId: "circulo-lunar" };
const PUBLICO: ActorMemoria = { tipo: "agente-publico" };

function fragmento(parcial: Partial<FragmentoMemoria> & { id: string }): FragmentoMemoria {
  return {
    alcance: "personal",
    texto: "recuerdo cualquiera",
    origen: "conversación",
    at: 1_757_000_000_000,
    ...parcial,
  };
}

describe("matriz de visibilidad de la memoria", () => {
  it("ordena los ámbitos de lo más privado a lo más abierto", () => {
    expect(ORDEN_ALCANCE).toEqual(["personal", "perfil", "grupo", "publica"]);
  });

  it("la persona dueña ve toda su memoria", () => {
    expect(alcanceVisiblePara(USUARIO)).toEqual(["personal", "perfil", "grupo", "publica"]);
  });

  it("un agente personal ve la memoria personal de su dueño", () => {
    expect(alcanceVisiblePara(PERSONAL)).toEqual(["personal", "perfil", "grupo", "publica"]);
  });

  it("un agente de grupo ve solo grupo y pública", () => {
    expect(alcanceVisiblePara(GRUPO)).toEqual(["grupo", "publica"]);
    expect(alcanceVisiblePara(GRUPO)).not.toContain("personal");
    expect(alcanceVisiblePara(GRUPO)).not.toContain("perfil");
  });

  it("un agente público ve solo lo público", () => {
    expect(alcanceVisiblePara(PUBLICO)).toEqual(["publica"]);
  });
});

describe("permisos de escritura", () => {
  it("un agente público no escribe en la memoria personal de nadie", () => {
    expect(puedeEscribirEn(PUBLICO, "personal")).toBe(false);
    expect(puedeEscribirEn(PUBLICO, "perfil")).toBe(false);
    expect(puedeEscribirEn(PUBLICO, "grupo")).toBe(false);
    expect(puedeEscribirEn(PUBLICO, "publica")).toBe(true);
  });

  it("un agente de grupo tampoco toca lo personal, y necesita declarar su grupo", () => {
    expect(puedeEscribirEn(GRUPO, "personal")).toBe(false);
    expect(puedeEscribirEn(GRUPO, "grupo")).toBe(true);
    expect(puedeEscribirEn({ tipo: "agente-grupo" }, "grupo")).toBe(false);
  });

  it("el usuario y su agente personal sí escriben en lo personal", () => {
    expect(puedeEscribirEn(USUARIO, "personal")).toBe(true);
    expect(puedeEscribirEn(PERSONAL, "personal")).toBe(true);
  });
});

describe("filtrarParaAlcance", () => {
  const memoria: FragmentoMemoria[] = [
    fragmento({ id: "f1", alcance: "personal", texto: "lo que solo sabe la almohada" }),
    fragmento({ id: "f2", alcance: "perfil", texto: "mi apodo en la red" }),
    fragmento({ id: "f3", alcance: "grupo", texto: "acuerdo del círculo lunar" }),
    fragmento({ id: "f4", alcance: "publica", texto: "el manifiesto StarSeed es abierto" }),
  ];

  it("un agente de grupo solo recibe lo de grupo y lo público", () => {
    const visto = filtrarParaAlcance(memoria, alcanceVisiblePara(GRUPO));
    expect(visto.map((fr) => fr.id)).toEqual(["f3", "f4"]);
  });

  it("un agente público solo recibe lo público", () => {
    const visto = filtrarParaAlcance(memoria, alcanceVisiblePara(PUBLICO));
    expect(visto.map((fr) => fr.id)).toEqual(["f4"]);
  });

  it("el agente personal lo recibe todo, en el orden de entrada", () => {
    const visto = filtrarParaAlcance(memoria, alcanceVisiblePara(PERSONAL));
    expect(visto.map((fr) => fr.id)).toEqual(["f1", "f2", "f3", "f4"]);
  });

  it("una lista de permitidos vacía no deja pasar nada", () => {
    expect(filtrarParaAlcance(memoria, [])).toEqual([]);
  });
});

describe("detectarFuga", () => {
  const personales: FragmentoMemoria[] = [
    fragmento({
      id: "p1",
      alcance: "personal",
      texto: "La cita con el médico del jueves a las siete es en la clínica del río.",
    }),
    fragmento({
      id: "p2",
      alcance: "personal",
      texto: "Me duele la espalda desde el martes.",
    }),
  ];

  it("atrapa el copiar y pegar de una frase privada larga", () => {
    const emitido =
      "Hola grupo: la cita con el médico del jueves a las siete no la puedo mover, lo siento.";
    const fugas = detectarFuga(emitido, personales);
    expect(fugas).toHaveLength(1);
    expect(fugas[0]).toContain("médico del jueves a las siete");
    expect(fugas[0].length).toBeGreaterThanOrEqual(MINIMO_FUGA);
  });

  it("no se alarma por una coincidencia casual corta", () => {
    const emitido =
      "Buenos días a todos; me duele deciros que el martes no habrá reunión del huerto.";
    expect(detectarFuga(emitido, personales)).toEqual([]);
  });

  it("no ve fugas donde no las hay ni con la memoria personal vacía", () => {
    expect(detectarFuga("Compartimos el manifiesto abierto de la red StarSeed.", personales)).toEqual([]);
    expect(detectarFuga("cualquier cosa suficientemente larga para pasar el mínimo", [])).toEqual([]);
  });
});
