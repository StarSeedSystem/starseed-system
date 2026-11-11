import { describe, expect, it } from "vitest";
import {
  esperarHasta,
  pedirPermisoInicio,
  resultadoBluetooth,
  resultadoLlamadas,
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
  it("llamadas (LLA1108D): Android 13 o anterior no pide nada", async () => {
    const { d, llamadas } = falsos({}, { llamada_nativa_capacidades: [{ nativa: true, pantalla_completa: "no-aplica" }] });
    expect(await pedirPermisoInicio("llamadas", "android", d)).toBe("concedido");
    expect(llamadas).not.toContain("llamada_nativa_permiso");
  });
  it("llamadas: Android 14 abre Ajustes y espera a que vuelva con el permiso", async () => {
    const { d, llamadas } = falsos({}, { llamada_nativa_capacidades: [{ nativa: true, pantalla_completa: "denegado" }, { nativa: true, pantalla_completa: "denegado" }, { nativa: true, pantalla_completa: "concedido" }] });
    expect(await pedirPermisoInicio("llamadas", "android", d)).toBe("concedido");
    expect(llamadas.filter((c) => c === "llamada_nativa_permiso")).toHaveLength(1);
  });
  it("llamadas: si nunca lo concede queda omitido; sin el módulo (APK viejo), no disponible", async () => {
    const nunca = falsos({}, { llamada_nativa_capacidades: [{ nativa: true, pantalla_completa: "denegado" }] });
    expect(await pedirPermisoInicio("llamadas", "android", nunca.d)).toBe("omitido");
    const viejo = falsos({ llamar: async () => ({ ok: false, motivo: "x" }) });
    expect(await pedirPermisoInicio("llamadas", "android", viejo.d)).toBe("no-disponible");
  });
  it("llamadas: la traducción del estado", () => {
    expect(resultadoLlamadas({ nativa: true, pantalla_completa: "concedido" })).toBe("concedido");
    expect(resultadoLlamadas({ nativa: true, pantalla_completa: "denegado" })).toBe("esperar");
    expect(resultadoLlamadas({ nativa: false, pantalla_completa: "denegado" })).toBe("no-disponible");
    expect(resultadoLlamadas(null)).toBe("no-disponible");
  });
  it("sin el comando (APK anterior): no disponible", async () => {
    const { d } = falsos({
      llamar: async (c) => (c === "permisos_inicio_pedir" ? { ok: false, motivo: "x" } : { ok: true, valor: { microfono: false } as never }),
    });
    expect(await pedirPermisoInicio("microfono", "android", d)).toBe("no-disponible");
  });
});

/* ══════════════════ PER1111S: estado real, avisos del sistema y pantallas de Ajustes ══════════════════ */

import { leerEstadosSistema, panelAndroid } from "../permisos-inicio-ejecutor";

describe("leerEstadosSistema (PER1111S)", () => {
  it("toma lo que lee Rust y completa con lo que solo sabe la web (arranque, notificaciones)", async () => {
    const { d } = falsos(
      { notificacionesConcedidas: async () => true },
      {
        permisos_sistema_estado: [{ plataforma: "macos", sesion: "", estados: { pantalla: "no-concedido", accesibilidad: "concedido", raro: "x" } }],
        fondo_estado: [{ arranque_con_sistema: false }],
      },
    );
    const l = await leerEstadosSistema("macos", d);
    expect(l.plataforma).toBe("macos");
    expect(l.estados).toEqual({ pantalla: "no-concedido", accesibilidad: "concedido", arranque: "no-concedido", notificaciones: "concedido" });
  });
  it("una app anterior (sin el comando) no inventa nada", async () => {
    const d: DepsEjecutor = { ...falsos().d, llamar: async () => ({ ok: false, motivo: "no existe" }) };
    expect((await leerEstadosSistema("macos", d)).estados).toEqual({});
  });
  it("Linux devuelve su sesión", async () => {
    const { d } = falsos({}, { permisos_sistema_estado: [{ plataforma: "linux", sesion: "wayland", estados: {} }] });
    expect((await leerEstadosSistema("linux-wayland", d)).sesion).toBe("wayland");
  });
});

describe("pedirPermisoInicio · macOS pantalla y control (PER1111S)", () => {
  it("Accesibilidad: aviso del sistema y espera a que la persona lo active en Ajustes", async () => {
    const { d, llamadas } = falsos(
      {},
      {
        permisos_sistema_pedir: [false],
        permisos_sistema_estado: [{ estados: { accesibilidad: "no-concedido" } }, { estados: { accesibilidad: "no-concedido" } }, { estados: { accesibilidad: "concedido" } }],
      },
    );
    expect(await pedirPermisoInicio("accesibilidad", "macos", d)).toBe("concedido");
    expect(llamadas[0]).toBe("permisos_sistema_pedir");
    expect(llamadas).not.toContain("permisos_sistema_abrir");
  });
  it("ya concedido: no se espera", async () => {
    const { d } = falsos({}, { permisos_sistema_pedir: [true] });
    expect(await pedirPermisoInicio("pantalla", "macos", d)).toBe("concedido");
  });
  it("si la persona no vuelve con él, se da por omitido (sin insistir)", async () => {
    const { d } = falsos({}, { permisos_sistema_pedir: [false], permisos_sistema_estado: [{ estados: { pantalla: "no-concedido" } }] });
    expect(await pedirPermisoInicio("pantalla", "macos", d)).toBe("omitido");
  });
  it("con «abrir-ajustes» se abre su pantalla exacta y se nota la concesión al volver", async () => {
    const { d, llamadas } = falsos(
      {},
      { permisos_sistema_abrir: [true], permisos_sistema_estado: [{ estados: { pantalla: "no-concedido" } }, { estados: { pantalla: "concedido" } }] },
    );
    expect(await pedirPermisoInicio("pantalla", "macos", d, "abrir-ajustes")).toBe("concedido");
    expect(llamadas[0]).toBe("permisos_sistema_abrir");
  });
  it("app anterior sin `permisos_sistema_abrir`: micrófono y cámara usan su camino de siempre", async () => {
    const vistas: string[] = [];
    const d: DepsEjecutor = {
      ...falsos().d,
      llamar: async (c) => {
        vistas.push(c);
        return c === "medios_abrir_ajustes" ? { ok: true, valor: true as never } : { ok: false };
      },
    };
    expect(await pedirPermisoInicio("camara", "macos", d, "abrir-ajustes")).toBe("omitido");
    expect(vistas.slice(0, 2)).toEqual(["permisos_sistema_abrir", "medios_abrir_ajustes"]);
  });
  it("abrir al iniciar sesión usa el interruptor de la app", async () => {
    const { d, llamadas } = falsos({}, { fondo_arranque: [{ arranque_con_sistema: true }] });
    expect(await pedirPermisoInicio("arranque", "windows", d)).toBe("concedido");
    expect(llamadas).toEqual(["fondo_arranque"]);
  });
  it("en Windows y Linux nada más se pide desde la lista", async () => {
    const { d } = falsos();
    expect(await pedirPermisoInicio("microfono", "windows", d)).toBe("no-disponible");
  });
});

describe("Android · pantallas de Ajustes (PER1111S)", () => {
  it("cada acceso especial abre su pantalla; el resto, la ficha de la app", () => {
    expect(panelAndroid("superposicion")).toBe("superposicion");
    expect(panelAndroid("notificaciones")).toBe("notificaciones");
    expect(panelAndroid("microfono")).toBe("app");
  });
  it("instalar y batería siguen por su camino de siempre", async () => {
    const { d, llamadas } = falsos({}, { permisos_inicio_estado: [{ instalar_apps: true }] });
    expect(await pedirPermisoInicio("instalar", "android", d, "abrir-ajustes")).toBe("concedido");
    expect(llamadas).not.toContain("permisos_sistema_abrir");
  });
});
