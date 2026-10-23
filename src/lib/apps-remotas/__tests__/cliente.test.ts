import { describe, it, expect } from "vitest";
import {
  ENTRADAS_POR_SEGUNDO,
  crearCliente,
  mapearEntrada,
  type EventoVideo,
  type MensajeVentana,
  type RectVideo,
  type TamanoRemoto,
} from "../cliente";

// Rect de un vídeo 16:9 de 640×360 con margen 10/20, y ventana remota de 1280×720.
const RC: RectVideo = { left: 10, top: 20, width: 640, height: 360 };
const RT: TamanoRemoto = { ancho: 1280, alto: 720 };
const R4: RectVideo = { left: 0, top: 0, width: 640, height: 480 }; // 4:3 contra un remoto 16:9

describe("mapearEntrada", () => {
  it("mapea las coordenadas del vídeo a la ventana remota", () => {
    expect(mapearEntrada({ tipo: "raton", accion: "mover", x: 170, y: 380 }, RC, RT))
      .toEqual({ tipo: "raton", accion: "mover", x: 320, y: 720 });
  });
  it("corrige las bandas negras del contain (4:3 → 16:9)", () => {
    expect(mapearEntrada({ tipo: "raton", accion: "mover", x: 320, y: 240 }, R4, RT))
      .toMatchObject({ x: 640, y: 360 });
  });
  it("recorta lo que cae en la banda negra al borde remoto", () => {
    // y=30 está por encima de «desdeY» 60: toca el techo del remoto, no se hace negativo.
    expect(mapearEntrada({ tipo: "tacto", accion: "mover", x: 200, y: 30 }, R4, RT))
      .toEqual({ tipo: "tacto", accion: "mover", x: 400, y: 0 });
  });
  it("recorta al tamaño remoto lo que sale del rect", () => {
    expect(mapearEntrada({ tipo: "raton", accion: "mover", x: 9999, y: 9999 }, RC, RT))
      .toMatchObject({ x: 1280, y: 720 });
    expect(mapearEntrada({ tipo: "raton", accion: "mover", x: -50, y: -50 }, RC, RT))
      .toMatchObject({ x: 0, y: 0 });
  });
  it("conserva el delta de la rueda y mapea su punto", () => {
    expect(mapearEntrada({ tipo: "rueda", x: 170, y: 380, deltaY: -120 }, RC, RT))
      .toEqual({ tipo: "rueda", accion: "rueda", x: 320, y: 720, deltaY: -120 });
  });
  it("pasa el teclado tal cual, con sus modificadores", () => {
    expect(mapearEntrada({ tipo: "teclado", accion: "pulsar", tecla: "KeyA", modificadores: { ctrl: true } }, RC, RT))
      .toEqual({ tipo: "teclado", accion: "pulsar", tecla: "KeyA", modificadores: { ctrl: true } });
  });
  it("el ratón pulsado lleva qué botón", () => {
    expect(mapearEntrada({ tipo: "raton", accion: "pulsar", x: 170, y: 380, boton: 2 }, RC, RT))
      .toMatchObject({ accion: "pulsar", boton: 2 });
  });
  it("devuelve null sin medida (rect vacío o tamaño 0): nunca inventa", () => {
    expect(mapearEntrada({ tipo: "raton", accion: "mover", x: 1, y: 1 }, RC, { ancho: 0, alto: 0 })).toBeNull();
    expect(mapearEntrada({ tipo: "raton", accion: "mover", x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 480 }, RT)).toBeNull();
  });
});

describe("crearCliente — el límite de frecuencia", () => {
  function montar(extra: { porSegundo?: number } = {}) {
    const mens: MensajeVentana[] = [];
    const enviar = (m: MensajeVentana) => { mens.push(m); };
    return { mens, cliente: crearCliente({ enviar, sesionId: "s1", ...extra }) };
  }
  const mover = (x: number, y: number): EventoVideo => ({ tipo: "raton", accion: "mover", x, y });
  const teclado = (): EventoVideo => ({ tipo: "teclado", accion: "pulsar", tecla: "KeyA" });

  it("gotea las continuas al tope: la 1.ª pasa, la inmediata se recorta", () => {
    const { mens, cliente } = montar({ porSegundo: 10 }); // mínimo 100 ms
    expect(cliente.entrar(mover(0, 0), RC, RT, 0)).toBe(true);
    expect(cliente.entrar(mover(1, 1), RC, RT, 50)).toBe(false);
    expect(cliente.entrar(mover(2, 2), RC, RT, 100)).toBe(true);
    expect(mens).toHaveLength(2);
    expect(cliente.detalle()).toEqual({ enviadas: 2, descartadas: 1 });
  });
  it("el tope por defecto es 60 entradas por segundo (intervalo de 17 ms)", () => {
    const { cliente } = montar();
    expect(ENTRADAS_POR_SEGUNDO).toBe(60);
    expect(cliente.entrar(mover(0, 0), RC, RT, 0)).toBe(true);
    expect(cliente.entrar(mover(1, 1), RC, RT, 16)).toBe(false);
    expect(cliente.entrar(mover(1, 1), RC, RT, 17)).toBe(true);
  });
  it("las pulsaciones de teclado NO se gotean: ninguna se pierde", () => {
    const { mens, cliente } = montar({ porSegundo: 1 });
    expect(cliente.entrar(teclado(), RC, RT, 0)).toBe(true);
    expect(cliente.entrar(teclado(), RC, RT, 0)).toBe(true);
    expect(mens).toHaveLength(2);
  });
  it("manda el sobre con el id de sesión y la entrada mapeada", () => {
    const { mens, cliente } = montar();
    cliente.entrar(mover(170, 380), RC, RT, 0);
    expect(mens[0]).toEqual({ t: "ventana.entrada", sesion: "s1", entrada: { tipo: "raton", accion: "mover", x: 320, y: 720 } });
  });
  it("sin medida no manda nada y lo cuenta como descartada", () => {
    const { mens, cliente } = montar();
    expect(cliente.entrar(mover(0, 0), RC, { ancho: 0, alto: 0 }, 0)).toBe(false);
    expect(mens).toHaveLength(0);
    expect(cliente.detalle()).toEqual({ enviadas: 0, descartadas: 1 });
  });
});
