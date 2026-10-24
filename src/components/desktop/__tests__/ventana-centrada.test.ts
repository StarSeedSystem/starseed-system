import { describe, it, expect } from "vitest";
import { geometriaAperturaVentana } from "@/components/desktop/desktop-store";

describe("geometriaAperturaVentana · ventanas centradas del Escritorio", () => {
  it("abre centrada cuando no hay posición guardada", () => {
    const abierta = geometriaAperturaVentana(
      { ancho: 1920, alto: 1080 },
      { ancho: 720, alto: 520 },
    );
    expect(abierta.w).toBe(720);
    expect(abierta.h).toBe(520);
    expect(abierta.x).toBe((1920 - 720) / 2);
    expect(abierta.y).toBe((1080 - 520) / 2);
    expect(abierta.recolocada).toBe(false);
  });

  it("respeta el margen de 16 px en teléfono", () => {
    const abierta = geometriaAperturaVentana(
      { ancho: 400, alto: 800 },
      { ancho: 360, alto: 500 },
    );
    expect(abierta.x).toBeGreaterThanOrEqual(16);
    expect(abierta.x + abierta.w).toBeLessThanOrEqual(400 - 16);
    expect(abierta.y).toBe((800 - 500) / 2);
  });

  it("acota el ancho a la composición máxima de 1186 px", () => {
    const abierta = geometriaAperturaVentana(
      { ancho: 1920, alto: 1080 },
      { ancho: 1800, alto: 700 },
    );
    expect(abierta.w).toBe(1186);
    expect(abierta.x).toBe((1920 - 1186) / 2);
  });

  it("respeta una posición guardada que sí cabe en la pantalla", () => {
    const guardada = { x: 500, y: 300, w: 400, h: 300 };
    const abierta = geometriaAperturaVentana(
      { ancho: 1280, alto: 800 },
      { guardada },
    );
    expect(abierta).toEqual({ ...guardada, recolocada: false });
  });

  it("recoloca dentro de la pantalla una posición guardada que quedó fuera", () => {
    const abierta = geometriaAperturaVentana(
      { ancho: 1280, alto: 800 },
      { guardada: { x: -200, y: 10, w: 400, h: 300 } },
    );
    expect(abierta.recolocada).toBe(true);
    expect(abierta.w).toBe(400);
    expect(abierta.h).toBe(300);
    expect(abierta.x).toBeGreaterThanOrEqual(0);
    expect(abierta.y).toBeGreaterThanOrEqual(50);
    expect(abierta.x + abierta.w).toBeLessThanOrEqual(1280);
    expect(abierta.y + abierta.h).toBeLessThanOrEqual(800);
  });

  it("recoloca una ventana guardada que se salía por la derecha y abajo", () => {
    const abierta = geometriaAperturaVentana(
      { ancho: 1280, alto: 800 },
      { guardada: { x: 1100, y: 760, w: 400, h: 300 } },
    );
    expect(abierta.recolocada).toBe(true);
    expect(abierta.x + abierta.w).toBeLessThanOrEqual(1280);
    expect(abierta.y + abierta.h).toBeLessThanOrEqual(800);
  });

  it("nunca deja la ventana bajo la barra superior del Escritorio", () => {
    const abierta = geometriaAperturaVentana(
      { ancho: 1280, alto: 800 },
      { guardada: { x: 200, y: -80, w: 500, h: 400 }, margenSuperior: 50 },
    );
    expect(abierta.recolocada).toBe(true);
    expect(abierta.y).toBeGreaterThanOrEqual(50);
  });

  it("si la posición guardada se sale por tamaño, la acota a la pantalla", () => {
    const abierta = geometriaAperturaVentana(
      { ancho: 1280, alto: 800 },
      { guardada: { x: 10, y: 60, w: 2000, h: 1000 } },
    );
    expect(abierta.recolocada).toBe(true);
    expect(abierta.w).toBeLessThanOrEqual(1280);
    expect(abierta.h).toBeLessThanOrEqual(800);
    expect(abierta.x + abierta.w).toBeLessThanOrEqual(1280);
    expect(abierta.y + abierta.h).toBeLessThanOrEqual(800);
  });
});
