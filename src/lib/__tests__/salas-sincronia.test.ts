/**
 * Tests de la fusión de salas sincronizables (Ola 307 · 2026-09-09 · zN5).
 * Módulo PURO: nada de red, disco ni relojes, así que aquí no hace falta
 * parchear nada (en este repositorio vitest corre con `globals: false`).
 */
import { describe, it, expect } from "vitest";
import {
  LIMITE_ELEMENTOS,
  excedeLimite,
  fusionarEstados,
  prioridadDeElemento,
  resumirDivergencia,
  type ElementoSala,
  type EstadoSala,
} from "../salas/sincronia-sala";

const T = 1_757_000_000_000; // instante de referencia de las pruebas

function el(
  id: string,
  porDispositivo: string,
  actualizadoEn: number,
  extra: Partial<ElementoSala> = {},
): ElementoSala {
  return { id, tipo: "nota", datos: { texto: `${id}@${porDispositivo}` }, actualizadoEn, porDispositivo, ...extra };
}

function sala(elementos: ElementoSala[], reloj = 1, salaId = "sala-agora"): EstadoSala {
  const mapa: Record<string, ElementoSala> = {};
  for (const e of elementos) mapa[e.id] = e;
  return { salaId, elementos: mapa, reloj };
}

describe("fusionarEstados · determinismo", () => {
  it("con el mismo actualizadoEn fusiona igual en los dos sentidos", () => {
    const a = sala([el("w1", "movil-ana", T), el("solo-a", "movil-ana", T + 5)], 7);
    const b = sala([el("w1", "portatil-bruno", T), el("solo-b", "portatil-bruno", T + 3)], 9);

    const ab = fusionarEstados(a, b, "tablet-observadora");
    const ba = fusionarEstados(b, a, "tablet-observadora");

    expect(ab.resultado.elementos).toEqual(ba.resultado.elementos);
    expect(ab.conflictos).toEqual(ba.conflictos);
    // El desempate alfabético: «movil-ana» < «portatil-bruno».
    expect(ab.resultado.elementos.w1.porDispositivo).toBe("movil-ana");
    expect(ab.conflictos).toEqual(["w1"]);
    expect(ab.resultado.reloj).toBe(9);
  });

  it("gana siempre el actualizadoEn mayor, venga de donde venga", () => {
    const viejo = sala([el("w1", "aaa-dispositivo", T)]);
    const nuevo = sala([el("w1", "zzz-dispositivo", T + 1000)]);
    expect(fusionarEstados(viejo, nuevo, "otro").resultado.elementos.w1.porDispositivo).toBe("zzz-dispositivo");
    expect(fusionarEstados(nuevo, viejo, "otro").resultado.elementos.w1.porDispositivo).toBe("zzz-dispositivo");
  });
});

describe("fusionarEstados · lápidas", () => {
  it("el borrado más nuevo gana y la lápida se queda en el mapa", () => {
    const conNota = sala([el("n1", "movil-ana", T)]);
    const borrada = sala([el("n1", "portatil-bruno", T + 10, { borrado: true })]);

    const { resultado } = fusionarEstados(conNota, borrada, "tablet-observadora");
    expect(resultado.elementos.n1.borrado).toBe(true);
    // LÁPIDA, no borrado físico: la clave sigue ahí.
    expect(Object.keys(resultado.elementos)).toContain("n1");
  });

  it("una edición más nueva resucita a propósito lo borrado antes", () => {
    const borrada = sala([el("n1", "movil-ana", T, { borrado: true })]);
    const reeditada = sala([el("n1", "portatil-bruno", T + 10)]);
    const { resultado } = fusionarEstados(borrada, reeditada, "tablet-observadora");
    expect(resultado.elementos.n1.borrado).toBeUndefined();
  });

  it("la lápida no se pierde al fusionar con quien nunca la vio (no revive)", () => {
    const borrada = sala([el("n1", "movil-ana", T + 10, { borrado: true })]);
    const ignorante = sala([el("n1", "portatil-bruno", T)]);
    const ida = fusionarEstados(borrada, ignorante, "tablet-observadora");
    const vuelta = fusionarEstados(ignorante, borrada, "tablet-observadora");
    expect(ida.resultado.elementos.n1.borrado).toBe(true);
    expect(vuelta.resultado.elementos.n1.borrado).toBe(true);
  });

  it("con todo empatado gana la lápida (mismo dispositivo, misma marca)", () => {
    const edicion = sala([el("n1", "movil-ana", T)]);
    const lapida = sala([el("n1", "movil-ana", T, { borrado: true })]);
    expect(fusionarEstados(edicion, lapida, "otro").resultado.elementos.n1.borrado).toBe(true);
    expect(fusionarEstados(lapida, edicion, "otro").resultado.elementos.n1.borrado).toBe(true);
  });
});

describe("fusionarEstados · anti-eco y salas distintas", () => {
  it("ignora lo que vuelve de rebote del propio dispositivo", () => {
    const local = sala([el("w1", "movil-ana", T)]);
    // El servidor nos devuelve nuestro propio cambio con marca posterior.
    const eco = sala([el("w1", "movil-ana", T + 5000, { datos: { texto: "eco" } })]);
    const { resultado, conflictos } = fusionarEstados(local, eco, "movil-ana");
    expect(resultado.elementos.w1.actualizadoEn).toBe(T);
    expect(conflictos).toEqual([]);
  });

  it("no mezcla dos salas distintas", () => {
    const a = sala([el("w1", "movil-ana", T)], 1, "sala-agora");
    const b = sala([el("w2", "portatil-bruno", T)], 1, "sala-taller");
    const { resultado, conflictos } = fusionarEstados(a, b, "movil-ana");
    expect(conflictos).toEqual(["sala-distinta"]);
    expect(Object.keys(resultado.elementos)).toEqual(["w1"]);
  });
});

describe("prioridadDeElemento · las cuatro prioridades", () => {
  it("P0: presencia y cursores (urgentes y desechables)", () => {
    expect(prioridadDeElemento(el("p", "d", T, { tipo: "presencia" }))).toBe(0);
    expect(prioridadDeElemento(el("c", "d", T, { tipo: "Cursor:ana" }))).toBe(0);
  });

  it("P1: el contenido creado, que nunca se puede perder", () => {
    expect(prioridadDeElemento(el("n", "d", T, { tipo: "nota" }))).toBe(1);
    expect(prioridadDeElemento(el("t", "d", T, { tipo: "trazo" }))).toBe(1);
    // Tipo desconocido: ante la duda, contenido.
    expect(prioridadDeElemento(el("x", "d", T, { tipo: "invento-nuevo" }))).toBe(1);
    // La lápida de contenido también es contenido: si se pierde, resucita.
    expect(prioridadDeElemento(el("y", "d", T, { tipo: "camara", borrado: true }))).toBe(1);
  });

  it("P2: estado de la escena (posiciones, cámara, apariencia)", () => {
    expect(prioridadDeElemento(el("s", "d", T, { tipo: "posicion" }))).toBe(2);
    expect(prioridadDeElemento(el("s2", "d", T, { tipo: "cámara" }))).toBe(2);
  });

  it("P3: lo masivo, solo bajo orden explícita", () => {
    expect(prioridadDeElemento(el("h", "d", T, { tipo: "historial" }))).toBe(3);
    expect(prioridadDeElemento(el("m", "d", T, { tipo: "modelo3d" }))).toBe(3);
  });
});

describe("excedeLimite", () => {
  function salaGrande(vivos: number, lapidas = 0): EstadoSala {
    const elementos: ElementoSala[] = [];
    for (let i = 0; i < vivos; i += 1) elementos.push(el(`v${i}`, "movil-ana", T));
    for (let i = 0; i < lapidas; i += 1) elementos.push(el(`l${i}`, "movil-ana", T, { borrado: true }));
    return sala(elementos);
  }

  it("aguanta justo el límite y avisa al pasarlo", () => {
    expect(excedeLimite(salaGrande(LIMITE_ELEMENTOS))).toBe(false);
    expect(excedeLimite(salaGrande(LIMITE_ELEMENTOS + 1))).toBe(true);
  });

  it("las lápidas no cuentan para el límite", () => {
    expect(excedeLimite(salaGrande(LIMITE_ELEMENTOS, 500))).toBe(false);
  });

  it("la fusión que rebasa el límite lo dice en vez de truncar a escondidas", () => {
    const mia = salaGrande(LIMITE_ELEMENTOS);
    const suya = sala([el("extra", "portatil-bruno", T)]);
    const { resultado, conflictos } = fusionarEstados(mia, suya, "movil-ana");
    expect(conflictos).toContain("limite-excedido");
    expect(resultado.elementos.extra).toBeDefined(); // nada se tira sin avisar
  });
});

describe("resumirDivergencia · aviso honesto", () => {
  const CUATRO_MIN = 4 * 60 * 1000;

  it("cuenta los cambios pendientes y desde cuándo", () => {
    const comun = el("w0", "portatil-bruno", T + CUATRO_MIN);
    const mios: ElementoSala[] = [comun];
    for (let i = 0; i < 12; i += 1) mios.push(el(`n${i}`, "movil-ana", T));
    const frase = resumirDivergencia(sala(mios), sala([comun]));
    expect(frase).toBe("Llevas 12 cambios sin sincronizar desde hace 4 minutos.");
  });

  it("usa el singular con un solo cambio", () => {
    const comun = el("w0", "portatil-bruno", T + CUATRO_MIN);
    const frase = resumirDivergencia(sala([comun, el("n1", "movil-ana", T)]), sala([comun]));
    expect(frase).toContain("Llevas 1 cambio sin sincronizar");
  });

  it("dice que todo está sincronizado cuando lo está", () => {
    const misma = sala([el("w0", "movil-ana", T)]);
    expect(resumirDivergencia(misma, sala([el("w0", "movil-ana", T)]))).toBe(
      "Todo sincronizado: no tienes cambios pendientes en esta sala.",
    );
  });

  it("avisa también de lo que falta por recibir", () => {
    const frase = resumirDivergencia(sala([]), sala([el("n1", "portatil-bruno", T)]));
    expect(frase).toBe("Lo tuyo está sincronizado. Además hay 1 cambio de otras personas por recibir.");
  });

  it("no cuenta los efímeros: presencia y cursores son desechables", () => {
    const mios = sala([el("cur", "movil-ana", T, { tipo: "cursor" })]);
    expect(resumirDivergencia(mios, sala([]))).toBe("Todo sincronizado: no tienes cambios pendientes en esta sala.");
  });

  it("no compara dos salas distintas", () => {
    const a = sala([], 1, "sala-agora");
    const b = sala([], 1, "sala-taller");
    expect(resumirDivergencia(a, b)).toContain("no son la misma");
  });
});
