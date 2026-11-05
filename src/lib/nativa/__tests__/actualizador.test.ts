/**
 * (1105 · VER1105K) Actualizador de escritorio sobre el updater de Tauri que ya existe.
 * `invoke` y `listen` simulados: fuera de Tauri, sin actualización, con actualización y con error.
 */

import { describe, expect, it, vi } from "vitest";
import {
  actualizarEscritorio,
  COMANDOS_ACTUALIZADOR,
  EVENTO_ACTUALIZADOR,
  leerComprobacion,
  reiniciarParaActualizar,
  SOLO_ESCRITORIO,
} from "../actualizador";
import { crearPuente } from "../puente";

function tauriFalso(respuestas: Record<string, (emitir: (p: unknown) => void) => unknown>) {
  let oyente: ((e: { payload: unknown }) => void) | null = null;
  const quitar = vi.fn();
  const invoke = vi.fn(async (cmd: string) => {
    const r = respuestas[cmd];
    if (!r) throw new Error(`comando desconocido: ${cmd}`);
    return r((p) => oyente?.({ payload: p }));
  });
  const listen = vi.fn(async (evento: string, cb: (e: { payload: unknown }) => void) => {
    expect(evento).toBe(EVENTO_ACTUALIZADOR);
    oyente = cb;
    return quitar;
  });
  return { tauri: { core: { invoke }, event: { listen } }, invoke, listen, quitar };
}

describe("actualizarEscritorio", () => {
  it("fuera de la app nativa responde con un motivo y no lanza", async () => {
    const r = await actualizarEscritorio(undefined, crearPuente(null));
    expect(r).toEqual({ ok: false, motivo: SOLO_ESCRITORIO });
    expect(await reiniciarParaActualizar(crearPuente(null))).toEqual({ ok: false, motivo: SOLO_ESCRITORIO });
  });

  it("sin versión nueva: nada que reiniciar", async () => {
    const f = tauriFalso({
      check_update: () => "Ya estás en la última versión.",
      estado_actualizacion: () => ({ fase: "al-dia", version: null, pendiente_reinicio: false }),
    });
    const r = await actualizarEscritorio(undefined, crearPuente(f.tauri));
    expect(r).toEqual({ ok: true, valor: { listaParaReiniciar: false, version: null, mensaje: "Ya estás en la última versión." } });
    expect(f.invoke).not.toHaveBeenCalledWith(COMANDOS_ACTUALIZADOR.reiniciar, undefined);
    expect(f.listen).not.toHaveBeenCalled();
  });

  it("con versión nueva: cuenta el progreso, queda lista para reiniciar y suelta el oyente", async () => {
    const f = tauriFalso({
      check_update: (emitir) => {
        emitir({ fase: "descargando", version: "0.4.0", descargado: 50, total: 100 });
        emitir({ fase: "otra-cosa" });
        emitir({ fase: "lista", version: "0.4.0" });
        return "Actualización a la versión 0.4.0 descargada. Revisa el aviso de la app para reiniciar.";
      },
      estado_actualizacion: () => ({ fase: "lista", version: "0.4.0", pendiente_reinicio: true }),
    });
    const progreso = vi.fn();
    const r = await actualizarEscritorio(progreso, crearPuente(f.tauri));
    expect(r.ok && r.valor.listaParaReiniciar).toBe(true);
    expect(r.ok && r.valor.version).toBe("0.4.0");
    expect(progreso).toHaveBeenCalledTimes(2);
    expect(progreso.mock.calls[0][0]).toMatchObject({ fase: "descargando", version: "0.4.0", descargado: 50, total: 100 });
    expect(f.quitar).toHaveBeenCalledTimes(1);
    expect(f.invoke).not.toHaveBeenCalledWith(COMANDOS_ACTUALIZADOR.reiniciar, undefined);
  });

  it("si la app falla, devuelve su motivo y también suelta el oyente", async () => {
    const f = tauriFalso({
      check_update: () => {
        throw new Error("sin red con el servidor de actualizaciones");
      },
    });
    const r = await actualizarEscritorio(() => {}, crearPuente(f.tauri));
    expect(r).toEqual({ ok: false, motivo: "sin red con el servidor de actualizaciones" });
    expect(f.quitar).toHaveBeenCalledTimes(1);
  });

  it("reiniciar llama al comando que ya existe", async () => {
    const f = tauriFalso({ reiniciar_para_actualizar: () => null });
    expect(await reiniciarParaActualizar(crearPuente(f.tauri))).toEqual({ ok: true, valor: null });
    expect(f.invoke).toHaveBeenCalledWith(COMANDOS_ACTUALIZADOR.reiniciar, undefined);
  });
});

describe("leerComprobacion", () => {
  it("lee la versión del texto o, si no, del último estado", () => {
    expect(leerComprobacion("Actualización a la versión 1.2.3 descargada.").version).toBe("1.2.3");
    expect(leerComprobacion("Lista.", { fase: "lista", version: "2.0.0" })).toEqual({
      listaParaReiniciar: true,
      version: "2.0.0",
      mensaje: "Lista.",
    });
    expect(leerComprobacion("Ya estás en la última versión.", { fase: "al-dia", version: "0.3.0" }).version).toBeNull();
  });

  it("un reinicio pendiente cuenta aunque el texto no lo diga", () => {
    expect(leerComprobacion("", { fase: "", pendiente_reinicio: true }).listaParaReiniciar).toBe(true);
    expect(leerComprobacion("", null).listaParaReiniciar).toBe(false);
  });
});
