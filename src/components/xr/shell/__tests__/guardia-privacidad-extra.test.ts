import { describe, it, expect } from "vitest";
import { protegerConexion } from "../guardia-privacidad";

describe("guardia-privacidad extra", () => {
  it("aviso limitado a una vez por clase y minuto", () => {
    const avisos: string[] = [];
    const mockC = {
      tema: "t", suscrito: () => true, enviar: () => {},
      publicarPresencia: () => {}, onPresencia: () => () => {},
      onMensaje: () => () => {}, onFila: () => () => {},
      onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const guardado = protegerConexion(mockC, {
      destino: "nube-terceros" as any, consentimientos: () => [],
      ahora: () => 1_000_000, alBloquear: (v) => avisos.push(v.clase),
    });
    guardado.enviar("pose" as any, { camara: true });
    guardado.enviar("pose" as any, { camara: true });
    guardado.enviar("cambios" as any, { mapa: true });
    guardado.enviar("cambios" as any, { mapa: true });
    expect(avisos.filter((a) => a === "camara-passthrough").length).toBe(1);
    expect(avisos.filter((a) => a === "mapa-sala").length).toBe(1);
  });

  it("el contenido bloqueado no aparece en el aviso", () => {
    const capturados: { clase: string; motivo: string }[] = [];
    const mockC = {
      tema: "t", suscrito: () => true, enviar: () => {},
      publicarPresencia: () => {}, onPresencia: () => () => {},
      onMensaje: () => () => {}, onFila: () => () => {},
      onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const guardado = protegerConexion(mockC, {
      destino: "sala-publica" as any, consentimientos: () => [],
      ahora: () => 1_000_000, alBloquear: (v) => capturados.push({ clase: v.clase, motivo: v.motivo }),
    });
    guardado.enviar("pose" as any, { camara: { imagen: "secreta" } });
    const aviso = capturados.find((c) => c.clase === "camara-passthrough");
    expect(aviso).toBeDefined();
    expect(aviso!.motivo).not.toContain("secreta");
  });

  it("claves anidadas en meta se detectan", () => {
    const bloqueos: string[] = [];
    const mockC = {
      tema: "t", suscrito: () => true, enviar: () => {},
      publicarPresencia: (meta: Record<string, unknown>) => {
        if (meta && meta.camara !== undefined) bloqueos.push("camara-passthrough");
      },
      onPresencia: () => () => {}, onMensaje: () => () => {},
      onFila: () => () => {}, onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const guardado = protegerConexion(mockC, {
      destino: "sala-publica" as any, consentimientos: () => [],
      ahora: () => 1_000_000, alBloquear: (v) => bloqueos.push(v.clase),
    });
    guardado.publicarPresencia({ camara: true });
    expect(bloqueos.includes("camara-passthrough")).toBe(true);
  });

  it("mirada nunca sale aunque con consentimiento", () => {
    const bloqueos: { clase: string; requiere: string }[] = [];
    const mockC = {
      tema: "t", suscrito: () => true, enviar: () => {},
      publicarPresencia: () => {}, onPresencia: () => () => {},
      onMensaje: () => () => {}, onFila: () => () => {},
      onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const guardado = protegerConexion(mockC, {
      destino: "sala-publica" as any, consentimientos: () => [
        { dato: "mirada" as any, hasta: "sala-publica" as any, vence: 9_999_999 },
      ],
      ahora: () => 1_000_000,
      alBloquear: (v) => bloqueos.push({ clase: v.clase, requiere: v.requiere }),
    });
    guardado.enviar("pose" as any, { mirada: true });
    expect(bloqueos.some((b) => b.clase === "mirada" && b.requiere === "nunca")).toBe(true);
  });

  it("pose a sala publica con datos de avatar pasa", () => {
    const enviados: string[] = [];
    const mockC = {
      tema: "t", suscrito: () => true,
      enviar: (e: string) => enviados.push(e),
      publicarPresencia: () => {}, onPresencia: () => () => {},
      onMensaje: () => () => {}, onFila: () => () => {},
      onSuscrito: () => () => {}, cerrar: () => {},
    } as any;
    const guardado = protegerConexion(mockC, {
      destino: "sala-publica" as any, consentimientos: () => [],
      ahora: () => 1_000_000, alBloquear: () => {},
    });
    guardado.enviar("pose" as any, { avatar: { nombre: "Ana" } });
    expect(enviados.includes("pose")).toBe(true);
  });
});
