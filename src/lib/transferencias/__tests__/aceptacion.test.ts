/**
 * FMT1119 — aceptación de lo que llega por la malla (archivos, carpetas, sincronización de cerebro):
 * todo formato se admite; nada se auto-acepta de una neurona desconocida; el ajuste va neurona a neurona.
 */
import { describe, expect, it } from "vitest";
import {
  conAceptarSinPreguntar,
  conAnalizarSiempre,
  decidirAceptacion,
  describirSolicitud,
  debeAnalizar,
  etiquetaMedio,
  puedeAbrir,
  puedeAceptarSinPreguntar,
  preferenciasPorDefecto,
  tamanoLegible,
  type PreferenciasAceptacion,
  type SolicitudAceptacion,
} from "@/lib/transferencias/aceptacion";
function s(extra: Partial<SolicitudAceptacion> = {}): SolicitudAceptacion {
  return {
    tipoEnvio: "archivo",
    nombre: "foto.jpg",
    tamano: 73_690,
    tipo: "image/jpeg",
    tipoReal: "JPEG",
    neurona: { id: "n-magga", nombre: "MaggaBook", reconocida: true },
    via: "red local",
    ...extra,
  };
}
function prefs(extra: Partial<PreferenciasAceptacion> = {}): PreferenciasAceptacion {
  return { ...preferenciasPorDefecto(), ...extra };
}
describe("aceptación universal, libre y segura", () => {
  it("sin ajustes: toda neurona, incluso la reconocida, pregunta antes de aceptar", () => {
    const r = decidirAceptacion(s(), prefs());
    expect(r.decision).toBe("preguntar");
    expect(r.enCuarentena).toBe(true);
    expect(puedeAbrir(r)).toBe(false);
  });
  it("una neurona desconocida NUNCA se auto-acepta, aunque alguien haya dejado su ajuste encendido", () => {
    const p = conAceptarSinPreguntar(preferenciasPorDefecto(), "n-extraña", true);
    const r = decidirAceptacion(s({ neurona: { id: "n-extraña", nombre: "Vecino", reconocida: false } }), p);
    expect(r.decision).toBe("preguntar");
    expect(r.motivo).toMatch(/desconocida|no reconocida/i);
    expect(puedeAceptarSinPreguntar(p, { id: "n-extraña", nombre: "Vecino", reconocida: false })).toBe(false);
  });
  it("neurona reconocida con su ajuste encendido: acepta sin preguntar y no queda en cuarentena", () => {
    const p = conAceptarSinPreguntar(preferenciasPorDefecto(), "n-magga", true);
    const r = decidirAceptacion(s(), p);
    expect(r.decision).toBe("aceptar");
    expect(r.enCuarentena).toBe(false);
    expect(puedeAbrir(r)).toBe(true);
  });
  it("el ajuste apagado de nuevo vuelve a preguntar (no se recuerda al revés)", () => {
    const encendido = conAceptarSinPreguntar(preferenciasPorDefecto(), "n-magga", true);
    const apagado = conAceptarSinPreguntar(encendido, "n-magga", false);
    expect(decidirAceptacion(s(), apagado).decision).toBe("preguntar");
    expect(puedeAceptarSinPreguntar(encendido, s().neurona)).toBe(true);
  });
  it("ningún formato se rechaza solo: un ejecutable peligroso se pregunta, no se deniega", () => {
    const p = conAceptarSinPreguntar(preferenciasPorDefecto(), "n-magga", true);
    const r = decidirAceptacion(s({ nombre: "instalar.exe", tipo: "application/x-msdownload", tipoReal: "EJECUTABLE-WINDOWS" }), p);
    expect(r.decision).toBe("aceptar");
    expect(r.enCuarentena).toBe(false);
  });
  it("carpetas y sincronizaciones de cerebro piden aceptación con su medio", () => {
    const carpeta = decidirAceptacion(s({ tipoEnvio: "carpeta", nombre: "Viaje 2026", tamano: 42_000_000 }), prefs());
    const cerebro = decidirAceptacion(s({ tipoEnvio: "sincronizacion-cerebro", nombre: "Cerebro de Aurora" }), prefs());
    expect(carpeta.decision).toBe("preguntar");
    expect(cerebro.decision).toBe("preguntar");
    expect(etiquetaMedio("carpeta")).toMatch(/carpeta/i);
    expect(etiquetaMedio("sincronizacion-cerebro")).toMatch(/cerebro/i);
  });
});
describe("análisis de Astraura al recibir", () => {
  it("se ofrece siempre, pero solo se hace si la persona lo pide o lo dejó activado", () => {
    expect(debeAnalizar(s(), prefs())).toBe(false);
    expect(debeAnalizar(s({ analisisSolicitado: true }), prefs())).toBe(true);
    expect(debeAnalizar(s(), conAnalizarSiempre(preferenciasPorDefecto(), "n-magga", true))).toBe(true);
    expect(debeAnalizar(s(), prefs({ analizarSiempreCuenta: true }))).toBe(true);
  });
  it("si se eligió analizar, lo aceptado espera en cuarentena hasta tener el resultado", () => {
    const p = conAceptarSinPreguntar(preferenciasPorDefecto(), "n-magga", true);
    const pendiente = decidirAceptacion(s({ analisisSolicitado: true, analisisHecho: false }), p);
    expect(pendiente.decision).toBe("aceptar");
    expect(pendiente.pedirAnalisis).toBe(true);
    expect(pendiente.enCuarentena).toBe(true);
    expect(puedeAbrir(pendiente)).toBe(false);
    const limpio = decidirAceptacion(s({ analisisSolicitado: true, analisisHecho: true, nivelRiesgo: "limpio" }), p);
    expect(limpio.enCuarentena).toBe(false);
    expect(puedeAbrir(limpio)).toBe(true);
  });
  it("si el análisis halló peligro, se pregunta aunque la neurona tenga el ajuste encendido", () => {
    const p = conAceptarSinPreguntar(preferenciasPorDefecto(), "n-magga", true);
    const r = decidirAceptacion(s({ analisisHecho: true, nivelRiesgo: "peligro" }), p);
    expect(r.decision).toBe("preguntar");
    expect(r.motivo).toMatch(/peligro|riesgo/i);
  });
});
describe("la tarjeta que ve la persona", () => {
  it("describe nombre, tamaño, tipo real, neurona de origen y medio", () => {
    const texto = describirSolicitud(s({ via: "Bluetooth" })).join("\n");
    expect(texto).toContain("foto.jpg");
    expect(texto).toContain("73,7 KB");
    expect(texto).toContain("JPEG");
    expect(texto).toContain("MaggaBook");
    expect(texto).toContain("Bluetooth");
  });
  it("sin tipo real leído lo dice, en vez de inventarlo", () => {
    const texto = describirSolicitud(s({ tipoReal: null })).join("\n");
    expect(texto).toMatch(/sin leer|por determinar/i);
  });
  it("tamaño legible en español neutro", () => {
    expect(tamanoLegible(512)).toBe("512 B");
    expect(tamanoLegible(1_500)).toBe("1,5 KB");
    expect(tamanoLegible(42_000_000)).toBe("42 MB");
  });
});
