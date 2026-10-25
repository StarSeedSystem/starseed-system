import { describe, expect, it } from "vitest";
import {
  ORDEN_SEVERIDAD, construirEventoSeguridad, desdeSeveridadScanner,
  pareceDatoPersonal, politicaPermite, proponerRespuesta,
  type EventoSeguridad, type TipoEventoSeguridad,
} from "@/lib/security/eventos-seguridad";
const AHORA = Date.parse("2026-10-25T09:30:00.000Z");
const CLAVE_FALSA = "sk-" + "a".repeat(32);
const CORREO_FALSO = "ana" + "@" + "example.com";
const IP_FALSA = [10, 0, 0, 1].join(".");
const TIPOS: TipoEventoSeguridad[] = ["secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe", "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual"];
function entrada(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { tipo: "limite-peticiones", severidad: "alta", elemento: "api", contador: 3, detalle: { ruta: "/api/salud", limite: 60, ventanaMs: 60_000 }, ...extra };
}
function construir(extra: Record<string, unknown> = {}, ahoraMs = AHORA): EventoSeguridad {
  const evento = construirEventoSeguridad(entrada(extra), ahoraMs);
  if (!evento) throw new Error("el evento de prueba debería ser válido");
  return evento;
}
describe("vocabulario cerrado", () => {
  it("acepta los ocho tipos y calcula cuando desde ahoraMs", () => {
    for (const tipo of TIPOS) expect(construir({ tipo }).tipo).toBe(tipo);
    const e = construir();
    expect([e.version, e.cuando, e.contador]).toEqual([1, "2026-10-25T09:30:00.000Z", 3]);
  });
  it("falla cerrado con entrada inválida o fuera del vocabulario", () => {
    expect(construirEventoSeguridad(null, AHORA)).toBeNull();
    expect(construirEventoSeguridad("texto", AHORA)).toBeNull();
    expect(construirEventoSeguridad(entrada({ tipo: "otro" }), AHORA)).toBeNull();
    expect(construirEventoSeguridad(entrada({ severidad: "critical" }), AHORA)).toBeNull();
    expect(construirEventoSeguridad(entrada({ elemento: "persona" }), AHORA)).toBeNull();
    expect(construirEventoSeguridad(entrada(), Number.NaN)).toBeNull();
    expect(construirEventoSeguridad(entrada(), Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("normaliza el contador a un entero mayor o igual que uno", () => {
    expect([0, -4, 7.9].map((contador) => construir({ contador }).contador)).toEqual([1, 1, 7]);
  });
});
describe("detalle con lista blanca", () => {
  it("descarta claves desconocidas y valores con forma de dato personal", () => {
    const secreto = construir({ tipo: "secreto-detectado", detalle: { familia: "proveedor", campo: "token", correo: CORREO_FALSO, valor: CLAVE_FALSA } });
    expect(secreto.detalle).toEqual({ familia: "proveedor", campo: "token" });
    expect(construir({ detalle: { ruta: CORREO_FALSO, limite: 10, ventanaMs: 1000, extra: "x" } }).detalle).toEqual({ limite: 10, ventanaMs: 1000 });
    expect(construir({ tipo: "acceso-inusual", detalle: { motivo: IP_FALSA, intentos: 4 } }).detalle).toEqual({ intentos: 4 });
  });
  it("un detalle que no es objeto no aporta claves", () => {
    expect(construir({ detalle: "no-objeto" }).detalle).toEqual({});
    expect(construir({ detalle: [1, 2, 3] }).detalle).toEqual({});
  });
});
describe("pareceDatoPersonal", () => {
  it("detecta correo, IP, JWT, claves conocidas y cadenas largas", () => {
    const valores = [CORREO_FALSO, IP_FALSA, "2001:db8::1", "eyJ" + "a".repeat(30), CLAVE_FALSA,
      "ghp_" + "b".repeat(30), "AKIA" + "C".repeat(20), "d".repeat(40), "e".repeat(24)];
    for (const valor of valores) expect(pareceDatoPersonal(valor)).toBe(true);
  });
  it("deja pasar texto normal o vacío", () => {
    expect(pareceDatoPersonal("ruta-segura")).toBe(false);
    expect(pareceDatoPersonal("")).toBe(false);
  });
});
describe("id determinista y resumen fijo", () => {
  it("es estable en el mismo minuto y cambia con el elemento", () => {
    const a = construir({}, AHORA);
    expect(a.id.startsWith("evs-")).toBe(true);
    expect(a.id).toBe(construir({}, AHORA + 30_000).id);
    expect(a.id).not.toBe(construir({}, AHORA + 60_000).id);
    expect(a.id).not.toBe(construir({ elemento: "red" }, AHORA).id);
  });
  it("el resumen no cambia con el detalle de la entrada", () => {
    const a = construir({ detalle: { ruta: "/uno", limite: 1, ventanaMs: 1000 } });
    const b = construir({ detalle: { ruta: "/dos", limite: 999, ventanaMs: 2000 } });
    expect(a.resumen).toBe(b.resumen);
    expect(a.resumen).not.toContain("/uno");
  });
  it("ninguna cadena de la salida contiene clave, correo ni IP", () => {
    const eventos = [
      construir({ tipo: "secreto-detectado", detalle: { familia: CORREO_FALSO, campo: IP_FALSA, valor: CLAVE_FALSA } }),
      construir({ detalle: { ruta: CLAVE_FALSA, extra: CORREO_FALSO } }),
    ];
    const salida = JSON.stringify(eventos);
    expect(salida).not.toContain(CLAVE_FALSA);
    expect(salida).not.toContain(CORREO_FALSO);
    expect(salida).not.toContain(IP_FALSA);
  });
});
describe("respuesta restaurativa", () => {
  it("solo propone y nunca bloquea ni suspende", () => {
    const r = proponerRespuesta(construir());
    const texto = [...r.acciones, r.motivo].join(" ").toLowerCase();
    expect(r.requiereHumano).toBe(false);
    expect(r.acciones.length).toBeGreaterThan(0);
    expect(texto).not.toContain("bloquear");
    expect(texto).not.toContain("suspender");
  });
  it("cuenta, grupo y página exigen un Círculo de Paz", () => {
    for (const elemento of ["cuenta", "grupo", "pagina"]) {
      const r = proponerRespuesta(construir({ elemento }));
      expect(r.requiereHumano).toBe(true);
      expect(r.motivo).toContain("Círculo de Paz");
    }
  });
});
describe("política y adaptador del escáner", () => {
  it("ORDEN_SEVERIDAD va de crítica a baja", () => {
    expect([...ORDEN_SEVERIDAD]).toEqual(["critica", "alta", "media", "baja"]);
  });
  it("politicaPermite respeta severidad mínima y tipos", () => {
    const critica = construir({ severidad: "critica" });
    expect(politicaPermite(critica, { severidadMinima: "alta" })).toBe(true);
    expect(politicaPermite(construir({ severidad: "baja" }), { severidadMinima: "media" })).toBe(false);
    expect(politicaPermite(critica, { severidadMinima: "alta", tipos: ["ssrf-bloqueado"] })).toBe(false);
    expect(politicaPermite(critica, { severidadMinima: "alta", tipos: ["limite-peticiones"] })).toBe(true);
    expect(politicaPermite(critica, { severidadMinima: "imposible" as "alta" })).toBe(false);
  });
  it("desdeSeveridadScanner mapea el escáner y falla cerrado", () => {
    expect(["critical", "high", "medium", "low"].map(desdeSeveridadScanner)).toEqual(["critica", "alta", "media", "baja"]);
    expect(desdeSeveridadScanner("desconocida")).toBeNull();
  });
});
