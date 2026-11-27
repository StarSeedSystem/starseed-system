import { describe, it, expect } from "vitest";
import {
  BUSCAR_CAPA_MIN_MS,
  CENSO_MIN_MS,
  debeAnotarCenso,
  debeBuscarPorPar,
  lineaCenso,
  type EstadoCapaPar,
} from "../empuje-capa";

const base: EstadoCapaPar = {
  miCapa: "build-a",
  capaPar: "build-b",
  esAppDePrueba: true,
  ultimaBusquedaMs: null,
  ahoraMs: 1_000_000,
};

describe("debeBuscarPorPar", () => {
  it("no busca si esta app no es de prueba, aunque el par tenga otra capa", () => {
    expect(debeBuscarPorPar({ ...base, esAppDePrueba: false })).toBe(false);
  });

  it("no busca si el par no anuncia capa o anuncia la misma", () => {
    expect(debeBuscarPorPar({ ...base, capaPar: "" })).toBe(false);
    expect(debeBuscarPorPar({ ...base, capaPar: null })).toBe(false);
    expect(debeBuscarPorPar({ ...base, capaPar: "build-a" })).toBe(false);
  });

  it("busca si el par tiene otra capa y nunca se buscó", () => {
    expect(debeBuscarPorPar(base)).toBe(true);
  });

  it("respeta el suelo de 5 min entre búsquedas", () => {
    expect(debeBuscarPorPar({ ...base, ultimaBusquedaMs: base.ahoraMs - BUSCAR_CAPA_MIN_MS + 1 })).toBe(false);
    expect(debeBuscarPorPar({ ...base, ultimaBusquedaMs: base.ahoraMs - BUSCAR_CAPA_MIN_MS })).toBe(true);
  });

  it("con mi capa vacía, cualquier capa del par es distinta", () => {
    expect(debeBuscarPorPar({ ...base, miCapa: "", capaPar: "build-b" })).toBe(true);
  });
});

describe("lineaCenso", () => {
  it("usa el formato exacto del contrato con todos los datos", () => {
    expect(
      lineaCenso("Mac de Maggasukha", {
        rol: "aparato-de-prueba",
        medio: "mac",
        appVersion: "0.5.1-prueba.24",
        capaBuild: "abc123",
        ramLibreMb: 2048,
        discoLibreGb: 9.4,
        capas: ["needle@3", "bitnet@b1.58"],
      }),
    ).toBe(
      "censo neurona=MacdeMaggasukha rol=aparato-de-prueba plataforma=mac app=0.5.1-prueba.24 capa=abc123 mem=2048 disco=9.4 ia=needle@3,bitnet@b1.58",
    );
  });

  it("lo que no se mide queda en «-» y nunca inventa ceros", () => {
    expect(lineaCenso("tableta", { medio: "android", ramLibreMb: 0 })).toBe(
      "censo neurona=tableta rol=- plataforma=android app=- capa=- mem=- disco=- ia=-",
    );
  });

  it("quita espacios y descarta un rol desconocido", () => {
    expect(lineaCenso("  Mac  Book ", { rol: "otro" as never, medio: " mac " })).toContain(
      "censo neurona=MacBook rol=- plataforma=mac",
    );
  });

  it("el disco 0 medido sí se escribe; el ia vacío queda en «-»", () => {
    expect(lineaCenso("nodo", { medio: "linux", discoLibreGb: 0, capas: [] })).toBe(
      "censo neurona=nodo rol=- plataforma=linux app=- capa=- mem=- disco=0 ia=-",
    );
  });
});

describe("debeAnotarCenso", () => {
  const ahora = 10_000_000;

  it("con el diagnóstico apagado nunca escribe", () => {
    expect(debeAnotarCenso({ diagnosticoEncendido: false, capaAnterior: "a", capaNueva: "b", ahoraMs: ahora })).toBe(false);
  });

  it("escribe de inmediato al cambiar la capa, sin esperar los 60 s", () => {
    expect(
      debeAnotarCenso({ diagnosticoEncendido: true, capaAnterior: "a", capaNueva: "b", ultimaMs: ahora - 1_000, ahoraMs: ahora }),
    ).toBe(true);
  });

  it("con la misma capa espera el latido de 60 s", () => {
    expect(
      debeAnotarCenso({ diagnosticoEncendido: true, capaAnterior: "a", capaNueva: "a", ultimaMs: ahora - CENSO_MIN_MS + 1, ahoraMs: ahora }),
    ).toBe(false);
    expect(
      debeAnotarCenso({ diagnosticoEncendido: true, capaAnterior: "a", capaNueva: "a", ultimaMs: ahora - CENSO_MIN_MS, ahoraMs: ahora }),
    ).toBe(true);
  });

  it("sin censo previo escribe la primera línea", () => {
    expect(debeAnotarCenso({ diagnosticoEncendido: true, capaAnterior: null, capaNueva: "a", ultimaMs: null, ahoraMs: ahora })).toBe(true);
  });
});
