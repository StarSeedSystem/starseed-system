import { describe, expect, it } from "vitest";
import {
  esperarHasta,
  pedirPermisoInicio,
  resultadoBluetooth,
  resultadoRedLocal,
  resultadoUbicacion,
  type DepsEjecutor,
} from "../permisos-inicio-ejecutor";

/** Reloj falso: `dormir` adelanta el tiempo, así nada espera de verdad. */
function falsos(parcial: Partial<DepsEjecutor> = {}, respuestas: Record<string, unknown[]> = {}) {
  let t = 0;
  const llamadas: string[] = [];
  const d: DepsEjecutor = {
    llamar: async (c) => {
      llamadas.push(c);
      const cola = respuestas[c];
      const valor = cola && cola.length > 1 ? cola.shift() : cola?.[0];
      return valor === undefined ? { ok: true } : { ok: true, valor: valor as never };
    },
    pedirMedio: null,
    pedirNotificaciones: null,
    dormir: async (ms) => {
      t += ms;
    },
    ahora: () => t,
    ...parcial,
  };
  return { d, llamadas };
}

describe("esperarHasta", () => {
  it("devuelve en cuanto se cumple", async () => {
    const { d } = falsos();
    let n = 0;
    const r = await esperarHasta(async () => ++n, (x) => x >= 3, d, { intervaloMs: 10, topeMs: 1000 });
    expect(r).toEqual({ valor: 3, agotado: false });
  });
  it("se rinde al tope sin colgarse", async () => {
    const { d } = falsos();
    const r = await esperarHasta(async () => 0, (x) => x > 0, d, { intervaloMs: 100, topeMs: 350 });
    expect(r.agotado).toBe(true);
  });
});

describe("traducciones de estado", () => {
  it("Bluetooth", () => {
    expect(resultadoBluetooth("encendida")).toBe("concedido");
    expect(resultadoBluetooth("apagada")).toBe("concedido");
    expect(resultadoBluetooth("sin-permiso")).toBe("denegado");
    expect(resultadoBluetooth("no-disponible")).toBe("no-disponible");
    expect(resultadoBluetooth("arrancando")).toBe("esperar");
    expect(resultadoBluetooth(null)).toBe("esperar");
  });
  it("ubicación", () => {
    expect(resultadoUbicacion("concedido")).toBe("concedido");
    expect(resultadoUbicacion("denegado")).toBe("denegado");
    expect(resultadoUbicacion("no-aplica")).toBe("no-disponible");
    expect(resultadoUbicacion("preguntar")).toBe("esperar");
  });
  it("red local", () => {
    expect(resultadoRedLocal({ antenas: [{ id: "wifi-local", estado: "viva" }] })).toBe("concedido");
    expect(resultadoRedLocal({ antenas: [{ id: "wifi-local", estado: "sin-permiso" }] })).toBe("denegado");
    expect(resultadoRedLocal({ antenas: [{ id: "wifi-local", estado: "apagada" }] })).toBe("omitido");
    expect(resultadoRedLocal(null)).toBe("omitido");
  });
});

describe("pedirPermisoInicio · macOS", () => {
  it("Bluetooth: arranca los gestores y espera a que macOS conteste", async () => {
    const { d, llamadas } = falsos({}, { ble_estado: [{ radio: "arrancando" }, { radio: "arrancando" }, { radio: "encendida" }] });
    expect(await pedirPermisoInicio("bluetooth", "macos", d)).toBe("concedido");
    expect(llamadas[0]).toBe("ble_activar");
  });
  it("Bluetooth: denegado en Ajustes del Sistema", async () => {
    const { d } = falsos({}, { ble_estado: [{ radio: "sin-permiso" }] });
    expect(await pedirPermisoInicio("bluetooth", "macos", d)).toBe("denegado");
  });
  it("Bluetooth: si el aviso sigue sin contestar al tope, queda omitido (no se cuelga)", async () => {
    const { d } = falsos({}, { ble_estado: [{ radio: "arrancando" }] });
    expect(await pedirPermisoInicio("bluetooth", "macos", d)).toBe("omitido");
  });
  it("micrófono y cámara usan getUserMedia; sin API, no disponible", async () => {
    const vistos: string[] = [];
    const { d } = falsos({
      pedirMedio: async (t) => {
        vistos.push(t);
        return t === "audio" ? "ok" : "denegado";
      },
    });
    expect(await pedirPermisoInicio("microfono", "macos", d)).toBe("concedido");
    expect(await pedirPermisoInicio("camara", "macos", d)).toBe("denegado");
    expect(vistos).toEqual(["audio", "video"]);
    expect(await pedirPermisoInicio("camara", "macos", falsos().d)).toBe("no-disponible");
  });
  it("notificaciones", async () => {
    const con = (r: string | null) => falsos({ pedirNotificaciones: async () => r }).d;
    expect(await pedirPermisoInicio("notificaciones", "macos", con("granted"))).toBe("concedido");
    expect(await pedirPermisoInicio("notificaciones", "macos", con("denied"))).toBe("denegado");
    expect(await pedirPermisoInicio("notificaciones", "macos", con("default"))).toBe("omitido");
  });
  it("ubicación de Wi-Fi: espera mientras el sistema pregunta", async () => {
    const { d } = falsos({}, { enlace_wifi_permiso: [{ permiso: "preguntar" }, { permiso: "concedido" }] });
    expect(await pedirPermisoInicio("ubicacion-wifi", "macos", d)).toBe("concedido");
  });
  it("una excepción dentro nunca sale: queda omitido", async () => {
    const { d } = falsos({
      llamar: async () => {
        throw new Error("boom");
      },
    });
    expect(await pedirPermisoInicio("bluetooth", "macos", d)).toBe("omitido");
  });
});

describe("pedirPermisoInicio · Android", () => {
  it("cercanos: primero Bluetooth y DESPUÉS el Wi-Fi directo (nunca a la vez)", async () => {
    const { d, llamadas } = falsos({}, { ble_estado: [{ radio: "sin-permiso" }, { radio: "sin-permiso" }, { radio: "encendida" }] });
    expect(await pedirPermisoInicio("cercanos", "android", d)).toBe("concedido");
    expect(llamadas.indexOf("ble_pedir_permiso")).toBeLessThan(llamadas.indexOf("enlace_wifi_permiso"));
    expect(llamadas.filter((c) => c === "enlace_wifi_permiso")).toHaveLength(1);
  });
  it("micrófono: ya concedido no vuelve a preguntar", async () => {
    const { d, llamadas } = falsos({}, { permisos_inicio_estado: [{ microfono: true }] });
    expect(await pedirPermisoInicio("microfono", "android", d)).toBe("concedido");
    expect(llamadas).not.toContain("permisos_inicio_pedir");
  });
  it("cámara: pide a Kotlin y espera a que el estado cambie", async () => {
    const { d, llamadas } = falsos({}, { permisos_inicio_estado: [{ camara: false }, { camara: false }, { camara: true }] });
    expect(await pedirPermisoInicio("camara", "android", d)).toBe("concedido");
    expect(llamadas).toContain("permisos_inicio_pedir");
  });
  it("instalar: si nunca lo concede, queda omitido (se abrió Ajustes y no volvió con él)", async () => {
    const { d } = falsos({}, { permisos_inicio_estado: [{ instalar_apps: false }] });
    expect(await pedirPermisoInicio("instalar", "android", d)).toBe("omitido");
  });
  it("sin el comando (APK anterior): no disponible", async () => {
    const { d } = falsos({
      llamar: async (c) => (c === "permisos_inicio_pedir" ? { ok: false, motivo: "x" } : { ok: true, valor: { microfono: false } as never }),
    });
    expect(await pedirPermisoInicio("microfono", "android", d)).toBe("no-disponible");
  });
});
