import { describe, it, expect } from "vitest";
import { protegerConexion, ejecutarGuardia } from "../guardia-privacidad";
import { consentimiento } from "@/lib/xr/privacidad";

describe("guardia-privacidad", () => {
  it("pose a sala publica pasa sin bloqueo", () => {
    const bloqueos: string[] = [];
    const mockC = {
      tema: "test", suscrito: () => true,
      enviar: (e: string, p: Record<string, unknown>) => { bloqueos.push("enviado:" + e); },
      publicarPresencia: () => {}, onPresencia: () => () => {},
      onMensaje: () => () => {}, onFila: () => () => {}, onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const guardado = protegerConexion(mockC, {
      destino: "sala-publica" as any, consentimientos: () => [],
      ahora: () => 1_000_000, alBloquear: (v) => bloqueos.push("bloqueado:" + v.clase),
    });
    guardado.enviar("pose" as any, { pose: { x: 1 } });
    expect(bloqueos.some((b) => b.startsWith("enviado:"))).toBe(true);
  });

  it("payload con camara se bloquea con requiere 'nunca' aunque haya consentimiento", () => {
    const bloqueos: { clase: string; requiere: string }[] = [];
    const mockC = {
      tema: "t", suscrito: () => true, enviar: () => {},
      publicarPresencia: () => {}, onPresencia: () => () => {},
      onMensaje: () => () => {}, onFila: () => () => {}, onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const cons = consentimiento("camara-passthrough" as any, "sala-publica" as any, 1_000_000);
    const guardado = protegerConexion(mockC, {
      destino: "sala-publica" as any, consentimientos: () => [cons],
      ahora: () => 1_000_000, alBloquear: (v) => bloqueos.push({ clase: v.clase, requiere: v.requiere }),
    });
    guardado.enviar("pose" as any, { camara: true });
    expect(bloqueos.some((b) => b.clase === "camara-passthrough" && b.requiere === "nunca")).toBe(true);
  });

  it("mapa a mismas-cuentas sin consentimiento se bloquea y con el pasa", () => {
    const bloqueos: string[] = [];
    const enviados: string[] = [];
    const mockC = {
      tema: "t", suscrito: () => true, enviar: (e: string) => enviados.push(e),
      publicarPresencia: () => {}, onPresencia: () => () => {},
      onMensaje: () => () => {}, onFila: () => () => {}, onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const ahora = 500_000;
    const g1 = protegerConexion(mockC, {
      destino: "mismas-cuentas" as any, consentimientos: () => [],
      ahora: () => ahora, alBloquear: (v) => bloqueos.push(v.clase),
    });
    g1.enviar("cambios" as any, { mapa: true });
    expect(bloqueos.includes("mapa-sala")).toBe(true);
    bloqueos.length = 0;
    const cons = consentimiento("mapa-sala" as any, "mismas-cuentas" as any, ahora);
    const g2 = protegerConexion(mockC, {
      destino: "mismas-cuentas" as any, consentimientos: () => [cons],
      ahora: () => ahora, alBloquear: () => {},
    });
    g2.enviar("cambios" as any, { mapa: true });
    expect(enviados.includes("cambios")).toBe(true);
  });

  it("consentimiento vencido bloquea", () => {
    const bloqueos: string[] = [];
    const mockC = {
      tema: "t", suscrito: () => true, enviar: () => {},
      publicarPresencia: () => {}, onPresencia: () => () => {},
      onMensaje: () => () => {}, onFila: () => () => {}, onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const consVencido = consentimiento("mapa-sala" as any, "mismas-cuentas" as any, 0, 1);
    const guardado = protegerConexion(mockC, {
      destino: "mismas-cuentas" as any, consentimientos: () => [consVencido],
      ahora: () => 2_000_000, alBloquear: (v) => bloqueos.push(v.clase),
    });
    guardado.enviar("cambios" as any, { mapa: true });
    expect(bloqueos.includes("mapa-sala")).toBe(true);
  });

  it("ejecutarGuardia delega a protegerConexion", () => {
    expect(typeof ejecutarGuardia).toBe("function");
  });
});
