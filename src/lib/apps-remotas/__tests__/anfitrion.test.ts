import { describe, it, expect } from "vitest";
import { crearSesion, revocar, type Sesion } from "../../recursos/sesion-prestamo";
import { ajustarCalidad, crearAnfitrion, type DepsAnfitrion, type OrdenVentana, type PistaAnfitriona } from "../anfitrion";

const INICIO = 1_000;
function montar(extra: Partial<DepsAnfitrion> = {}) {
  let ahora = INICIO, banda = Number.POSITIVE_INFINITY;
  let actual: Sesion = crearSesion(
    { anfitrion: "ana", invitado: "bea", alcance: { tipo: "app", id: "editor" }, duracionMs: 60_000, ahora },
    () => "s1"
  );
  const ordenes: OrdenVentana[] = [], dibujos: { ancho: number; alto: number }[] = [];
  const pistas: (PistaAnfitriona & { parada: boolean })[] = [];
  const base: DepsAnfitrion = {
    ventana: "v1",
    capturar: (orden) => { ordenes.push(orden); return orden.comando === "capturar_ventana" ? { ancho: 640, alto: 360, datos: "falso" } : { aceptada: true }; },
    dibujar: (_fotograma, calidad) => { dibujos.push({ ancho: calidad.ancho, alto: calidad.alto }); },
    crearPista: () => { const pista = { parada: false, stop() { pista.parada = true; } }; pistas.push(pista); return pista; },
    sesion: () => actual, fps: 30, anchoMax: 1280, reloj: () => ahora, medirAnchoBanda: () => banda,
  };
  return {
    deps: { ...base, ...extra } as DepsAnfitrion, ordenes, dibujos, pistas,
    avanzar: (ms: number) => { ahora += ms; }, setBanda: (n: number) => { banda = n; }, revocar: () => { actual = revocar(actual); },
  };
}
describe("ajustarCalidad", () => {
  it("con ancho de banda sin medir usa el máximo", () => {
    expect(ajustarCalidad(Number.POSITIVE_INFINITY, { fps: 30, anchoMax: 1280, altoMax: 720 }))
      .toEqual({ ancho: 1280, alto: 720, fps: 30 });
  });
  it("baja los fotogramas cuando el enlace se estrecha", () => {
    expect(ajustarCalidad(1_000_000, { fps: 30, anchoMax: 1280, altoMax: 720 }))
      .toEqual({ ancho: 1280, alto: 720, fps: 18 });
  });
  it("reduce también el ancho al mínimo con un enlace muy pobre", () => {
    const c = ajustarCalidad(200_000, { fps: 30, anchoMax: 1280, altoMax: 720 });
    expect(c.fps).toBe(10);
    expect(c.ancho).toBeLessThan(1280);
    expect(c.alto).toBeLessThan(720);
    expect(c.ancho).toBeGreaterThanOrEqual(160);
  });
  it("nunca devuelve cero píxeles ni cero fotogramas", () => {
    expect(ajustarCalidad(0, { fps: 30, anchoMax: 1280, altoMax: 720 })).toEqual({ ancho: 160, alto: 90, fps: 10 });
  });
});

describe("crearAnfitrion", () => {
  it("arranca con el máximo, expone la pista y muestra el aviso visible", () => {
    const m = montar(), a = crearAnfitrion(m.deps);
    const estado = a.arrancar(INICIO);
    expect(estado.transmitiendo).toBe(true);
    expect(estado.calidad).toEqual({ ancho: 1280, alto: 720, fps: 30 });
    expect(a.pista()).toBe(m.pistas[0]);
    expect(estado.aviso).toMatchObject({ invitado: "bea", recursoId: "editor" });
    expect(estado.aviso?.texto).toContain("bea está usando editor");
  });
  it("pide fotogramas con capturar_ventana, los dibuja y cuenta cada cuadro", async () => {
    const m = montar(), a = crearAnfitrion(m.deps);
    a.arrancar(INICIO);
    expect(await a.paso(INICIO)).toBe(true);
    expect(m.ordenes[0]).toEqual({ comando: "capturar_ventana", ventana: "v1", ancho: 1280, alto: 720, fps: 30 });
    expect(m.dibujos).toEqual([{ ancho: 1280, alto: 720 }]);
    expect(await a.paso(INICIO + 10)).toBe(true);
    expect(a.estado(INICIO + 10).cuadros).toBe(2);
  });
  it("adapta fps y ancho al ancho de banda medido y renueva la pista", async () => {
    const m = montar(), a = crearAnfitrion(m.deps);
    a.arrancar(INICIO);
    m.setBanda(200_000);
    expect(await a.paso(INICIO + 2_001)).toBe(true);
    expect(m.pistas).toHaveLength(2);
    expect(m.pistas[0].parada).toBe(true);
    expect(a.estado(INICIO + 2_001).calidad.fps).toBe(10);
    expect(a.estado(INICIO + 2_001).calidad.ancho).toBeLessThan(1280);
  });
  it("reenvía entradas solo con sesión válida y se para al revocarla", async () => {
    const m = montar(), a = crearAnfitrion(m.deps);
    a.arrancar(INICIO);
    const tecla = { tipo: "teclado" as const, accion: "pulsar", tecla: "a" };
    expect(await a.entrada(tecla, INICIO)).toBe(true);
    expect(m.ordenes.at(-1)).toEqual({ comando: "entrada_ventana", ventana: "v1", entrada: tecla });
    m.revocar();
    expect(await a.entrada({ tipo: "raton", accion: "mover", x: 1, y: 2 }, INICIO + 1)).toBe(false);
    expect(m.ordenes).toHaveLength(1);
    expect(m.pistas[0].parada).toBe(true);
    expect(a.pista()).toBeNull();
    expect(a.estado(INICIO + 1).aviso).toBeNull();
  });
  it("se para sola cuando la sesión vence", async () => {
    const m = montar(), a = crearAnfitrion(m.deps);
    a.arrancar(INICIO);
    m.avanzar(60_001);
    expect(await a.paso(INICIO + 60_001)).toBe(false);
    expect(m.pistas[0].parada).toBe(true);
    expect(a.estado(INICIO + 60_001).transmitiendo).toBe(false);
  });
  it("no arranca ni crea pista con una sesión ya revocada", () => {
    const m = montar();
    m.revocar();
    const a = crearAnfitrion(m.deps);
    expect(a.arrancar(INICIO).transmitiendo).toBe(false);
    expect(a.pista()).toBeNull();
    expect(m.pistas).toHaveLength(0);
  });
  it("parar es idempotente y corta los pasos siguientes", async () => {
    const m = montar(), a = crearAnfitrion(m.deps);
    a.arrancar(INICIO);
    a.parar();
    a.parar();
    expect(m.pistas[0].parada).toBe(true);
    expect(await a.paso(INICIO)).toBe(false);
  });
  it("no dibuja si la captura no devuelve un fotograma", async () => {
    const m = montar({ capturar: () => null });
    const a = crearAnfitrion(m.deps);
    a.arrancar(INICIO);
    expect(await a.paso(INICIO)).toBe(false);
    expect(m.dibujos).toHaveLength(0);
  });
});
