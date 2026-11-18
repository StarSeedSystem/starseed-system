/**
 * (T305) Pruebas del lector puro de enlaces.log que resume la ronda de pruebas de tres neuronas
 * NODE_ENV=test npx vitest run src/lib/malla/ronda-tres src/lib/__tests__/nombre-genesis.test.ts
 */
import { describe, expect, it } from "vitest";
import { resumirRonda } from "@/lib/malla/ronda-tres/resumen-registro";

describe("resumirRonda", () => {
  it("maneja un registro vacío", () => {
    const resumen = resumirRonda([]);
    expect(resumen.mensajes.enviados).toBe(0);
    expect(resumen.mensajes.entregados).toBe(0);
    expect(resumen.mensajes.porMedio).toEqual({});
    expect(resumen.archivos.completos).toBe(0);
    expect(resumen.archivos.verificados).toBe(0);
    expect(resumen.archivos.fallos).toEqual([]);
    expect(resumen.archivos.kbps).toEqual([]);
    expect(resumen.relevo.rutas).toBe(0);
    expect(resumen.relevo.entregados).toBe(0);
    expect(resumen.relevo.sinRuta).toBe(0);
    expect(resumen.llamadas.contestadas).toBe(0);
    expect(resumen.llamadas.porWebrtc).toBe(0);
    expect(resumen.llamadas.porDatos).toBe(0);
    expect(resumen.llamadas.fallos).toBe(0);
    expect(resumen.control).toBe(0);
    expect(resumen.sinEvidencia).toContain("mensaje");
    expect(resumen.sinEvidencia).toContain("archivo");
    expect(resumen.sinEvidencia).toContain("puerta");
    expect(resumen.sinEvidencia).toContain("llamada");
  });

  it("procesa mensajes enviados y entregados via diferente medio", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · web · mensaje-malla · b3 · enviado",
      "2026-11-18T10:00:01.000Z · web · mensaje-malla · b3 · entregado via=wifi",
      "2026-11-18T10:00:02.000Z · web · mensaje-malla · b1 · entregado via=ble",
      "2026-11-18T10:00:03.000Z · web · mensaje-malla · b2 · enviado",
    ];
    const resumen = resumirRonda(lineas);
    expect(resumen.mensajes.enviados).toBe(2);
    expect(resumen.mensajes.entregados).toBe(2);
    expect(resumen.mensajes.porMedio["wifi"]).toBe(1);
    expect(resumen.mensajes.porMedio["ble"]).toBe(1);
  });

  it("procesa archivos completos, verificados y fallos", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · web · archivo · b1 · arch-001 completo kbps=150 vias=3",
      "2026-11-18T10:00:01.000Z · web · archivo · b1 · arch-002 verificado",
      "2026-11-18T10:00:02.000Z · web · archivo · b1 · arch-003 completo kbps=200 vias=1",
      "2026-11-18T10:00:03.000Z · web · archivo · b1 · arch-004 fallo motivo=timeout del otro",
    ];
    const resumen = resumirRonda(lineas);
    expect(resumen.archivos.completos).toBe(2);
    expect(resumen.archivos.verificados).toBe(1);
    expect(resumen.archivos.fallos).toEqual(["timeout del otro"]);
    expect(resumen.archivos.kbps).toEqual([150, 200]);
  });

  it("procesa relevo con ruta, entregado y sin-ruta", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z web relevo - - ruta destino=neurona-abc motivo=llegue",
      "2026-11-18T10:00:01.000Z web relevo - - entregado ... ms=500",
      "2026-11-18T10:00:02.000Z web relevo - - sin-ruta",
    ];
    const resumen = resumirRonda(lineas);
    expect(resumen.relevo.rutas).toBe(1);
    expect(resumen.relevo.entregados).toBe(1);
    expect(resumen.relevo.sinRuta).toBe(1);
  });

  it("procesa llamadas contestadas por webrtc y por datos", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · web · llamada · b3 · contestada medio=webrtc",
      "2026-11-18T10:00:01.000Z · web · llamada · b3 · contestada medio=enlace-datos",
      "2026-11-18T10:00:02.000Z · web · llamada · b3 · fallo",
    ];
    const resumen = resumirRonda(lineas);
    expect(resumen.llamadas.contestadas).toBe(2);
    expect(resumen.llamadas.porWebrtc).toBe(1);
    expect(resumen.llamadas.porDatos).toBe(1);
    expect(resumen.llamadas.fallos).toBe(1);
  });

  it("cuenta eventos de control", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · web · control-sesion • fin • neurona-01",
      "2026-11-18T10:00:01.000Z · web · control-entrada • orden • neurona-02",
    ];
    const resumen = resumirRonda(lineas);
    expect(resumen.control).toBe(2);
  });

  it("tolera lineas vacias y basura", () => {
    const lineas = [
      "",
      "   ",
      "línea sin formato reconocible",
      "random text here",
      "2026-11-18T10:00:00.000Z · web · mensaje-malla · b3 · enviado",
      "(Maggaboard) 2026-11-18T10:00:01.000Z · web · mensaje-malla · b3 · entregado via=wifi",
    ];
    const resumen = resumirRonda(lineas);
    expect(resumen.mensajes.enviados).toBe(1);
    expect(resumen.mensajes.entregados).toBe(1);
  });

  it("identifica tipos faltantes como sinEvidencia", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · web · mensaje-malla · b3 · enviado",
      "2026-11-18T10:00:01.000Z · web · archivo · b1 · arch-001 completo kbps=150 vias=3",
    ];
    const resumen = resumirRonda(lineas);
    expect(resumen.sinEvidencia).toContain("puerta");
    expect(resumen.sinEvidencia).toContain("llamada");
    expect(resumen.sinEvidencia).not.toContain("mensaje");
    expect(resumen.sinEvidencia).not.toContain("archivo");
  });

  it("procesa un registro coherente de 12 lineas", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · web · mensaje-malla · b3 · enviado",
      "2026-11-18T10:00:01.000Z · web · mensaje-malla · b3 · entregado via=wifi",
      "2026-11-18T10:00:02.000Z · web · archivo · b1 · arch-001 completo kbps=150 vias=3",
      "2026-11-18T10:00:03.000Z · web · archivo · b1 · arch-002 verificado",
      "2026-11-18T10:00:04.000Z web relevo - - ruta destino=neurona-abc motivo=llegue",
      "2026-11-18T10:00:05.000Z web relevo - - entregado ... ms=500",
      "2026-11-18T10:00:06.000Z · web · llamada · b3 · contestada medio=webrtc",
      "2026-11-18T10:00:07.000Z · web · control-sesion • fin • neurona-01",
      "2026-11-18T10:00:08.000Z · web · mensaje-malla · b1 · entregado via=ble",
      "2026-11-18T10:00:09.000Z · web · archivo · b1 · arch-003 completo kbps=200 vias=1",
      "2026-11-18T10:00:10.000Z · web · archivo · b1 · arch-004 fallo motivo=timeout del otro",
      "2026-11-18T10:00:11.000Z · web · llamada · b3 · fallo",
    ];
    const resumen = resumirRonda(lineas);
    expect(resumen.mensajes.enviados).toBe(1);
    expect(resumen.mensajes.entregados).toBe(2);
    expect(resumen.mensajes.porMedio["wifi"]).toBe(1);
    expect(resumen.mensajes.porMedio["ble"]).toBe(1);
    expect(resumen.archivos.completos).toBe(2);
    expect(resumen.archivos.verificados).toBe(1);
    expect(resumen.archivos.fallos).toEqual(["timeout del otro"]);
    expect(resumen.archivos.kbps).toEqual([150, 200]);
    expect(resumen.relevo.rutas).toBe(1);
    expect(resumen.relevo.entregados).toBe(1);
    expect(resumen.relevo.sinRuta).toBe(0);
    expect(resumen.llamadas.contestadas).toBe(1);
    expect(resumen.llamadas.porWebrtc).toBe(1);
    expect(resumen.llamadas.porDatos).toBe(0);
    expect(resumen.llamadas.fallos).toBe(1);
    expect(resumen.control).toBe(1);
    expect(resumen.sinEvidencia).toEqual([]);
  });
});