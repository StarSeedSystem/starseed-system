import { afterEach, describe, expect, it, vi } from "vitest";
import {
  esOrigenLocal,
  obtenerRadioLocal,
  radioLocalEnCache,
  reiniciarRadioLocalCliente,
} from "../radio-local-cliente";
import type { RadioLocal } from "@/lib/mando/radio-local-tipos";

const RADIO: RadioLocal = { v: 1, at: 1, wifi: null, bluetooth: { encendido: true, chipset: null, transporte: null, dispositivos: [] } };

function simularFetch(respuesta: () => Response) {
  const f = vi.fn(async () => respuesta());
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => {
  vi.unstubAllGlobals();
  reiniciarRadioLocalCliente();
});

describe("radio-local-cliente", () => {
  it("reconoce los orígenes locales", () => {
    expect(esOrigenLocal("localhost")).toBe(true);
    expect(esOrigenLocal("127.0.0.1")).toBe(true);
    expect(esOrigenLocal("[::1]")).toBe(true);
    expect(esOrigenLocal("starseed-os.vercel.app")).toBe(false);
  });

  it("fuera de localhost no hace ninguna petición", async () => {
    const f = simularFetch(() => Response.json({ ok: true, radio: RADIO }));
    expect(await obtenerRadioLocal({ host: "starseed-os.vercel.app" })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("guarda la respuesta 60 s y no vuelve a pedir dentro de ese plazo", async () => {
    const f = simularFetch(() => Response.json({ ok: true, radio: RADIO }));
    expect(await obtenerRadioLocal({ host: "localhost", ahora: 0 })).toEqual(RADIO);
    expect(await obtenerRadioLocal({ host: "localhost", ahora: 59_000 })).toEqual(RADIO);
    expect(f).toHaveBeenCalledTimes(1);
    await obtenerRadioLocal({ host: "localhost", ahora: 61_000 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(radioLocalEnCache()).toEqual(RADIO);
  });

  it("un 404 se recuerda 10 minutos sin insistir", async () => {
    const f = simularFetch(() => new Response("no", { status: 404 }));
    expect(await obtenerRadioLocal({ host: "localhost", ahora: 0 })).toBeNull();
    expect(await obtenerRadioLocal({ host: "localhost", ahora: 5 * 60_000 })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    await obtenerRadioLocal({ host: "localhost", ahora: 11 * 60_000 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("una respuesta sin radio no se toma por buena", async () => {
    simularFetch(() => Response.json({ ok: false, motivo: "solo macOS" }));
    expect(await obtenerRadioLocal({ host: "localhost", ahora: 0 })).toBeNull();
  });
});
