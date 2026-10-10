import { describe, expect, it, vi } from "vitest";
import { aBytes, crearPuente, SOLO_NATIVA } from "../puente";

function falso(respuestas: Record<string, unknown> = {}) {
  const llamadas: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
  const oyentes = new Map<string, (e: { payload: unknown }) => void>();
  const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    llamadas.push({ cmd, args });
    const r = respuestas[cmd];
    if (r instanceof Error) throw r;
    if (typeof r === "string" && r.startsWith("FALLA:")) throw r.slice(6);
    return r;
  });
  const listen = vi.fn(async (ev: string, cb: (e: { payload: unknown }) => void) => {
    oyentes.set(ev, cb);
    return () => oyentes.delete(ev);
  });
  return { tauri: { core: { invoke }, event: { listen } }, llamadas, oyentes };
}

describe("puente nativo", () => {
  it("en la web normal no finge: dice que es solo de la app", async () => {
    const p = crearPuente(null);
    expect(p.disponible).toBe(false);
    expect(await p.antenasEstado()).toEqual({ ok: false, motivo: SOLO_NATIVA });
    const quitar = await p.alCambiarAntenas(() => {});
    expect(typeof quitar).toBe("function");
  });

  it("llama al comando de Rust con los argumentos que espera", async () => {
    const f = falso({ fondo_fijar: { activo: true }, carpetas_nas: { ruta: "/x", nas: true } });
    const p = crearPuente(f.tauri);
    expect(p.disponible).toBe(true);
    await p.fondoFijar(true);
    await p.carpetasNas("/x", true);
    await p.serieAbrir("/dev/ttyACM0");
    await p.serieEscribir(new Uint8Array([1, 2, 255]));
    expect(f.llamadas).toEqual([
      { cmd: "fondo_fijar", args: { activo: true } },
      { cmd: "carpetas_nas", args: { ruta: "/x", activo: true } },
      { cmd: "serie_abrir", args: { ruta: "/dev/ttyACM0", baudios: null } },
      { cmd: "serie_escribir", args: { datos: [1, 2, 255] } },
    ]);
  });

  it("un error de Rust llega como motivo legible, nunca como excepción", async () => {
    const f = falso({ carpetas_conceder: "FALLA:En Android las carpetas llegarán con SAF" , capas_estado: new Error("disco") });
    const p = crearPuente(f.tauri);
    expect(await p.carpetasConceder("lectura")).toEqual({ ok: false, motivo: "En Android las carpetas llegarán con SAF" });
    expect(await p.capasEstado()).toEqual({ ok: false, motivo: "disco" });
  });

  it("nas_leer llega como ArrayBuffer y se entrega como bytes", async () => {
    const f = falso({ nas_leer: new Uint8Array([7, 8, 9]).buffer });
    const r = await crearPuente(f.tauri).nasLeer("/datos/a.txt", 0, 3);
    expect(r.ok && Array.from(r.valor)).toEqual([7, 8, 9]);
  });

  it("los bytes de la radio llegan por el evento y vacío no se reenvía", async () => {
    const f = falso();
    const p = crearPuente(f.tauri);
    const recibidos: number[][] = [];
    await p.alRecibirSerie((b) => recibidos.push(Array.from(b)));
    f.oyentes.get("starseed://serie")?.({ payload: { datos: [0x94, 0xc3, 0, 2] } });
    f.oyentes.get("starseed://serie")?.({ payload: { datos: [] } });
    expect(recibidos).toEqual([[0x94, 0xc3, 0, 2]]);
  });

  it("aBytes rechaza lo que no son bytes", () => {
    expect(aBytes([1, 300])).toBeNull();
    expect(aBytes("hola")).toBeNull();
    expect(Array.from(aBytes([0, 255]) ?? [])).toEqual([0, 255]);
  });
});
