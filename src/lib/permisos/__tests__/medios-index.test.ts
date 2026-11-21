import { describe, expect, it } from "vitest";
import { leerMedio, planDeMedio } from "../index";
import type { Medio, Permiso, Lectura } from "../../matriz";

describe("leerMedio", () => {
  it("despacha a leerMacos para macos", () => {
    const fuente = {
      permisos_sistema_estado: { microfono: "concedido" },
      medios_estado: {},
      ble_estado: null,
      enlace_wifi_permiso: null,
      fondo_estado: null,
      notificacionesConcedidas: null,
    };
    const r = leerMedio("macos", fuente as never);
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(true);
  });

  it("despacha a leerWindows para windows", () => {
    const fuente = {
      medios: { microfono: "concedido" },
      notificacionesConcedidas: undefined,
    };
    const r = leerMedio("windows", fuente as never);
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(true);
  });

  it("despacha a leerLinux para linux-x11", () => {
    const fuente = {
      sesion: "x11",
      permisos: { microfono: "concedido" },
      permisos: {},
    };
    const r = leerMedio("linux", fuente as never);
    expect((r as any).microfono).toBeUndefined();
  });

  it("despacha a leerLinux para linux-wayland", () => {
    const fuente = {
      sesion: "wayland",
      permisos: {},
    };
    const r = leerMedio("linux", fuente as never);
    expect((r as any).pantalla).toEqual({ soportado: false, concedido: false });
  });
});

describe("planDeMedio", () => {
  it("genera plan de apertura para macos", () => {
    const fuente = {
      permisos_sistema_estado: { microfono: "concedido", camara: "denegado" },
      medios_estado: {},
      ble_estado: null,
      enlace_wifi_permiso: null,
      fondo_estado: null,
      notificacionesConcedidas: null,
    };
    const plan = planDeMedio("macos", fuente as never, "abrir");
    const camara = plan.find(p => p.permiso === "camara");
    expect(camara?.accion).toBe("abrir-ajustes");
  });

  it("genera plan de instalar con estados iniciales", () => {
    const fuente = {
      permisos_sistema_estado: {},
      medios_estado: {},
      ble_estado: null,
      enlace_wifi_permiso: null,
      fondo_estado: null,
      notificacionesConcedidas: null,
    };
    const plan = planDeMedio("macos", fuente as never, "instalar");
    expect(plan.length).toBeGreaterThan(0);
  });
});