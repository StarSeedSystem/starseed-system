import { describe, expect, it } from "vitest";
import { leerWindows, leerLinux, type FuenteEscritorio } from "../escritorio";

describe("leerWindows", () => {
  const crearFuente = (estado: Partial<FuenteEscritorio.WindowsFuente> = {}): FuenteEscritorio.WindowsFuente => ({
    medios: estado.medios ?? {},
    ...estado,
  });

  it("devuelve concedido cuando el sistema lo indica", () => {
    const f = crearFuente({
      medios: { microfono: "concedido", camara: "concedido" },
    });
    const r = leerWindows(f);
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(true);
    expect(r.camara?.soportado).toBe(true);
    expect(r.camara?.concedido).toBe(true);
  });

  it("devuelve diceDenegado cuando Windows dice denied", () => {
    const f = crearFuente({
      medios: { microfono: "denegado", camara: "denegado" },
    });
    const r = leerWindows(f);
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(false);
    expect(r.microfono?.diceDenegado).toBe(true);
  });

  it("pantalla no se lee (Windows no pide permiso para captura)", () => {
    const f = crearFuente({
      medios: { pantalla: "concedido" },
    });
    const r = leerWindows(f);
    expect(r.pantalla).toEqual({ soportado: false, concedido: false });
  });

  it("accesibilidad no se lee (Windows no pide permiso para mandar teclas)", () => {
    const f = crearFuente({
      medios: { accesibilidad: "concedido" },
    });
    const r = leerWindows(f);
    expect(r.accesibilidad).toEqual({ soportado: false, concedido: false });
  });

  it("notificaciones activadas por defecto; no se lee directamente", () => {
    const f = crearFuente({
      notificacionesConcedidas: undefined,
    });
    const r = leerWindows(f);
    expect(r.notificaciones).toEqual({ soportado: false, concedido: false });
  });

  it("bluetooth no se lee (Windows no pide permiso a apps de escritorio)", () => {
    const f = crearFuente({
      bluetooth_estado: "encendido",
    });
    const r = leerWindows(f);
    expect(r.bluetooth).toEqual({ soportado: false, concedido: false });
  });

  it("arranque se lee desde autostart_estado", () => {
    const f = crearFuente({
      autostart_estado: true,
    });
    const r = leerWindows(f);
    expect(r.arranque?.soportado).toBe(true);
    expect(r.arranque?.concedido).toBe(true);
  });

  it("ubicacion no se lee directamente (se deduce por uso)", () => {
    const f = crearFuente({
      medios: { ubicacion: "concedido" },
    });
    const r = leerWindows(f);
    expect(r.ubicacion).toEqual({ soportado: false, concedido: false });
  });

  it("red-local se lee desde firewall_estado", () => {
    const f = crearFuente({
      firewall_estado: true,
    });
    const r = leerWindows(f);
    expect(r["red-local"]?.soportado).toBe(true);
    expect(r["red-local"]?.concedido).toBe(true);
  });

  it("energia se lee desde capacidad_estado", () => {
    const f = crearFuente({
      capacidad_estado: { bateria: 50 },
    });
    const r = leerWindows(f);
    expect(r.energia?.soportado).toBe(true);
    expect(r.energia?.concedido).toBe(true);
  });

  it("desconocido no se vuelve denegado por sospecha", () => {
    const f = crearFuente({
      medios: { microfono: "desconocido" },
    });
    const r = leerWindows(f);
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(false);
    expect(r.microfono?.ilegible).toBe(true);
  });
});

describe("leerLinux", () => {
  const crearFuente = (estado: Partial<FuenteEscritorio.LinuxFuente> = {}): FuenteEscritorio.LinuxFuente => ({
    sesion: estado.sesion ?? "x11",
    permisos: estado.permisos ?? {},
    ...estado,
  });

  it("devuelve concedido cuando el sistema lo indica", () => {
    const f = crearFuente({
      permisos: { microfono: "concedido", camara: "concedido" },
    });
    const r = leerLinux(f, "x11");
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(true);
  });

  it("devuelve diceDenegado cuando Linux dice denied", () => {
    const f = crearFuente({
      permisos: { microfono: "denegado", camara: "denegado" },
    });
    const r = leerLinux(f, "x11");
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(false);
    expect(r.microfono?.diceDenegado).toBe(true);
  });

  it("pantalla no se lee en X11 (cualquier cliente puede ver)", () => {
    const f = crearFuente({
      sesion: "x11",
      permisos: {},
    });
    const r = leerLinux(f, "x11");
    expect(r.pantalla).toEqual({ soportado: false, concedido: false });
  });

  it("pantalla por-uso en Wayland", () => {
    const f = crearFuente({
      sesion: "wayland",
      permisos: {},
    });
    const r = leerLinux(f, "wayland");
    expect(r.pantalla?.soportado).toBe(true);
    expect(r.pantalla?.concedido).toBe(false);
    expect(r.pantalla?.ilegible).toBe(true);
  });

  it("accesibilidad no se lee en X11", () => {
    const f = crearFuente({
      sesion: "x11",
      permisos: { accesibilidad: "concedido" },
    });
    const r = leerLinux(f, "x11");
    expect(r.accesibilidad).toEqual({ soportado: false, concedido: false });
  });

  it("accesibilidad por-uso en Wayland", () => {
    const f = crearFuente({
      sesion: "wayland",
      permisos: {},
    });
    const r = leerLinux(f, "wayland");
    expect(r.accesibilidad?.soportado).toBe(true);
    expect(r.accesibilidad?.concedido).toBe(false);
    expect(r.accesibilidad?.ilegible).toBe(true);
  });

  it("energia se lee desde capacidad_estado", () => {
    const f = crearFuente({
      capacidad_estado: { bateria: 50 },
    });
    const r = leerLinux(f, "x11");
    expect(r.energia?.soportado).toBe(true);
    expect(r.energia?.concedido).toBe(true);
  });

  it("bluetooth se lee desde bluetooth_estado", () => {
    const f = crearFuente({
      bluetooth_estado: "activo",
    });
    const r = leerLinux(f, "x11");
    expect(r.bluetooth?.soportado).toBe(true);
    expect(r.bluetooth?.concedido).toBe(true);
  });

  it("notificaciones no se leen en Linux", () => {
    const f = crearFuente({
      permisos: { notificaciones: "concedido" },
    });
    const r = leerLinux(f, "x11");
    expect(r.notificaciones).toEqual({ soportado: false, concedido: false });
  });

  it("red-local se lee desde firewall_estado", () => {
    const f = crearFuente({
      firewall_estado: true,
    });
    const r = leerLinux(f, "x11");
    expect(r["red-local"]?.soportado).toBe(true);
    expect(r["red-local"]?.concedido).toBe(true);
  });

  it("desconocido no se vuelve denegado por sospecha", () => {
    const f = crearFuente({
      permisos: { microfono: "desconocido" },
    });
    const r = leerLinux(f, "x11");
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(false);
    expect(r.microfono?.ilegible).toBe(true);
  });

  it("arranque se lee desde autostart_estado en Linux", () => {
    const f = crearFuente({
      sesion: "x11",
      autostart_estado: true,
    });
    const r = leerLinux(f, "x11");
    expect(r.arranque?.soportado).toBe(true);
    expect(r.arranque?.concedido).toBe(true);
  });

  it("arranque denegado se lee desde autostart_estado en Linux", () => {
    const f = crearFuente({
      sesion: "x11",
      autostart_estado: false,
    });
    const r = leerLinux(f, "x11");
    expect(r.arranque?.soportado).toBe(true);
    expect(r.arranque?.concedido).toBe(false);
    expect(r.arranque?.diceDenegado).toBe(true);
  });
});