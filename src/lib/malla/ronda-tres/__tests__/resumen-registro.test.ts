import { describe, it, expect } from "vitest";
import { resumirRonda, type ResumenRonda } from "../resumen-registro";

describe("resumirRonda", () => {
  it("devuelve ceros y sinEvidencia completa con registro vacío", () => {
    const r = resumirRonda([]);
    expect(r).toEqual({
      mensajes: { enviados: 0, entregados: 0, porMedio: {} },
      archivos: { completos: 0, verificados: 0, fallos: [], kbps: [] },
      relevo: { rutas: 0, entregados: 0, sinRuta: 0 },
      llamadas: { contestadas: 0, porWebrtc: 0, porDatos: 0, fallos: 0 },
      control: 0,
      sinEvidencia: ["mensajes", "archivos", "relevo", "llamadas", "control"],
    });
  });

  it("cuenta cada contador con registro de ejemplo de 15 líneas", () => {
    const lineas = [
      "2026-11-18T10:00:00.000Z · mensaje-malla · enlace=b1 · neurona n1 · enviado",
      "2026-11-18T10:00:01.000Z · mensaje-malla · enlace=b1 · neurona n1 · entregado via=ble",
      "2026-11-18T10:00:02.000Z · mensaje-malla · enlace=b2 · neurona n2 · entregado via=relevo",
      "2026-11-18T10:00:03.000Z · archivo · enlace=b1 · neurona n1 · id1 completo kbps=120 vias=ble,relevo",
      "2026-11-18T10:00:04.000Z · archivo · enlace=b1 · neurona n1 · id1 verificado",
      "2026-11-18T10:00:05.000Z · archivo · enlace=b2 · neurona n2 · id2 fallo motivo=timeout",
      "2026-11-18T10:00:06.000Z · relevo · enlace=b3 · neurona n3 · ruta destino=n4 motivo=nueva",
      "2026-11-18T10:00:07.000Z · relevo · enlace=b3 · neurona n3 · entregado 120 ms=45",
      "2026-11-18T10:00:08.000Z · relevo · enlace=b4 · neurona n5 · sin-ruta",
      "2026-11-18T10:00:09.000Z · llamada · enlace=b1 · neurona n1 · contestada medio=webrtc",
      "2026-11-18T10:00:10.000Z · llamada · enlace=b2 · neurona n2 · contestada medio=enlace-datos",
      "2026-11-18T10:00:11.000Z · llamada · enlace=b3 · neurona n3 · fallo",
      "2026-11-18T10:00:12.000Z · control-pantalla · enlace=b1 · neurona n1 · inicio",
      "2026-11-18T10:00:13.000Z · control-entrada · enlace=b1 · neurona n1 · fin ordenes=3 rechazadas=0",
      "2026-11-18T10:00:14.000Z · basura sin sentido",
      "",
    ];
    const r = resumirRonda(lineas);
    expect(r.mensajes).toEqual({ enviados: 1, entregados: 2, porMedio: { ble: 1, relevo: 1 } });
    expect(r.archivos).toEqual({ completos: 1, verificados: 1, fallos: ["timeout"], kbps: [120] });
    expect(r.relevo).toEqual({ rutas: 1, entregados: 1, sinRuta: 1 });
    expect(r.llamadas).toEqual({ contestadas: 2, porWebrtc: 1, porDatos: 1, fallos: 1 });
    expect(r.control).toBe(2);
    expect(r.sinEvidencia).toEqual([]);
  });

  it("tolera líneas con prefijo (Maggaboard) y formato nativo ble", () => {
    const lineas = [
      "(Maggaboard) 2026-11-18T10:00:00.000Z · mensaje-malla · enlace=b1 · neurona n1 · enviado",
      "2026-11-18T10:00:01.000Z ble mensaje-malla enlace=b1 neurona=n1 · entregado via=ble",
      "2026-11-18T10:00:02.000Z ble archivo enlace=b1 neurona=n1 · id1 completo kbps=200 vias=ble",
      "2026-11-18T10:00:03.000Z ble control-pantalla enlace=b1 neurona=n1 · inicio",
    ];
    const r = resumirRonda(lineas);
    expect(r.mensajes.enviados).toBe(1);
    expect(r.mensajes.entregados).toBe(1);
    expect(r.mensajes.porMedio).toEqual({ ble: 1 });
    expect(r.archivos.completos).toBe(1);
    expect(r.archivos.kbps).toEqual([200]);
    expect(r.control).toBe(1);
    expect(r.sinEvidencia).toEqual(["relevo", "llamadas"]);
  });
});