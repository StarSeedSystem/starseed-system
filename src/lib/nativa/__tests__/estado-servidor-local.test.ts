import { describe, expect, it, vi } from "vitest";
import {
  COMANDO_ACTUALIZAR_SERVIDOR,
  COMANDO_ESTADO_SERVIDOR,
  buildCorto,
  consultarEstadoServidor,
  interpretarEstadoServidor,
  pedirActualizarServidor,
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
  it("el detalle junta motivo, versión y qué sirve", () => {
    expect(textoEstadoServidor(est({ motivo: "Todo bien", version_paquete: "0.2" }))?.detalle).toBe("Todo bien · paquete 0.2 · Sirve el paquete del instalador");
  });
});

describe("(CAP1107A) capas del servidor", () => {
  it("solo acepta builds con forma de BUILD_ID", () => {
    expect(est({ capa: "AA0YdaG0s8hV9CgdmX1rc", capa_nueva: "../x" })).toMatchObject({ capa: "AA0YdaG0s8hV9CgdmX1rc", capa_nueva: null });
    expect(est({ capa: 3, capas_fase: " descargando " })).toMatchObject({ capa: null, capas_fase: "descargando" });
    expect(buildCorto("AA0YdaG0s8hV9CgdmX1rc")).toBe("AA0YdaG0");
  });
  it("dice qué capa sirve", () => {
    expect(textoEstadoServidor(est({ puerto: 47610 }))).toMatchObject({ capa: "capa del instalador", nueva: null, tono: "ok" });
    const t = textoEstadoServidor(est({ puerto: 47610, capa: "AA0YdaG0s8hV9CgdmX1rc" }))!;
    expect(t.capa).toBe("capa AA0YdaG0");
    expect(t.detalle).toContain("Sirve la capa AA0YdaG0s8hV9CgdmX1rc");
  });
  it("una capa nueva lista se ofrece; mientras baja, se dice", () => {
    const t = textoEstadoServidor(est({ capa_nueva: "BB1", capa_nueva_version: "0.3.1 · abc1234" }))!;
    expect(t.nueva).toBe("capa nueva lista · 0.3.1 · abc1234");
    expect(t.detalle).toContain("Actualizar ahora");
    expect(textoEstadoServidor(est({ capas_fase: "descargando" }))!.detalle).toContain("descargando una capa nueva");
    expect(textoEstadoServidor(est({ capas_fase: "al-dia" }))!.detalle).toBe("Sirve el paquete del instalador");
  });
  it("una vuelta atrás se cuenta", () => {
    const aviso = "La capa BB1 no pasó la salud (x): se volvió a la capa AA0YdaG0.";
    expect(textoEstadoServidor(est({ capa: "AA0YdaG0s8hV9CgdmX1rc", capas_aviso: aviso }))!.detalle).toContain(aviso);
  });
  it("fuera de «local» no hay capa ni botón", () => {
    expect(textoEstadoServidor(interpretarEstadoServidor({ fase: "arrancando", capa_nueva: "BB1" }))).toMatchObject({ capa: null, nueva: null });
  });
  it("«Actualizar ahora» pide el comando solo en la app y nunca lanza", async () => {
    const llamar = vi.fn().mockResolvedValue({ ok: true, valor: "Reiniciando…" });
    expect(await pedirActualizarServidor({ nativa: () => true, llamar })).toEqual({ ok: true, mensaje: "Reiniciando…" });
    expect(llamar).toHaveBeenCalledWith(COMANDO_ACTUALIZAR_SERVIDOR);
    const fuera = vi.fn();
    expect((await pedirActualizarServidor({ nativa: () => false, llamar: fuera })).ok).toBe(false);
    expect(fuera).not.toHaveBeenCalled();
    expect(await pedirActualizarServidor({ nativa: () => true, llamar: async () => ({ ok: false, motivo: "No hay ninguna capa nueva lista." }) })).toEqual({
      ok: false,
      mensaje: "No hay ninguna capa nueva lista.",
    });
    expect((await pedirActualizarServidor({ nativa: () => true, llamar: async () => { throw new Error("roto"); } })).mensaje).toBe("roto");
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
