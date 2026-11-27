// DIR1127E: sin RAM en este medio, Laya reenvía la decisión a la Laya de otro nodo (STARSEED_LAYA_REMOTO).
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { reenviarARemoto } from "../../../native/laya/servidor-laya.mjs";

function peticion(cuerpo: string) {
  const req = new EventEmitter();
  setTimeout(() => {
    req.emit("data", cuerpo);
    req.emit("end");
  }, 0);
  return req;
}

function respuesta() {
  const r = { estado: 0, cabeceras: {} as Record<string, string>, cuerpo: "", fin: null as null | (() => void) };
  const hecho = new Promise<void>((ok) => (r.fin = ok));
  const res = {
    writeHead(estado: number, cab: Record<string, string>) {
      r.estado = estado;
      r.cabeceras = cab;
    },
    end(texto: string) {
      r.cuerpo = texto;
      r.fin?.();
    },
  };
  return { r, res, hecho };
}

describe("reenviarARemoto", () => {
  it("manda el cuerpo tal cual al /v1/systemone remoto y devuelve su respuesta marcada como remota", async () => {
    const vistas: Array<{ url: string; body: string }> = [];
    const fetchFalso = async (url: string, init: { body: string }) => {
      vistas.push({ url, body: init.body });
      return { status: 200, text: async () => '{"answers":{"ok":{"noul":0.9}}}' };
    };
    const { r, res, hecho } = respuesta();
    reenviarARemoto(peticion('{"state":"s","questions":{}}') as never, res as never, "http://127.0.0.1:4471", 2000, fetchFalso as never);
    await hecho;
    expect(vistas).toEqual([{ url: "http://127.0.0.1:4471/v1/systemone", body: '{"state":"s","questions":{}}' }]);
    expect(r.estado).toBe(200);
    expect(r.cabeceras["X-Laya-Medio"]).toBe("remoto");
    expect(JSON.parse(r.cuerpo).answers.ok.noul).toBe(0.9);
  });

  it("si la Laya remota no contesta, responde 503 con el motivo", async () => {
    const fetchFalso = async () => {
      throw new Error("caído");
    };
    const { r, res, hecho } = respuesta();
    reenviarARemoto(peticion("{}") as never, res as never, "http://127.0.0.1:4471", 2000, fetchFalso as never);
    await hecho;
    expect(r.estado).toBe(503);
    expect(JSON.parse(r.cuerpo).motivo).toMatch(/remota no contestó/);
  });

  it("corta a los `plazoMs` si la remota se queda colgada", async () => {
    const fetchColgado = (_u: string, init: { signal: AbortSignal }) =>
      new Promise((_ok, mal) => init.signal.addEventListener("abort", () => mal(new Error("abortado"))));
    const { r, res, hecho } = respuesta();
    reenviarARemoto(peticion("{}") as never, res as never, "http://127.0.0.1:4471", 50, fetchColgado as never);
    await hecho;
    expect(r.estado).toBe(503);
  });
});
