import { describe, expect, it } from "vitest";
import {
  CLAVE_CAPAS_AMBITO,
  leerPerfilCapasAmbito,
  puedeCambiar,
  referenciaCapasAmbito,
  resolverAmbito,
  type CadenaCapasAmbito,
  type TipoAmbitoCapas,
} from "../ambito";

const cadena: CadenaCapasAmbito = {
  cuenta: {
    capasPreferidas: { local: false, nube: false },
    coleccionMemoria: "cuenta",
    aprende: false,
    comparteCon: "nadie",
  },
  ambito: {
    capasPreferidas: { local: true },
    coleccionMemoria: "grupo",
    aprende: true,
    comparteCon: "ambito",
  },
  personalidad: {
    capasPreferidas: { nube: true },
    coleccionMemoria: "personalidad",
  },
  agente: {
    capasPreferidas: { nube: false },
    adaptador: "adaptador-agente",
  },
};

describe("resolverAmbito", () => {
  it("respeta agente > personalidad > ámbito > cuenta", () => {
    const perfil = resolverAmbito(cadena);
    expect(perfil.capasPreferidas.local).toBe(true);
    expect(perfil.capasPreferidas.nube).toBe(false);
    expect(perfil.coleccionMemoria).toBe("personalidad");
    expect(perfil.adaptador).toBe("adaptador-agente");
    expect(perfil.aprende).toBe(true);
    expect(perfil.comparteCon).toBe("ambito");
  });

  it("normaliza valores de entity_state y conserva valores seguros", () => {
    expect(leerPerfilCapasAmbito({
      capasPreferidas: { mesh: false, nube: "no" },
      coleccionMemoria: "recuerdos",
      aprende: true,
      comparteCon: "red",
    })).toMatchObject({
      capasPreferidas: { mesh: false, nube: true },
      coleccionMemoria: "recuerdos",
      aprende: true,
      comparteCon: "red",
    });
    expect(CLAVE_CAPAS_AMBITO).toBe("astraura:capas-ambito");
  });
});

describe("puedeCambiar", () => {
  it("permite al administrador en gobierno jerárquico", () => {
    expect(puedeCambiar(
      { id: "ana", rol: "admin" },
      { tipo: "grupo", id: "huerto" },
      "jerarquico",
    )).toBe("permitido");
  });

  it("envía a votación el cambio administrativo democrático", () => {
    expect(puedeCambiar(
      { id: "ana", rol: "owner" },
      { tipo: "comunidad", id: "sur" },
      "democratico",
    )).toBe("requiere_votacion");
  });

  it("deja a cualquiera apagar su aprendizaje propio", () => {
    expect(puedeCambiar(
      { id: "ana", rol: "member" },
      { tipo: "personal", id: "ana", accion: "apagar_aprendizaje_propio" },
      "democratico",
    )).toBe("permitido");
  });

  it("deniega los demás cambios a quien no administra", () => {
    expect(puedeCambiar(
      { id: "ana", rol: "member" },
      { tipo: "grupo", id: "huerto" },
      "jerarquico",
    )).toBe("denegado");
  });
});

describe("referenciaCapasAmbito", () => {
  it("cubre los nueve tipos canónicos y la cuenta", () => {
    const tipos: TipoAmbitoCapas[] = [
      "personal", "comunidad", "ef", "partido", "asamblea",
      "grupo", "evento", "pagina", "proyecto", "cuenta",
    ];
    expect(tipos.map((tipo) => referenciaCapasAmbito(tipo, "id").kind)).toEqual([
      "profile", "community", "ef", "party", "group",
      "group", "event", "page", "group", "user",
    ]);
  });
});
