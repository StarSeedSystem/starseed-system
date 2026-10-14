import { describe, it, expect } from "vitest";
import {
  NeuronaCandidata,
  elegirCanaria,
  ResultadoHumo,
  evaluarHumo,
  EstadoDespliegue,
  EventoDespliegue,
  siguienteEstado,
} from "../canario";

describe("elegirCanaria", () => {
  it("devuelve el id de la candidata marcada como elegida y online", () => {
    const candidatas: NeuronaCandidata[] = [
      { id: "A", online: true, usoReciente: 5, elegida: true },
      { id: "B", online: true, usoReciente: 10, elegida: false },
    ];
    expect(elegirCanaria(candidatas)).toBe("A");
  });

  it("ignora la candidata elegida si está offline y elige la online con mayor usoReciente", () => {
    const candidatas: NeuronaCandidata[] = [
      { id: "A", online: false, usoReciente: 20, elegida: true },
      { id: "B", online: true, usoReciente: 15, elegida: false },
      { id: "C", online: true, usoReciente: 10, elegida: false },
    ];
    expect(elegirCanaria(candidatas)).toBe("B");
  });

   it("elige la candidata online con mayor usoReciente cuando no hay elegida", () => {
    const candidatas: NeuronaCandidata[] = [
      { id: "A", online: true, usoReciente: 5 },
      { id: "B", online: true, usoReciente: 10 },
      { id: "C", online: true, usoReciente: 3 },
    ];
    expect(elegirCanaria(candidatas)).toBe("B");
  });

  it("en caso de empate en usoReciente, elige la candidata con el id menor", () => {
    const candidatas: NeuronaCandidata[] = [
      { id: "B", online: true, usoReciente: 5 },
      { id: "A", online: true, usoReciente: 5 },
      { id: "C", online: true, usoReciente: 3 },
    ];
    expect(elegirCanaria(candidatas)).toBe("A");
  });

  it("devuelve null cuando ninguna candidata está online", () => {
    const candidatas: NeuronaCandidata[] = [
      { id: "A", online: false, usoReciente: 5 },
      { id: "B", online: false, usoReciente: 10 },
    ];
    expect(elegirCanaria(candidatas)).toBeNull();
  });

  it("devuelve null cuando el array está vacío", () => {
    const candidatas: NeuronaCandidata[] = [];
    expect(elegirCanaria(candidatas)).toBeNull();
  });
});

describe("evaluarHumo", () => {
  it("retorna ok: true cuando la página carga y todos los servicios responden true", () => {
    const resultado: ResultadoHumo = {
      paginaCarga: true,
      servicios: { servicio1: true, servicio2: true },
    };
    expect(evaluarHumo(resultado)).toEqual({ ok: true, fallos: [] });
  });

  it("retorna ok: false y fallos con 'paginaCarga' cuando la página no carga", () => {
    const resultado: ResultadoHumo = {
      paginaCarga: false,
      servicios: { servicio1: true, servicio2: true },
    };
    expect(evaluarHumo(resultado)).toEqual({ ok: false, fallos: ["paginaCarga"] });
  });

  it("retorna ok: false y fallos con los nombres de los servicios que fallan", () => {
    const resultado: ResultadoHumo = {
      paginaCarga: true,
      servicios: { servicio1: true, servicio2: false, servicio3: false },
    };
    expect(evaluarHumo(resultado)).toEqual({
      ok: false,
      fallos: ["servicio2", "servicio3"],
    });
  });

  it("retorna ok: false y fallos con 'paginaCarga' y los servicios fallantes cuando ambos fallan", () => {
    const resultado: ResultadoHumo = {
      paginaCarga: false,
      servicios: { servicio1: false, servicio2: true },
    };
    expect(evaluarHumo(resultado)).toEqual({
      ok: false,
      fallos: ["paginaCarga", "servicio1"],
    });
  });

  it("maneja un objeto de servicios vacío", () => {
    const resultado: ResultadoHumo = {
      paginaCarga: true,
      servicios: {},
    };
    expect(evaluarHumo(resultado)).toEqual({ ok: true, fallos: [] });
  });
});

describe("siguienteEstado", () => {
  it("transición válida: pendiente + aplicada-en-canaria -> canaria", () => {
    const estado: EstadoDespliegue = "pendiente";
    const evento: EventoDespliegue = { tipo: "aplicada-en-canaria" };
    expect(siguienteEstado(estado, evento)).toBe("canaria");
  });

  it("transición válida: canaria + humo ok -> propagando", () => {
    const estado: EstadoDespliegue = "canaria";
    const evento: EventoDespliegue = { tipo: "humo", ok: true };
    expect(siguienteEstado(estado, evento)).toBe("propagando");
  });

  it("transición válida: canaria + humo no ok -> revirtiendo", () => {
    const estado: EstadoDespliegue = "canaria";
    const evento: EventoDespliegue = { tipo: "humo", ok: false };
    expect(siguienteEstado(estado, evento)).toBe("revirtiendo");
  });

  it("transición válida: propagando + propagada -> hecho", () => {
    const estado: EstadoDespliegue = "propagando";
    const evento: EventoDespliegue = { tipo: "propagada" };
    expect(siguienteEstado(estado, evento)).toBe("hecho");
  });

  it("transición válida: revirtiendo + revertida -> revertido", () => {
    const estado: EstadoDespliegue = "revirtiendo";
    const evento: EventoDespliegue = { tipo: "revertida" };
    expect(siguienteEstado(estado, evento)).toBe("revertido");
  });

  it("transición inválida: pendiente + humo (ok) -> pendiente", () => {
    const estado: EstadoDespliegue = "pendiente";
    const evento: EventoDespliegue = { tipo: "humo", ok: true };
    expect(siguienteEstado(estado, evento)).toBe("pendiente");
  });

  it("transición inválida: pendiente + propagada -> pendiente", () => {
    const estado: EstadoDespliegue = "pendiente";
    const evento: EventoDespliegue = { tipo: "propagada" };
    expect(siguienteEstado(estado, evento)).toBe("pendiente");
  });

  it("transición inválida: canaria + aplicada-en-canaria -> canaria", () => {
    const estado: EstadoDespliegue = "canaria";
    const evento: EventoDespliegue = { tipo: "aplicada-en-canaria" };
    expect(siguienteEstado(estado, evento)).toBe("canaria");
  });

  it("transición inválida: propagando + humo (ok) -> propagando", () => {
    const estado: EstadoDespliegue = "propagando";
    const evento: EventoDespliegue = { tipo: "humo", ok: true };
    expect(siguienteEstado(estado, evento)).toBe("propagando");
  });

  it("transición inválida: hecho + cualquier evento -> hecho", () => {
    const estado: EstadoDespliegue = "hecho";
    const evento: EventoDespliegue = { tipo: "aplicada-en-canaria" };
    expect(siguienteEstado(estado, evento)).toBe("hecho");
  });

  it("transición inválida: revirtiendo + aplicada-en-canaria -> revirtiendo", () => {
    const estado: EstadoDespliegue = "revirtiendo";
    const evento: EventoDespliegue = { tipo: "aplicada-en-canaria" };
    expect(siguienteEstado(estado, evento)).toBe("revirtiendo");
  });

  it("transición inválida: revertido + cualquier evento -> revertido", () => {
    const estado: EstadoDespliegue = "revertido";
    const evento: EventoDespliegue = { tipo: "humo", ok: true };
    expect(siguienteEstado(estado, evento)).toBe("revertido");
  });
});