/*
 * Estado del servidor local en la app nativa (APP1107T6) — pruebas deterministas, sin red.
 * La respuesta que interpretarEstado espera es la de `invoke('servidor_local_estado')`
 * (native/src-tauri/src/servidor_local.rs, EstadoServidorLocal).
 */
import { describe, expect, it } from "vitest";
import {
  COMANDO_ESTADO,
  decirEstado,
  esAppNativa,
  interpretarEstado,
  pedirEstado,
} from "../estado-servidor-local";

const listo = {
  fase: "local",
  puerto: 47610,
  origen: "http://127.0.0.1:47610",
  motivo: null as string | null,
  reinicios: 0,
  version_paquete: "0.5.0",
  commit_paquete: "abc1234",
  registro: "/tmp/servidor-local.log",
};

describe("interpretarEstado", () => {
  it("lee la respuesta completa del comando de Rust", () => {
    const e = interpretarEstado(listo);
    expect(e).toEqual({
      fase: "local",
      puerto: 47610,
      origen: "http://127.0.0.1:47610",
      motivo: null,
      reinicios: 0,
      version_paquete: "0.5.0",
      commit_paquete: "abc1234",
    });
    expect(e!.version_paquete).toBe("0.5.0");
  });

  it("rechaza lo que no sea una fase conocida o no sea objeto", () => {
    expect(interpretarEstado({ fase: "rara" })).toBeNull();
    expect(interpretarEstado({})).toBeNull();
    expect(interpretarEstado(null)).toBeNull();
    expect(interpretarEstado("local")).toBeNull();
    expect(interpretarEstado(undefined)).toBeNull();
  });

  it("tolera campos que faltan y limpia lo vacío", () => {
    const e = interpretarEstado({ fase: "arrancando", motivo: "   ", reinicios: -3, puerto: "47610" });
    expect(e).toEqual({
      fase: "arrancando",
      puerto: null,
      origen: null,
      motivo: null,
      reinicios: 0,
      version_paquete: null,
      commit_paquete: null,
    });
  });

  it("cuenta los reinicios reales", () => {
    expect(interpretarEstado({ ...listo, fase: "reiniciando", reinicios: 2 })!.reinicios).toBe(2);
  });
});

describe("esAppNativa", () => {
  it("solo la ventana con __TAURI__ es la app nativa", () => {
    expect(esAppNativa({ __TAURI__: {} })).toBe(true);
    expect(esAppNativa({})).toBe(false);
    expect(esAppNativa(undefined)).toBe(false);
    expect(esAppNativa(null)).toBe(false);
  });
});

describe("pedirEstado", () => {
  it("pide el comando exacto y devuelve el estado interpretado", async () => {
    const vistas: string[] = [];
    const e = await pedirEstado(async (cmd, args) => {
      vistas.push(`${cmd}|${JSON.stringify(args ?? {})}`);
      return listo;
    });
    expect(vistas).toEqual([`${COMANDO_ESTADO}|{}`]);
    expect(e!.fase).toBe("local");
  });

  it("no lanza si el puente responde algo raro: null", async () => {
    expect(await pedirEstado(async () => "nada")).toBeNull();
    expect(await pedirEstado(async () => Promise.reject(new Error("apagando")))).toBeNull();
  });
});

describe("decirEstado", () => {
  it("listo en el origen (sin esquema) o con el puerto", () => {
    const d = decirEstado(interpretarEstado(listo)!);
    expect(d.tono).toBe("listo");
    expect(d.texto).toBe("servidor local · listo en 127.0.0.1:47610");
    const sinOrigen = decirEstado({ fase: "local", puerto: 47613, origen: null, motivo: null, reinicios: 0, version_paquete: null, commit_paquete: null });
    expect(sinOrigen.texto).toBe("servidor local · listo en 127.0.0.1:47613");
  });

  it.each([
    ["arrancando", "arrancando", "servidor local · arrancando…"],
    ["apagado", "arrancando", "servidor local · arrancando…"],
    ["reiniciando", "caido", "servidor local · caído, reintentando"],
    ["web-publicada", "respaldo", "sin paquete local: usa la web publicada"],
    ["sin-internet", "respaldo", "sin internet: usa la web publicada"],
    ["otro-sistema", "respaldo", "este portal usa su web publicada"],
  ] as const)("%s → tono %s", (fase, tono, texto) => {
    const d = decirEstado({ ...interpretarEstado(listo)!, fase });
    expect(d.tono).toBe(tono);
    expect(d.texto).toBe(texto);
  });
});
