import { describe, expect, it } from "vitest";
import { leerMacos, type FuenteMacos } from "../macos";
import type { Lectura, Permiso } from "@/lib/permisos/matriz";

describe("leerMacos", () => {
  const crearFuente = (estado: Partial<FuenteMacos>): FuenteMacos => ({
    permisos_sistema_estado: estado.permisos_sistema_estado ?? {},
    medios_estado: estado.medios_estado ?? {},
    ble_estado: estado.ble_estado ?? null,
    enlace_wifi_permiso: estado.enlace_wifi_permiso ?? null,
    fondo_estado: estado.fondo_estado ?? null,
    notificacionesConcedidas: estado.notificacionesConcedidas ?? null,
  });

  it("devuelve concedido cuando el sistema lo indica", () => {
    const f = crearFuente({
      permisos_sistema_estado: { microfono: "concedido", camara: "concedido" },
    });
    const r = leerMacos(f);
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(true);
    expect(r.camara?.soportado).toBe(true);
    expect(r.camara?.concedido).toBe(true);
  });

  it("devuelve diceDenegado cuando TCC dice denied", () => {
    const f = crearFuente({
      permisos_sistema_estado: { microfono: "denegado", camara: "denegado" },
    });
    const r = leerMacos(f);
    expect(r.microfono?.soportado).toBe(true);
    expect(r.microfono?.concedido).toBe(false);
    expect(r.microfono?.diceDenegado).toBe(true);
    expect(r.camara?.diceDenegado).toBe(true);
  });

  it("devuelve no-disponible cuando el sistema no deja leer el permiso y no hay alternativa", () => {
    const f = crearFuente({
      permisos_sistema_estado: {},
    });
    const r = leerMacos(f);
    expect(r.microfono).toEqual({ soportado: false, concedido: false });
  });

  it("devuelve por-uso para ubicacion (sistema pregunta cada vez)", () => {
    const f = crearFuente({
      permisos_sistema_estado: { ubicacion: "no-concedido" },
    });
    const r = leerMacos(f);
    expect(r.ubicacion?.soportado).toBe(true);
    expect(r.ubicacion?.concedido).toBe(false);
  });

  it("detecta Bluetooth desde ble_estado", () => {
    const f = crearFuente({ ble_estado: { radio: "encendida" } });
    const r = leerMacos(f);
    expect(r.bluetooth?.soportado).toBe(true);
    expect(r.bluetooth?.concedido).toBe(true);
  });

  it("detecta Bluetooth denegado desde ble_estado", () => {
    const f = crearFuente({ ble_estado: { radio: "sin-permiso" } });
    const r = leerMacos(f);
    expect(r.bluetooth?.soportado).toBe(true);
    expect(r.bluetooth?.concedido).toBe(false);
    expect(r.bluetooth?.diceDenegado).toBe(true);
  });

  it("detecta pantalla desde pantalla_estado cuando está disponible", () => {
    const f = crearFuente({
      medios_estado: { pantalla: "concedido" },
    });
    const r = leerMacos(f);
    expect(r.pantalla?.soportado).toBe(true);
    expect(r.pantalla?.concedido).toBe(true);
  });

  it("detecta pantalla denegada desde pantalla_estado", () => {
    const f = crearFuente({
      medios_estado: { pantalla: "denegado" },
    });
    const r = leerMacos(f);
    expect(r.pantalla?.soportado).toBe(true);
    expect(r.pantalla?.concedido).toBe(false);
    expect(r.pantalla?.diceDenegado).toBe(true);
  });

  it("no se lee pantalla cuando no hay datos: no-disponible", () => {
    const f = crearFuente({
      medios_estado: {},
      permisos_sistema_estado: {},
    });
    const r = leerMacos(f);
    expect(r.pantalla).toEqual({ soportado: false, concedido: false });
  });

  it("disco-completo es ilegible (macOS no deja leerlo directamente)", () => {
    const f = crearFuente({
      permisos_sistema_estado: {},
    });
    const r = leerMacos(f);
    expect(r["disco-completo"]?.soportado).toBe(true);
    expect(r["disco-completo"]?.concedido).toBe(false);
    expect(r["disco-completo"]?.ilegible).toBe(true);
  });

  it("entrada-virtual es ilegible (macOS no deja leerlo directamente)", () => {
    const f = crearFuente({
      permisos_sistema_estado: { "entrada-virtual": "concedido" },
    });
    const r = leerMacos(f);
    expect(r["entrada-virtual"]?.soportado).toBe(true);
    expect(r["entrada-virtual"]?.concedido).toBe(false);
    expect(r["entrada-virtual"]?.ilegible).toBe(true);
  });

  it("no se lee automatizacion que no tiene aviso: no-disponible", () => {
    const f = crearFuente({
      permisos_sistema_estado: { automatizacion: "concedido" },
    });
    const r = leerMacos(f);
    expect(r.automatizacion).toEqual({ soportado: false, concedido: false });
  });

  it("detecta notificaciones desde notificacionesConcedidas", () => {
    const f = crearFuente({
      notificacionesConcedidas: true,
    });
    const r = leerMacos(f);
    expect(r.notificaciones?.soportado).toBe(true);
    expect(r.notificaciones?.concedido).toBe(true);
  });

  it("detecta notificaciones denegadas", () => {
    const f = crearFuente({
      notificacionesConcedidas: false,
    });
    const r = leerMacos(f);
    expect(r.notificaciones?.soportado).toBe(true);
    expect(r.notificaciones?.concedido).toBe(false);
    expect(r.notificaciones?.diceDenegado).toBe(true);
  });

  it("detecta pantalla desde fondo_estado (arranque_con_sistema)", () => {
    const f = crearFuente({
      fondo_estado: { arranque_con_sistema: true },
    });
    const r = leerMacos(f);
    expect(r.arranque?.soportado).toBe(true);
    expect(r.arranque?.concedido).toBe(true);
  });

  it("no se lee ubicacion-wifi desde el sistema: deducir por uso", () => {
    const f = crearFuente({
      permisos_sistema_estado: { "ubicacion-wifi": "concedido" },
    });
    const r = leerMacos(f);
    expect(r["ubicacion-wifi"]?.soportado).toBe(true);
    expect(r["ubicacion-wifi"]?.concedido).toBe(true);
  });

  it("accesibilidad se lee directamente del sistema (macOS sí lo permite)", () => {
    const f = crearFuente({
      permisos_sistema_estado: { accesibilidad: "concedido" },
    });
    const r = leerMacos(f);
    expect(r.accesibilidad?.soportado).toBe(true);
    expect(r.accesibilidad?.concedido).toBe(true);
  });

  it("accesibilidad con no-concedido es ilegible (no distingue negado de nunca preguntado)", () => {
    const f = crearFuente({
      permisos_sistema_estado: { accesibilidad: "no-concedido" },
    });
    const r = leerMacos(f);
    expect(r.accesibilidad?.soportado).toBe(true);
    expect(r.accesibilidad?.concedido).toBe(false);
    expect(r.accesibilidad?.ilegible).toBe(true);
  });

  it("red-local es ilegible (macOS no deja leerlo directamente)", () => {
    const f = crearFuente({
      permisos_sistema_estado: { "red-local": "concedido" },
    });
    const r = leerMacos(f);
    expect(r["red-local"]?.soportado).toBe(true);
    expect(r["red-local"]?.concedido).toBe(false);
    expect(r["red-local"]?.ilegible).toBe(true);
  });

  it("energia es ilegible (macOS no deja leerla directamente)", () => {
    const f = crearFuente({
      permisos_sistema_estado: {},
    });
    const r = leerMacos(f);
    expect(r.energia?.soportado).toBe(true);
    expect(r.energia?.concedido).toBe(false);
    expect(r.energia?.ilegible).toBe(true);
  });

  it("desconocido no se vuelve denegado por sospecha", () => {
    const f = crearFuente({
      permisos_sistema_estado: { pantalla: "desconocido" },
    });
    const r = leerMacos(f);
    expect(r.pantalla?.soportado).toBe(true);
    expect(r.pantalla?.concedido).toBe(false);
    expect(r.pantalla?.ilegible).toBe(true);
  });

  it("monitor-entrada se lee del sistema", () => {
    const f = crearFuente({
      permisos_sistema_estado: { "monitor-entrada": "concedido" },
    });
    const r = leerMacos(f);
    expect(r["monitor-entrada"]?.soportado).toBe(true);
    expect(r["monitor-entrada"]?.concedido).toBe(true);
  });

  it("sin-preguntar no se vuelve denegado por sospecha", () => {
    const f = crearFuente({
      permisos_sistema_estado: { accesibilidad: "sin-preguntar" },
    });
    const r = leerMacos(f);
    expect(r.accesibilidad).toEqual({ soportado: false, concedido: false });
  });
});