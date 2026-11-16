import { describe, it, expect } from "vitest";
import {
  tipoLibreta,
  puedeLeer,
  puedeSalir,
  soloPublicoParaAdaptador,
  type AmbitoLibreta,
  type Ejemplo,
} from "../ambito-libreta";

const ejemplo = (overrides: Partial<Ejemplo> = {}): Ejemplo => ({
  id: "e1",
  ambito: "personal",
  privado: false,
  contenido: "Ejemplo de test",
  ...overrides,
});

describe("puedeLeer", () => {
  it("personal: cualquier usuario puede leer", () => {
    expect(puedeLeer("personal", "usuario-1")).toBe(true);
    expect(puedeLeer("personal", "usuario-2")).toBe(true);
    expect(puedeLeer("personal", "anonimo")).toBe(true);
  });

  it("pagina: solo con permiso de la pagina", () => {
    expect(puedeLeer("pagina", "usuario-1")).toBe(false);
    expect(puedeLeer("pagina", "miembro")).toBe(false);
    expect(puedeLeer("pagina", "cualquiera")).toBe(false);
  });

  it("grupo: solo con permiso del grupo", () => {
    expect(puedeLeer("grupo", "usuario-1")).toBe(false);
    expect(puedeLeer("grupo", "miembro")).toBe(false);
    expect(puedeLeer("grupo", "cualquiera")).toBe(false);
  });

  it("colectivo: acceso abierto pero sin datos privados", () => {
    expect(puedeLeer("colectivo", "usuario-1")).toBe(false);
    expect(puedeLeer("colectivo", "cualquiera")).toBe(false);
  });

  it("fabrica: solo el director puede leer (fuera del repo)", () => {
    expect(puedeLeer("fabrica", "director")).toBe(false);
    expect(puedeLeer("fabrica", "usuario-1")).toBe(false);
  });
});

describe("puedeSalir · personal", () => {
  it("solo sale con elección explícita de la persona", () => {
    const e = ejemplo({ ambito: "personal", privado: true });
    expect(puedeSalir("personal", e, undefined)).toBe(false);
    expect(puedeSalir("personal", e, "no")).toBe(false);
    expect(puedeSalir("personal", e, "si")).toBe(true);
  });
});

describe("puedeSalir · pagina", () => {
  it("solo sale si la entidad lo aprobó", () => {
    const e = ejemplo({ ambito: "pagina", privado: false });
    expect(puedeSalir("pagina", e)).toBe(false);
    
    const aprobado = ejemplo({ ambito: "pagina", privado: false, aprobadoPorEntidad: true });
    expect(puedeSalir("pagina", aprobado)).toBe(true);
  });
});

describe("puedeSalir · grupo", () => {
  it("solo sale si la entidad lo aprobó", () => {
    const e = ejemplo({ ambito: "grupo", privado: false });
    expect(puedeSalir("grupo", e)).toBe(false);
    
    const aprobado = ejemplo({ ambito: "grupo", privado: false, aprobadoPorEntidad: true });
    expect(puedeSalir("grupo", aprobado)).toBe(true);
  });
});

describe("puedeSalir · colectivo", () => {
  it("admite ejemplos públicos", () => {
    const publico = ejemplo({ ambito: "colectivo", privado: false });
    expect(puedeSalir("colectivo", publico)).toBe(true);
  });

  it("no admite ejemplos privados", () => {
    const privado = ejemplo({ ambito: "colectivo", privado: true });
    expect(puedeSalir("colectivo", privado)).toBe(false);
  });
});

describe("puedeSalir · fabrica", () => {
  it("nunca sale al repo", () => {
    const e = ejemplo({ ambito: "fabrica", privado: false });
    expect(puedeSalir("fabrica", e)).toBe(false);
  });
});

describe("soloPublicoParaAdaptador", () => {
  it("pagina: adaptador no puede haber visto ejemplos personales", () => {
    const ejemplos = [
      ejemplo({ ambito: "pagina", privado: false, aprobadoPorEntidad: false }),
    ];
    expect(soloPublicoParaAdaptador(ejemplos, "pagina")).toBe(true);
  });

  it("pagina: si hay ejemplos sin aprobar, no es válido", () => {
    const ejemplos = [
      ejemplo({ ambito: "pagina", privado: false, aprobadoPorEntidad: true }),
    ];
    expect(soloPublicoParaAdaptador(ejemplos, "pagina")).toBe(false);
  });

  it("colectivo: todos deben ser públicos", () => {
    const publicos = [
      ejemplo({ ambito: "colectivo", privado: false }),
      ejemplo({ ambito: "colectivo", privado: false }),
    ];
    expect(soloPublicoParaAdaptador(publicos, "colectivo")).toBe(true);
  });

  it("colectivo: ningún privado", () => {
    const mezcla = [
      ejemplo({ ambito: "colectivo", privado: false }),
      ejemplo({ ambito: "colectivo", privado: true }),
    ];
    expect(soloPublicoParaAdaptador(mezcla, "colectivo")).toBe(false);
  });
});