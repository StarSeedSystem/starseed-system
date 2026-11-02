// @vitest-environment jsdom
/**
 * AV1011B · pruebas del editor del avatar en tiempo real. Sin red ni disco: el almacén, el canal
 * de la escena y Astraura son dobles inyectados; el reloj lo pone cada prueba (el `ahora` va por
 * argumento, como el contrato §3 manda: pureza con reloj inyectado).
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "../../adn/adn";
import { cambiosDeRespuestaAstraura, cambioDeDeslizador, instruccionAstraura, useEditorAvatar, valor01DeCC, type DepsEditorAvatar } from "../use-editor-avatar";

const base = (): AdnAvatar => adnPorDefecto("adn-test", "Prueba", { tipo: "perfil", id: "p1" });
const guardar = vi.fn(async () => undefined);
const emitir = vi.fn();
const retry = (r: string) => vi.fn(async () => r);
function deps(o: Partial<DepsEditorAvatar> = {}): DepsEditorAvatar {
  return { guardar, emitir, ...o };
}

describe("valor01DeCC y cambioDeDeslizador", () => {
  it("0 → 0, 127 → 1, 64 → 0,504; fuera de rango o no entero, null", () => {
    expect(valor01DeCC(0)).toBe(0);
    expect(valor01DeCC(127)).toBe(1);
    expect(valor01DeCC(64)).toBe(0.504);
    expect(valor01DeCC(128)).toBeNull();
    expect(valor01DeCC(-1)).toBeNull();
    expect(valor01DeCC(1.5)).toBeNull();
    expect(valor01DeCC("64")).toBeNull();
  });
  it("morfología, aura y movimiento mapean al cambio correcto", () => {
    expect(cambioDeDeslizador(0, "altura")).toEqual({ op: "morfologia", clave: "altura", valor: 0 });
    expect(cambioDeDeslizador(127, "aura.intensidad")).toEqual({ op: "aura", campo: "intensidad", valor: 1 });
    expect(cambioDeDeslizador(127, "aura.tono")).toEqual({ op: "aura", campo: "tono", valor: 359 });
    expect(cambioDeDeslizador(64, "movimiento.ritmo")).toEqual({ op: "movimiento", campo: "ritmo", valor: 0.504 });
  });
  it("clave desconocida, null", () => {
    expect(cambioDeDeslizador(64, "morfologia.altura" as never)).toBeNull();
  });
});

describe("Astraura: instrucción y filtro de la respuesta", () => {
  it("la instrucción pide SOLO una lista JSON y lleva la frase", () => {
    const ins = instruccionAstraura("ponle alas de mariposa");
    expect(ins).toContain("ponle alas de mariposa");
    expect(ins).toContain("SOLO una lista JSON");
  });
  it("extrae la lista aunque venga en fences o con prosa, y solo pasa los válidos", () => {
    const r = cambiosDeRespuestaAstraura('```json\n[{"op":"aura","campo":"intensidad","valor":1},{"op":"morfologia","clave":"noexiste","valor":1},{"op":"desconocido","valor":1}]\n``` bla bla');
    expect(r).toEqual([{ op: "aura", campo: "intensidad", valor: 1 }]);
  });
  it("sin lista JSON ni objeto suelto, devuelve vacío sin lanzar", () => {
    expect(cambiosDeRespuestaAstraura("No puedo hacer eso.")).toEqual([]);
    expect(cambiosDeRespuestaAstraura('{"op":"aura"}')).toEqual([]);
    expect(cambiosDeRespuestaAstraura(null)).toEqual([]);
  });
});

describe("useEditorAvatar", () => {
  it("T1 · aplicarCambio aplica al instante y sube la revisión, sin tocar el guardado", async () => {
    const { result } = renderHook(() => useEditorAvatar(base(), deps()));
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.9 }, 1000); });
    expect(result.current.adn.morfologia.altura).toBe(0.9);
    expect(result.current.adn.rev).toBe(1);
    expect(result.current.puedeDeshacer).toBe(true);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("T2 · deshacer y rehacer van y vuelven por la misma pila", async () => {
    const { result } = renderHook(() => useEditorAvatar(base(), deps()));
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.9 }, 1000); });
    await act(async () => { result.current.aplicarCambio({ op: "material", slot: "ojos", campo: "color", valor: "#00ff00" }, 1100); });
    act(() => { result.current.deshacer(); });
    expect(result.current.adn.rev).toBe(1);
    expect(result.current.puedeRehacer).toBe(true);
    act(() => { result.current.rehacer(); });
    expect(result.current.adn.materiales.ojos?.color).toBe("#00ff00");
    expect(result.current.adn.rev).toBe(2);
  });

  it("T3 · la pila de deshacer tiene tope 50", async () => {
    const { result } = renderHook(() => useEditorAvatar(base(), deps()));
    for (let i = 0; i < 55; i++) {
      await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: i / 100 }, 1000 + i); });
    }
    for (let i = 0; i < 50; i++) act(() => { result.current.deshacer(); });
    expect(result.current.puedeDeshacer).toBe(false);
    expect(result.current.adn.morfologia.altura).toBe(0.04);
    expect(result.current.adn.rev).toBe(5);
    expect(result.current.puedeRehacer).toBe(true);
  });

  it("T4 · agrupa los cambios bajo su clave antes de emitir (60 toques de un deslizador viajan como 1)", async () => {
    const { result } = renderHook(() => useEditorAvatar(base(), deps()));
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.6 }, 1000); });
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.8 }, 1050); });
    await act(async () => { result.current.aplicarCambio({ op: "material", slot: "ojos", campo: "color", valor: "#00ff00" }, 1060); });
    const l = result.current.emitirLotes(1100, 2);
    expect(l).toEqual([
      { op: "morfologia", clave: "altura", valor: 0.8 },
      { op: "material", slot: "ojos", campo: "color", valor: "#00ff00" },
    ]);
    expect(emitir).toHaveBeenLastCalledWith(l, 3);
  });

  it("T5 · respeta el ritmo de emisión (10 Hz con poca gente)", async () => {
    const { result } = renderHook(() => useEditorAvatar(base(), deps()));
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.6 }, 1000); });
    expect(result.current.emitirLotes(1000, 2)).toEqual([{ op: "morfologia", clave: "altura", valor: 0.6 }]);
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.7 }, 1010); });
    expect(result.current.emitirLotes(1050, 2)).toBeNull();
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.8 }, 1060); });
    const l = result.current.emitirLotes(1100, 2);
    expect(l).toEqual([{ op: "morfologia", clave: "altura", valor: 0.8 }]);
    expect(emitir).toHaveBeenLastCalledWith([{ op: "morfologia", clave: "altura", valor: 0.8 }], 3);
  });

  it("T6 · sin nadie mirando no emite nada y ni siquiera deja pendiente", async () => {
    const { result } = renderHook(() => useEditorAvatar(base(), deps()));
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.6 }, 1000); });
    expect(result.current.emitirLotes(1000, 0)).toBeNull();
    expect(emitir).not.toHaveBeenCalled();
    expect(result.current.emitirLotes(1200, 3)).toBeNull();
  });

  it("T7 · guarda tras 5 s de calma y como mucho una vez cada 30 s", async () => {
    const guardarSpy = vi.fn(async () => undefined);
    const { result } = renderHook(() => useEditorAvatar(base(), { guardar: guardarSpy }));
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.6 }, 1000); });
    await act(async () => { expect(await result.current.tickGuardar(3000)).toBe(false); });
    expect(guardarSpy).not.toHaveBeenCalled();
    await act(async () => { expect(await result.current.tickGuardar(6000)).toBe(true); });
    expect(guardarSpy).toHaveBeenCalledTimes(1);
    expect(guardarSpy.mock.calls[0][0].rev).toBe(1);
    await act(async () => { result.current.aplicarCambio({ op: "aura", campo: "intensidad", valor: 1 }, 7000); });
    await act(async () => { expect(await result.current.tickGuardar(12000)).toBe(false); });
    await act(async () => { expect(await result.current.tickGuardar(36000)).toBe(true); });
    expect(guardarSpy).toHaveBeenCalledTimes(2);
    expect(guardarSpy.mock.calls[1][0].aura.intensidad).toBe(1);
  });

  it("T8 · si el aparato no dejó guardar, avisa y lo vuelve a intentar tras la calma", async () => {
    const guardarSpy = vi.fn(async () => { throw new Error("almacenamiento lleno"); });
    const { result } = renderHook(() => useEditorAvatar(base(), { guardar: guardarSpy }));
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.6 }, 1000); });
    await act(async () => { expect(await result.current.tickGuardar(6000)).toBe(false); });
    expect(result.current.falloGuardado).toContain("almacenamiento lleno");
    await act(async () => { expect(await result.current.tickGuardar(36000)).toBe(false); });
    expect(guardarSpy).toHaveBeenCalledTimes(2);
  });

  it("T9 · si está cerrando el editor guarda aunque no llegue la calma", async () => {
    const guardarSpy = vi.fn(async () => undefined);
    const { result } = renderHook(() => useEditorAvatar(base(), { guardar: guardarSpy }));
    await act(async () => { result.current.aplicarCambio({ op: "morfologia", clave: "altura", valor: 0.6 }, 1000); });
    await act(async () => { expect(await result.current.tickGuardar(1100, true)).toBe(true); });
    expect(guardarSpy).toHaveBeenCalledTimes(1);
  });

  it("T10 · el dictado aplica lo local y trata lo que va a Astraura con sanearCambio", async () => {
    const pedir = retry('```json\n[{"op":"aura","campo":"intensidad","valor":0.9},{"op":"morfologia","clave":"noexiste","valor":1}]\n```');
    const { result } = renderHook(() => useEditorAvatar(base(), deps({ pedirAstraura: pedir })));
    let r!: Awaited<ReturnType<typeof result.current.aplicarFrase>>;
    await act(async () => { r = await result.current.aplicarFrase("pelo azul, ponle alas de mariposa"); });
    expect(result.current.adn.materiales.cabello?.color).toBe("#007fff");
    expect(r.sinEntender).toEqual(["ponle alas de mariposa"]);
    expect(r.desdeAstraura).toBe(1);
    expect(result.current.adn.aura.intensidad).toBe(0.9);
    expect(r.aviso).toBeUndefined();
  });

  it("T11 · sin modelo, lo que no entendió queda dicho con su motivo y no se aplica nada", async () => {
    const { result } = renderHook(() => useEditorAvatar(base(), deps()));
    let r!: Awaited<ReturnType<typeof result.current.aplicarFrase>>;
    await act(async () => { r = await result.current.aplicarFrase("pelo azul, ponle alas de mariposa"); });
    expect(result.current.adn.materiales.cabello?.color).toBe("#007fff");
    expect(r.sinEntender).toEqual(["ponle alas de mariposa"]);
    expect(r.desdeAstraura).toBe(0);
    expect(r.aviso).toMatch(/sin modelo conectado/);
  });

  it("T12 · un CC de MIDI mueve el deslizador mapeado en el ADN", async () => {
    const { result } = renderHook(() => useEditorAvatar(base(), deps()));
    await act(async () => { expect(result.current.aplicarMidi(100, "aura.intensidad")).toBe(true); });
    expect(result.current.adn.aura.intensidad).toBe(Math.round((100 / 127) * 1000) / 1000);
    expect(result.current.puedeDeshacer).toBe(true);
  });

});
