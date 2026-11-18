"use client";

import { describe, it, expect } from "vitest";

import { resumirRonda } from "../resumen-registro";

describe("resumirRonda", () => {
  it("resume un registro con todas las secciones", () => {
    const lineas = [
      "2026-11-08T12:30:05.123Z · enviado via=malla",
      "2026-11-08T12:30:06.456Z · entregado via=webrtc",
      "2026-11-08T12:30:07.789Z · archivo transfer-1 anuncio-enviado",
      "2026-11-08T12:30:08.901Z · archivo transfer-1 completo kbps=345 vias=canal-rapido",
      "2026-11-08T12:30:09.012Z · archivo transfer-1 verificado",
      "2026-11-08T12:30:10.123Z · archivo transfer-2 fallo motivo=timeout",
      "2026-11-08T12:30:11.234Z · web relevo - - entrega ruta neurona-x",
      "2026-11-08T12:30:12.345Z · web relevo - - entrega confirmada en 120 ms",
      "2026-11-08T12:30:13.456Z · web relevo - - sin-ruta",
      "2026-11-08T12:30:14.567Z · ble llamada enlace=b3 contestada",
      "2026-11-08T12:30:15.678Z · ble llamada enlace=b3 medio=webrtc",
      "2026-11-08T12:30:16.789Z · ble llamada enlace=b3 enlace-datos",
      "2026-11-08T12:30:17.890Z · ble llamada enlace=b3 fallo",
      "2026-11-08T12:30:18.901Z · control-mantenimiento prueba=ok",
      "",
      "basura sin sentido aquí",
    ];

    const resultado = resumirRonda(lineas);

    expect(resultado.mensajes.enviados).toBe(1);
    expect(resultado.mensajes.entregados).toBe(1);
    expect(resultado.mensajes.porMedio).toEqual({ malla: 1, webrtc: 1 });

    expect(resultado.archivos.completos).toBe(1);
    expect(resultado.archivos.verificados).toBe(1);
    expect(resultado.archivos.fallos).toEqual(["timeout"]);
    expect(resultado.archivos.kbps).toEqual([345]);

    expect(resultado.relevo.rutas).toBe(1);
    expect(resultado.relevo.entregados).toBe(1);
    expect(resultado.relevo.sinRuta).toBe(1);

    expect(resultado.llamadas.contestadas).toBe(1);
    expect(resultado.llamadas.porWebrtc).toBe(1);
    expect(resultado.llamadas.porDatos).toBe(1);
    expect(resultado.llamadas.fallos).toBe(1);

    expect(resultado.control).toBe(1);

    expect(resultado.sinEvidencia).toEqual([]);
  });

  it("marca secciones como sin evidencia cuando están vacías", () => {
    const lineas = [
      "2026-11-08T12:30:01.000Z · enviado via=malla",
    ];

    const resultado = resumirRonda(lineas);

    expect(resultado.mensajes.enviados).toBe(1);
    expect(resultado.mensajes.entregados).toBe(0);
    expect(resultado.sinEvidencia).toContain("entregados");

    expect(resultado.archivos.completos).toBe(0);
    expect(resultado.sinEvidencia).toContain("completos");
  });

  it("devuelve una estructura vacía para un registro vacío", () => {
    const lineas: string[] = [];

    const resultado = resumirRonda(lineas);

    expect(resultado.mensajes.enviados).toBe(0);
    expect(resultado.mensajes.entregados).toBe(0);
    expect(Object.keys(resultado.mensajes.porMedio)).toHaveLength(0);
    expect(resultado.sinEvidencia).toContain("enviados");
    expect(resultado.sinEvidencia).toContain("entregados");
    expect(resultado.sinEvidencia).toContain("completos");
    expect(resultado.sinEvidencia).toContain("verificados");
    expect(resultado.sinEvidencia).toContain("rutas");
    expect(resultado.sinEvidencia).toContain("entregados");
    expect(resultado.sinEvidencia).toContain("sinRuta");
    expect(resultado.sinEvidencia).toContain("contestadas");
    expect(resultado.sinEvidencia).toContain("porWebrtc");
    expect(resultado.sinEvidencia).toContain("porDatos");
    expect(resultado.sinEvidencia).toContain("fallos");
    expect(resultado.sinEvidencia).toContain("control");
  });

  it("mantiene el orden exacto de sinEvidencia", () => {
    const lineas: string[] = [];

    const resultado = resumirRonda(lineas);

    const esperado = [
      "enviados",
      "entregados",
      "completos",
      "verificados",
      "rutas",
      "entregados",
      "sinRuta",
      "contestadas",
      "porWebrtc",
      "porDatos",
      "fallos",
      "control",
    ];

    expect(resultado.sinEvidencia).toEqual(esperado);
  });
});
