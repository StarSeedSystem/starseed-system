import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  conRespaldo, crearFuenteNativa, crearFuenteNavegador, errorDeNavegador, errorDeRespuesta, esFatal, motivoParaAviso,
  observarPermisoUbicacion, permisoVistaDeNativo, posicionDeFix, olvidarConfirmacionNativa, type FixNativo, type RespuestaFixNativa,
} from "../fuente-posicion";

const FIX: FixNativo = { lat: 40.416775123456, lon: -3.703790654321, precision_m: 4.7, altitud_m: 650.25, precision_altitud_m: 3.5, rumbo: 91, velocidad_ms: 1.25, t_ms: 1_700_000_000_123, fuente: "corelocation" };

type Llamada = (cmd: string, args?: Record<string, unknown>) => unknown;
function puente(responde: Llamada, disponible = true) {
  const llamadas: Array<[string, Record<string, unknown> | undefined]> = [];
  return {
    llamadas,
    disponible,
    llamar: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      llamadas.push([cmd, args]);
      const v = responde(cmd, args);
      if (v instanceof Error) return { ok: false as const, motivo: v.message };
      return { ok: true as const, valor: v as never };
    }),
  };
}
const pausa = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => olvidarConfirmacionNativa());

describe("posicionDeFix", () => {
  it("pasa precisión, altitud y hora SIN redondear", () => {
    const p = posicionDeFix(FIX)!;
    expect(p.coords.latitude).toBe(40.416775123456);
    expect(p.coords.longitude).toBe(-3.703790654321);
    expect(p.coords.accuracy).toBe(4.7);
    expect(p.coords.altitude).toBe(650.25);
    expect(p.coords.altitudeAccuracy).toBe(3.5);
    expect(p.coords.heading).toBe(91);
    expect(p.coords.speed).toBe(1.25);
    expect(p.timestamp).toBe(1_700_000_000_123);
    expect(p.fuente).toBe("corelocation");
  });
  it("sin precisión informada no inventa una", () => {
    expect(posicionDeFix({ lat: 1, lon: 2, t_ms: 5 })!.coords.accuracy).toBeNull();
  });
  it("rechaza coordenadas imposibles o sin hora", () => {
    expect(posicionDeFix({ lat: 91, lon: 0, t_ms: 1 })).toBeNull();
    expect(posicionDeFix({ lat: 0, lon: 181, t_ms: 1 })).toBeNull();
    expect(posicionDeFix({ lat: Number.NaN, lon: 0, t_ms: 1 })).toBeNull();
    expect(posicionDeFix({ lat: 0, lon: 0 } as unknown as FixNativo)).toBeNull();
    expect(posicionDeFix(null)).toBeNull();
  });
});

describe("errores: «no diste permiso» ≠ «el aparato no pudo»", () => {
  it("denegado → code 1 y el texto del sistema con cómo cambiarlo", () => {
    const e = errorDeRespuesta({ ok: false, error: { codigo: "denegado", motivo: "No diste permiso de ubicación a StarSeed. Para cambiarlo: Ajustes del Sistema › Privacidad y seguridad › Localización." } });
    expect(e.code).toBe(1);
    expect(e.message).toContain("Privacidad y seguridad › Localización");
    expect(esFatal(e.codigo)).toBe(true);
  });
  it("servicios apagados y sin fijar → code 2; sin fijar no es fatal", () => {
    expect(errorDeRespuesta({ ok: false, error: { codigo: "servicios-apagados", motivo: "x" } }).code).toBe(2);
    const sf = errorDeRespuesta({ ok: false, error: { codigo: "sin-fijar", motivo: "y" } });
    expect(sf.code).toBe(2);
    expect(esFatal(sf.codigo)).toBe(false);
  });
  it("un código desconocido NO se disfraza de otro", () => {
    expect(errorDeRespuesta({ ok: false, error: { codigo: "inventado" as never, motivo: "z" } }).codigo).toBe("no-disponible");
    expect(errorDeRespuesta(null).codigo).toBe("no-disponible");
  });
  it("navegador: 1 = permiso, 2 = no pudo, 3 = tiempo, con textos distintos", () => {
    const a = errorDeNavegador({ code: 1 }), b = errorDeNavegador({ code: 2 }), c = errorDeNavegador({ code: 3 });
    expect([a.code, b.code, c.code]).toEqual([1, 2, 3]);
    expect(a.message).toContain("No diste permiso");
    expect(b.message).toContain("no pudo dar su posición");
    expect(new Set([a.message, b.message, c.message]).size).toBe(3);
  });
  it("motivoParaAviso encaja tras «…de este aparato:» sin doble punto", () => {
    expect(motivoParaAviso("No diste permiso. Para cambiarlo: Ajustes.")).toBe("no diste permiso. Para cambiarlo: Ajustes");
  });
  it("permiso de la vista", () => {
    expect(permisoVistaDeNativo("concedido")).toBe("concedido");
    expect(permisoVistaDeNativo("aproximado")).toBe("concedido");
    expect(permisoVistaDeNativo("restringido")).toBe("denegado");
    expect(permisoVistaDeNativo("sin-preguntar")).toBe("por-pedir");
    expect(permisoVistaDeNativo("no-disponible")).toBe("desconocido");
  });
});

describe("fuente nativa", () => {
  it("getCurrentPosition pide con `pedir: true` (es respuesta a un botón) y entrega la medida tal cual", async () => {
    const p = puente(() => ({ ok: true, fix: FIX } satisfies RespuestaFixNativa));
    const ok = vi.fn();
    crearFuenteNativa(p).getCurrentPosition(ok);
    await pausa();
    expect(p.llamadas[0]).toEqual(["ubicacion_ahora", { pedir: true }]);
    expect(ok.mock.calls[0][0].coords.accuracy).toBe(4.7);
    expect(ok.mock.calls[0][0].timestamp).toBe(1_700_000_000_123);
  });
  it("getCurrentPosition entrega el error del sistema con su código", async () => {
    const p = puente(() => ({ ok: false, error: { codigo: "denegado", motivo: "No diste permiso…" } }));
    const err = vi.fn();
    crearFuenteNativa(p).getCurrentPosition(vi.fn(), err);
    await pausa();
    expect(err.mock.calls[0][0].codigo).toBe("denegado");
    expect(err.mock.calls[0][0].code).toBe(1);
  });
  it("watchPosition NUNCA pregunta (no manda `ahora`), vigila, lee lo último y no repite la misma medida", async () => {
    vi.useFakeTimers();
    let t = 100;
    const p = puente((cmd) => (cmd === "ubicacion_ultima" ? { ok: true, fix: { ...FIX, t_ms: t } } : true));
    const ok = vi.fn();
    const f = crearFuenteNativa(p);
    const id = f.watchPosition(ok);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(1000); // misma medida: no se repite
    expect(ok).toHaveBeenCalledTimes(1);
    t = 200;
    await vi.advanceTimersByTimeAsync(1000);
    expect(ok).toHaveBeenCalledTimes(2);
    expect(p.llamadas.some(([c]) => c === "ubicacion_ahora")).toBe(false);
    expect(p.llamadas[0][0]).toBe("ubicacion_vigilar");
    f.clearWatch(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.llamadas.at(-1)![0]).toBe("ubicacion_parar");
    const n = p.llamadas.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(p.llamadas.length).toBe(n); // ya no sondea
    vi.useRealTimers();
  });
  it("watchPosition: sin permiso lo dice y se detiene; sin fijar solo avisa una vez a los 30 s", async () => {
    vi.useFakeTimers();
    const sinPermiso = puente((c) => (c === "ubicacion_ultima" ? { ok: false, error: { codigo: "sin-preguntar", motivo: "Aún no diste permiso" } } : true));
    const err = vi.fn();
    crearFuenteNativa(sinPermiso).watchPosition(vi.fn(), err);
    await vi.advanceTimersByTimeAsync(3000);
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0].codigo).toBe("sin-preguntar");
    const sinFijar = puente((c) => (c === "ubicacion_ultima" ? { ok: false, error: { codigo: "sin-fijar", motivo: "no pudo" } } : true));
    const err2 = vi.fn();
    crearFuenteNativa(sinFijar, () => Date.now()).watchPosition(vi.fn(), err2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(err2).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(err2).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(err2).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("respaldo al navegador", () => {
  const geoFalsa = () => {
    const g = {
      getCurrentPosition: vi.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 9 }, timestamp: 77 })),
      watchPosition: vi.fn((ok: (p: unknown) => void) => { ok({ coords: { latitude: 3, longitude: 4, accuracy: 8 }, timestamp: 88 }); return 5; }),
      clearWatch: vi.fn(),
    };
    return g;
  };
  it("el navegador pasa la precisión y la hora de la medida", () => {
    const g = geoFalsa();
    const ok = vi.fn();
    crearFuenteNavegador(g as never).getCurrentPosition(ok);
    expect(ok.mock.calls[0][0].coords.accuracy).toBe(9);
    expect(ok.mock.calls[0][0].timestamp).toBe(77);
    expect(ok.mock.calls[0][0].fuente).toBe("navegador");
  });
  it("si la app nativa dice «no disponible» (APK anterior), se usa el navegador", async () => {
    const p = puente((c) => (c === "ubicacion_ahora" || c === "ubicacion_ultima" ? { ok: false, error: { codigo: "no-disponible", motivo: "actualiza" } } : false));
    const g = geoFalsa();
    const f = conRespaldo(crearFuenteNativa(p), crearFuenteNavegador(g as never));
    const ok = vi.fn();
    f.getCurrentPosition(ok);
    await pausa();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(g.getCurrentPosition).toHaveBeenCalledTimes(1);
    const okW = vi.fn();
    const id = f.watchPosition(okW);
    await pausa(); await pausa();
    expect(g.watchPosition).toHaveBeenCalledTimes(1);
    f.clearWatch(id);
    expect(g.clearWatch).toHaveBeenCalledWith(5);
  });
  it("un error de permiso de la app NO cae al navegador (no se esconde la negativa)", async () => {
    const p = puente(() => ({ ok: false, error: { codigo: "denegado", motivo: "No diste permiso" } }));
    const g = geoFalsa();
    const err = vi.fn();
    conRespaldo(crearFuenteNativa(p), crearFuenteNavegador(g as never)).getCurrentPosition(vi.fn(), err);
    await pausa();
    expect(err).toHaveBeenCalledTimes(1);
    expect(g.getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("observarPermisoUbicacion", () => {
  it("en la app nativa lee el permiso del sistema y no pregunta nada", async () => {
    const p = puente(() => ({ version: 1, plataforma: "macos", disponible: true, permiso: "denegado", servicios: true, vigilando: false, donde_cambiarlo: "x" }));
    const cb = vi.fn();
    const baja = observarPermisoUbicacion(cb, p);
    await pausa(); await pausa();
    expect(cb).toHaveBeenCalledWith("denegado");
    expect(p.llamadas.every(([c]) => c === "ubicacion_estado")).toBe(true);
    baja();
  });
});
