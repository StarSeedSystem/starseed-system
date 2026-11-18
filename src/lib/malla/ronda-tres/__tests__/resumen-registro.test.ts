import { describe, it, expect } from "vitest";
import { resumirRonda, ResumenRonda } from "../resumen-registro";

describe("resumirRonda", () => {
  it("devuelve ceros y sinEvidencia completa con registro vacío", () => {
    const r = resumirRonda([]);
    expect(r.mensajes.enviados).toBe(0);
    expect(r.mensajes.entregados).toBe(0);
    expect(r.mensajes.porMedio).toEqual({});
    expect(r.archivos.completos).toBe(0);
    expect(r.archivos.verificados).toBe(0);
    expect(r.archivos.fallos).toEqual([]);
    expect(r.archivos.kbps).toEqual([]);
    expect(r.relevo.rutas).toBe(0);
    expect(r.relevo.entregados).toBe(0);
    expect(r.relevo.sinRuta).toBe(0);
    expect(r.llamadas.contestadas).toBe(0);
    expect(r.llamadas.porWebrtc).toBe(0);
    expect(r.llamadas.porDatos).toBe(0);
    expect(r.llamadas.fallos).toBe(0);
    expect(r.control).toBe(0);
    expect(r.sinEvidencia).toEqual([
      "mensajes",
      "archivos",
      "relevo",
      "llamadas",
      "control",
    ]);
  });

  it("cuenta mensajes-malla enviados y entregados por medio", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · mensaje-malla · b1 · neurona abc123 · enviado",
      "2026-11-18T10:00:01.000Z · mensaje-malla · b1 · neurona abc123 · entregado via=ble",
      "2026-11-18T10:00:02.000Z · mensaje-malla · b2 · neurona def456 · entregado via=local",
      "2026-11-18T10:00:03.000Z · mensaje-malla · b2 · neurona def456 · entregado via=ble",
    ];
    const r = resumirRonda(lineas);
    expect(r.mensajes.enviados).toBe(1);
    expect(r.mensajes.entregados).toBe(3);
    expect(r.mensajes.porMedio).toEqual({ ble: 2, local: 1 });
    expect(r.sinEvidencia).not.toContain("mensajes");
  });

  it("cuenta archivos: completos, verificados, fallos y kbps", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · archivo · b1 · neurona abc123 · id1 completo kbps=120 vias=2",
      "2026-11-18T10:00:01.000Z · archivo · b1 · neurona abc123 · id1 verificado",
      "2026-11-18T10:00:02.000Z · archivo · b2 · neurona def456 · id2 fallo motivo=timeout",
      "2026-11-18T10:00:03.000Z · archivo · b2 · neurona def456 · id3 completo kbps=80 vias=1",
    ];
    const r = resumirRonda(lineas);
    expect(r.archivos.completos).toBe(2);
    expect(r.archivos.verificados).toBe(1);
    expect(r.archivos.fallos).toEqual(["timeout"]);
    expect(r.archivos.kbps).toEqual([120, 80]);
    expect(r.sinEvidencia).not.toContain("archivos");
  });

  it("cuenta relevo: rutas, entregados, sin-ruta", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z web relevo - - ruta destino=neurona1 motivo=nueva",
      "2026-11-18T10:00:01.000Z web relevo - - ruta destino=neurona2 motivo=reintento",
      "2026-11-18T10:00:02.000Z web relevo - - entregado neurona1 ms=150",
      "2026-11-18T10:00:03.000Z web relevo - - sin-ruta destino=neurona3",
    ];
    const r = resumirRonda(lineas);
    expect(r.relevo.rutas).toBe(2);
    expect(r.relevo.entregados).toBe(1);
    expect(r.relevo.sinRuta).toBe(1);
    expect(r.sinEvidencia).not.toContain("relevo");
  });

  it("cuenta llamadas: contestadas, porWebrtc, porDatos, fallos", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · llamada · b1 · neurona abc123 · senal-enviada",
      "2026-11-18T10:00:01.000Z · llamada · b1 · neurona abc123 · contestada medio=webrtc",
      "2026-11-18T10:00:02.000Z · llamada · b2 · neurona def456 · contestada medio=enlace-datos",
      "2026-11-18T10:00:03.000Z · llamada · b3 · neurona ghi789 · fallo motivo=ocupado",
    ];
    const r = resumirRonda(lineas);
    expect(r.llamadas.contestadas).toBe(2);
    expect(r.llamadas.porWebrtc).toBe(1);
    expect(r.llamadas.porDatos).toBe(1);
    expect(r.llamadas.fallos).toBe(1);
    expect(r.sinEvidencia).not.toContain("llamadas");
  });

  it("cuenta líneas de control-*", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · control-pantalla · b1 · neurona abc123 · inicio",
      "2026-11-18T10:00:01.000Z · control-entrada · b1 · neurona abc123 · fin ordenes=3 rechazadas=0",
      "2026-11-18T10:00:02.000Z · control-indicador · b1 · neurona abc123 · intento",
    ];
    const r = resumirRonda(lineas);
    expect(r.control).toBe(3);
    expect(r.sinEvidencia).not.toContain("control");
  });

  it("tolera líneas vacías, basura y prefijos como (Maggaboard)", () => {
    const lineas = [
      "",
      "   ",
      "basura sin formato",
      "(Maggaboard) 2026-11-18T10:00:00.000Z · mensaje-malla · b1 · neurona abc123 · enviado",
      "2026-11-18T10:00:01.000Z · mensaje-malla · b1 · neurona abc123 · entregado via=ble",
    ];
    const r = resumirRonda(lineas);
    expect(r.mensajes.enviados).toBe(1);
    expect(r.mensajes.entregados).toBe(1);
    expect(r.mensajes.porMedio).toEqual({ ble: 1 });
  });

  it("registro mixto de 12-15 líneas cubre todos los contadores", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · mensaje-malla · b1 · neurona a1 · enviado",
      "2026-11-18T10:00:01.000Z · mensaje-malla · b1 · neurona a1 · entregado via=ble",
      "2026-11-18T10:00:02.000Z · mensaje-malla · b2 · neurona a2 · entregado via=local",
      "2026-11-18T10:00:03.000Z · archivo · b1 · neurona a1 · id1 completo kbps=100 vias=1",
      "2026-11-18T10:00:04.000Z · archivo · b1 · neurona a1 · id1 verificado",
      "2026-11-18T10:00:05.000Z · archivo · b2 · neurona a2 · id2 fallo motivo=cancelado",
      "2026-11-18T10:00:06.000Z web relevo - - ruta destino=n1 motivo=nueva",
      "2026-11-18T10:00:07.000Z web relevo - - entregado n1 ms=200",
      "2026-11-18T10:00:08.000Z web relevo - - sin-ruta destino=n2",
      "2026-11-18T10:00:09.000Z · llamada · b1 · neurona a1 · contestada medio=webrtc",
      "2026-11-18T10:00:10.000Z · llamada · b2 · neurona a2 · contestada medio=enlace-datos",
      "2026-11-18T10:00:11.000Z · llamada · b3 · neurona a3 · fallo motivo=timeout",
      "2026-11-18T10:00:12.000Z · control-pantalla · b1 · neurona a1 · inicio",
      "",
      "basura",
    ];
    const r = resumirRonda(lineas);
    expect(r.mensajes.enviados).toBe(1);
    expect(r.mensajes.entregados).toBe(2);
    expect(r.mensajes.porMedio).toEqual({ ble: 1, local: 1 });
    expect(r.archivos.completos).toBe(1);
    expect(r.archivos.verificados).toBe(1);
    expect(r.archivos.fallos).toEqual(["cancelado"]);
    expect(r.archivos.kbps).toEqual([100]);
    expect(r.relevo.rutas).toBe(1);
    expect(r.relevo.entregados).toBe(1);
    expect(r.relevo.sinRuta).toBe(1);
    expect(r.llamadas.contestadas).toBe(2);
    expect(r.llamadas.porWebrtc).toBe(1);
    expect(r.llamadas.porDatos).toBe(1);
    expect(r.llamadas.fallos).toBe(1);
    expect(r.control).toBe(1);
    expect(r.sinEvidencia).toEqual([]);
  });
});