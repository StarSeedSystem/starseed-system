import { describe, expect, it, vi } from "vitest";
import {
  COMANDO_ESTADO_SERVIDOR,
  consultarEstadoServidor,
  interpretarEstadoServidor,
  textoEstadoServidor,
} from "../estado-servidor-local";

const est = (o: Record<string, unknown>) => interpretarEstadoServidor({ fase: "local", ...o });

describe("interpretarEstadoServidor", () => {
  it("rechaza lo que no es un estado", () => {
    for (const x of [null, undefined, 3, "local", [], {}, { fase: "" }, { fase: 4 }]) expect(interpretarEstadoServidor(x)).toBeNull();
  });
  it("normaliza campos raros", () => {
    const e = est({ puerto: 99999, origen: "  ", reinicios: -2, motivo: 5 })!;
    expect(e).toMatchObject({ fase: "local", puerto: null, origen: null, reinicios: 0, motivo: null });
  });
  it("conserva lo válido", () => {
    expect(est({ puerto: 47610, reinicios: 2.7, version_paquete: "1.2.3" })).toMatchObject({ puerto: 47610, reinicios: 2, version_paquete: "1.2.3" });
  });
});

describe("textoEstadoServidor", () => {
  it("sin estado, nada", () => expect(textoEstadoServidor(null)).toBeNull());
  it("listo con origen", () => {
    expect(textoEstadoServidor(est({ puerto: 47610, origen: "http://127.0.0.1:47610" }))).toMatchObject({ texto: "servidor local · listo en 127.0.0.1:47610", tono: "ok" });
  });
  it("listo solo con puerto", () => expect(textoEstadoServidor(est({ puerto: 47611 }))?.texto).toBe("servidor local · listo en 127.0.0.1:47611"));
  it("listo sin dato de dirección no la inventa", () => expect(textoEstadoServidor(est({}))?.texto).toBe("servidor local · listo"));
  it.each([
    ["arrancando", "servidor local · arrancando", "info"],
    ["reiniciando", "servidor local · caído, reintentando", "error"],
    ["web-publicada", "sin paquete local: usa la web publicada", "aviso"],
    ["apagado", "servidor local · apagado", "neutro"],
    ["inventada", "servidor local · estado desconocido", "neutro"],
  ])("%s", (fase, texto, tono) => {
    expect(textoEstadoServidor(interpretarEstadoServidor({ fase }))).toMatchObject({ texto, tono });
  });
  it("reiniciando cuenta los reinicios", () => {
    expect(textoEstadoServidor(interpretarEstadoServidor({ fase: "reiniciando", reinicios: 3 }))?.texto).toBe("servidor local · caído, reintentando (3)");
  });
  it("sin internet es error y otro-sistema no se pinta", () => {
    expect(textoEstadoServidor(interpretarEstadoServidor({ fase: "sin-internet" }))?.tono).toBe("error");
    expect(textoEstadoServidor(interpretarEstadoServidor({ fase: "otro-sistema" }))).toBeNull();
  });
  it("el detalle junta motivo y versión", () => {
    expect(textoEstadoServidor(est({ motivo: "Todo bien", version_paquete: "0.2" }))?.detalle).toBe("Todo bien · paquete 0.2");
  });
});

describe("consultarEstadoServidor", () => {
  it("fuera de la app nativa no llama a nada", async () => {
    const llamar = vi.fn();
    expect(await consultarEstadoServidor({ nativa: () => false, llamar })).toBeNull();
    expect(llamar).not.toHaveBeenCalled();
  });
  it("en la app pide el comando y lo interpreta", async () => {
    const llamar = vi.fn().mockResolvedValue({ ok: true, valor: { fase: "arrancando" } });
    expect((await consultarEstadoServidor({ nativa: () => true, llamar }))?.fase).toBe("arrancando");
    expect(llamar).toHaveBeenCalledWith(COMANDO_ESTADO_SERVIDOR);
  });
  it("nunca lanza", async () => {
    expect(await consultarEstadoServidor({ nativa: () => true, llamar: async () => ({ ok: false, motivo: "x" }) })).toBeNull();
    expect(await consultarEstadoServidor({ nativa: () => true, llamar: async () => { throw new Error("x"); } })).toBeNull();
  });
});
