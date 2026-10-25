/**
 * Pruebas del evento de seguridad saneado (INF1025A).
 * Todo se construye en tiempo de ejecución: ni claves, ni correos, ni IPs
 * reales viven en este archivo.
 */

import { describe, expect, it } from "vitest";
import {
  ORDEN_SEVERIDAD,
  construirEventoSeguridad,
  desdeSeveridadScanner,
  pareceDatoPersonal,
  politicaPermite,
  proponerRespuesta,
  type ElementoRed,
  type EventoSeguridad,
  type TipoEventoSeguridad,
} from "@/lib/security/eventos-seguridad";
const AHORA = 1_760_000_040_000;
const claveFalsa = "sk-" + "a".repeat(32);
const correoFalso = "persona" + "@" + "ejemplo.com";
const ipFalsa = "10" + "." + "20" + "." + "30" + "." + "40";
function evento(
  tipo: TipoEventoSeguridad,
  elemento: ElementoRed = "api",
  detalle: Record<string, unknown> = {},
  ahora = AHORA,
): EventoSeguridad {
  const e = construirEventoSeguridad({ tipo, severidad: "media", elemento, detalle }, ahora);
  expect(e).not.toBeNull();
  return e as EventoSeguridad;
}
describe("construirEventoSeguridad", () => {
  it("solo acepta el vocabulario cerrado y falla cerrado", () => {
    expect(construirEventoSeguridad({ tipo: "otro", severidad: "alta", elemento: "api" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "csp-informe", severidad: "urgente", elemento: "api" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "csp-informe", severidad: "alta", elemento: "planeta" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad(null, AHORA)).toBeNull();
    expect(construirEventoSeguridad("texto", AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "csp-informe", severidad: "alta", elemento: "api" }, Number.NaN)).toBeNull();
  });
  it("conserva solo claves y valores de la lista blanca", () => {
    const e = evento("limite-peticiones", "api", { ruta: "/api/auth/otp", limite: 5, ventanaMs: 60000, extra: "no sale" });
    expect(e.detalle).toEqual({ ruta: "/api/auth/otp", limite: 5, ventanaMs: 60000 });
    expect(e.contador).toBe(1);
  });
  it("descarta valores con forma de clave, correo o IP", () => {
    const e = evento("secreto-detectado", "api", { familia: claveFalsa, campo: correoFalso, nota: ipFalsa });
    expect(e.detalle).toEqual({});
    const salida = JSON.stringify(e);
    expect(salida).not.toContain(claveFalsa);
    expect(salida).not.toContain(correoFalso);
    expect(salida).not.toContain(ipFalsa);
  });
  it("el resumen es fijo y no copia texto de la entrada", () => {
    const a = construirEventoSeguridad({ tipo: "acceso-inusual", severidad: "baja", elemento: "cuenta", resumen: "inyectar" }, AHORA);
    const b = construirEventoSeguridad({ tipo: "acceso-inusual", severidad: "critica", elemento: "red", resumen: "otra cosa" }, AHORA);
    expect(a?.resumen).toBe(b?.resumen);
    expect(a?.resumen).not.toContain("inyectar");
  });
  it("genera un id determinista y distinto por elemento", () => {
    expect(evento("hallazgo-strix").id).toBe(evento("hallazgo-strix").id);
    expect(evento("hallazgo-strix").id).not.toBe(evento("hallazgo-strix", "red").id);
    expect(evento("hallazgo-strix").id).toBe(evento("hallazgo-strix", "api", {}, AHORA + 59_000).id);
    expect(evento("hallazgo-strix").id).not.toBe(evento("hallazgo-strix", "api", {}, AHORA + 60_000).id);
    expect(evento("hallazgo-strix").id.startsWith("evs-")).toBe(true);
  });
});
describe("pareceDatoPersonal", () => {
  it("reconoce correos, IPs, JWT y claves", () => {
    expect(pareceDatoPersonal(correoFalso)).toBe(true);
    expect(pareceDatoPersonal(ipFalsa)).toBe(true);
    expect(pareceDatoPersonal("2001:db8::1")).toBe(true);
    expect(pareceDatoPersonal("eyJ" + "abc.def.ghi")).toBe(true);
    expect(pareceDatoPersonal(claveFalsa)).toBe(true);
    expect(pareceDatoPersonal("ghp_" + "b".repeat(24))).toBe(true);
    expect(pareceDatoPersonal("a".repeat(32))).toBe(true);
  });
  it("no marca texto normal", () => {
    expect(pareceDatoPersonal("revisar la ruta afectada")).toBe(false);
  });
});
describe("proponerRespuesta", () => {
  it("solo propone y nunca castiga", () => {
    const tipos: TipoEventoSeguridad[] = [
      "secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe",
      "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual",
    ];
    for (const tipo of tipos) {
      const r = proponerRespuesta(evento(tipo));
      const texto = r.acciones.join(" ") + " " + r.motivo;
      expect(texto).not.toMatch(/bloquear|suspender/i);
      expect(r.acciones).toContain("abrir un caso");
    }
  });
  it("pide humano en cuentas, grupos y páginas", () => {
    for (const elemento of ["cuenta", "grupo", "pagina"] as ElementoRed[]) {
      const r = proponerRespuesta(evento("acceso-inusual", elemento));
      expect(r.requiereHumano).toBe(true);
      expect(r.motivo).toContain("Círculo de Paz");
    }
    expect(proponerRespuesta(evento("acceso-inusual", "api")).requiereHumano).toBe(false);
  });
});
describe("severidad y política", () => {
  it("mapea la severidad del escáner y el orden", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica");
    expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media");
    expect(desdeSeveridadScanner("low")).toBe("baja");
    expect(ORDEN_SEVERIDAD).toEqual(["critica", "alta", "media", "baja"]);
  });
  it("aplica el umbral y el filtro de tipos", () => {
    const e = evento("limite-peticiones");
    expect(politicaPermite(e, { severidadMinima: "media" })).toBe(true);
    expect(politicaPermite(e, { severidadMinima: "critica" })).toBe(false);
    expect(politicaPermite(e, { severidadMinima: "baja", tipos: ["limite-peticiones"] })).toBe(true);
    expect(politicaPermite(e, { severidadMinima: "baja", tipos: ["csp-informe"] })).toBe(false);
  });
});
