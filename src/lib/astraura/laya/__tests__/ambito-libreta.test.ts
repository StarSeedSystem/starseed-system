// Pruebas del módulo de reglas de ámbito de la libreta (JLA1116A).
// Sin red, sin disco, sin reloj. Cubre la tabla §5 de architecture/jev-entrena-laya.md.

import { describe, it, expect } from "vitest";
import {
  AmbitoLibreta,
  EjemploLibreta,
  puedeLeer,
  puedeSalir,
  soloPublicoParaAdaptador,
  textoPorDefecto,
} from "../ambito-libreta";

const ejemploPersonal: EjemploLibreta = {
  contenido: "Mi diario privado",
  ambito: "personal",
  hayDesenlace: true,
  id: "ej1",
};

const ejemploPagina: EjemploLibreta = {
  contenido: "Publicación de la página",
  ambito: "pagina",
  hayDesenlace: true,
  id: "ej2",
};

const ejemploGrupo: EjemploLibreta = {
  contenido: "Discusión de grupo",
  ambito: "grupo",
  hayDesenlace: true,
  id: "ej3",
};

const ejemploColectivo: EjemploLibreta = {
  contenido: "Decisión pública colectiva",
  ambito: "colectivo",
  hayDesenlace: true,
  id: "ej4",
};

describe("AmbitoLibreta", () => {
  it("define los 5 ámbitos válidos", () => {
    const válidos: AmbitoLibreta[] = ["personal", "pagina", "grupo", "colectivo", "fabrica"];
    expect(válidos.length).toBe(5);
  });
});

describe("puedeLeer", () => {
  it("personal solo lectura propia", () => {
    expect(puedeLeer("personal", "propiaPersona")).toBe(true);
    expect(puedeLeer("personal", "otraPersona")).toBe(false);
  });

  it("página y grupo lectura general", () => {
    expect(puedeLeer("pagina", "cualquiera")).toBe(true);
    expect(puedeLeer("grupo", "cualquiera")).toBe(true);
  });

  it("colectivo lectura abierta", () => {
    expect(puedeLeer("colectivo", "cualquiera")).toBe(true);
  });

  it("fabrica solo alex", () => {
    expect(puedeLeer("fabrica", "alex")).toBe(true);
    expect(puedeLeer("fabrica", "cualquiera")).toBe(false);
  });
});

describe("puedeSalir", () => {
  it("personal solo sale con elección explícita", () => {
    expect(puedeSalir("personal", ejemploPersonal, "")).toBe(false);
    expect(puedeSalir("personal", ejemploPersonal, "ver")).toBe(true);
    expect(puedeSalir("personal", ejemploPersonal, "compartir")).toBe(true);
  });

  it("página sale si hay desenlace", () => {
    expect(puedeSalir("pagina", ejemploPagina, undefined)).toBe(true);
    // sin desenlace: depende, pero por defecto probamos con hayDesenlace=true
  });

  it("grupo sale si hay desenlace", () => {
    expect(puedeSalir("grupo", ejemploGrupo, undefined)).toBe(true);
  });

  it("colectivo solo ejemplos públicos (sin privados)", () => {
    const ejemploPub: EjemploLibreta = {
      contenido: "Decisión pública sobre menú",
      ambito: "colectivo",
      hayDesenlace: true,
      id: "ej5",
    };
    expect(puedeSalir("colectivo", ejemploPub, undefined)).toBe(true);
  });

  it("colectivo con contenido privado no sale", () => {
    const ejemploPriv: EjemploLibreta = {
      contenido: "Mi correo es alex@test.com y saludo al psicólogo",
      ambito: "colectivo",
      hayDesenlace: true,
      id: "ej6",
    };
    expect(puedeSalir("colectivo", ejemploPriv, undefined)).toBe(false);
  });

  it("fabrica nunca sale al repo", () => {
    expect(puedeSalir("fabrica", ejemploPersonal, undefined)).toBe(false);
    expect(puedeSalir("fabrica", ejemploColectivo, undefined)).toBe(false);
  });
});

describe("soloPublicoParaAdaptador", () => {
  it("adapter de página/colectivo no puede haber visto ejemplos personales", () => {
    const conPersonal: EjemploLibreta = {
      contenido: "Diario personal",
      ambito: "personal",
      hayDesenlace: true,
      id: "ej7",
    };

    expect(soloPublicoParaAdaptador([conPersonal], "pagina")).toBe(false);
    expect(soloPublicoParaAdaptador([conPersonal], "colectivo")).toBe(false);
  });

  it("adapter de página sin ejemplos personales es válido", () => {
    expect(soloPublicoParaAdaptador([], "pagina")).toBe(true);
    expect(soloPublicoParaAdaptador([], "colectivo")).toBe(true);
  });

  it("adapter colectivo con solo ejemplos públicos", () => {
    expect(soloPublicoParaAdaptador([{ ...ejemploColectivo, ambito: "colectivo" }], "colectivo")).toBe(true);
  });
});

describe("textoPorDefecto", () => {
  it("devuelve el texto por defecto por ámbito", () => {
    expect(textoPorDefecto("personal")).toBe("no sale (personal, requiere elección)");
    expect(textoPorDefecto("pagina")).toBe("sale solo si la entidad lo aprobó");
    expect(textoPorDefecto("grupo")).toBe("sale solo si la entidad lo aprobó");
    expect(textoPorDefecto("colectivo")).toBe("sale sin texto privado");
    expect(textoPorDefecto("fabrica")).toBe("no sale al repo");
  });
});