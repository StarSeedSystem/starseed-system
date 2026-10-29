import { describe, it, expect } from "vitest";
import {
  construirEventoSeguridad, desdeSeveridadScanner, pareceDatoPersonal, politicaPermite,
  proponerRespuesta, ORDEN_SEVERIDAD, type ElementoRed, type EventoSeguridad, type TipoEventoSeguridad,
} from "@/lib/security/eventos-seguridad";

const AHORA = 1_760_000_000_000;
// Las cadenas con forma de clave se construyen en la prueba en tiempo de ejecución.
const CLAVE_PRUEBA = "sk-" + "a".repeat(32);
const CORREO_PRUEBA = "persona" + "@ejemplo.com";
const IP_PRUEBA = "192." + "168." + "55." + "9";
const ENTRADA = {
  tipo: "limite-peticiones", severidad: "media", elemento: "api",
  detalle: { ruta: "/api/feed", limite: 30, ventanaMs: 60000, ip: IP_PRUEBA, correo: CORREO_PRUEBA, clave: CLAVE_PRUEBA },
};
const TODOS: TipoEventoSeguridad[] = ["secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe", "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual"];
const construirClave = () => construirEventoSeguridad(ENTRADA, AHORA) as EventoSeguridad;
const textoLibre = (e: EventoSeguridad | null) => (e === null ? "" : JSON.stringify(e) + proponerRespuesta(e).motivo);

describe("construirEventoSeguridad", () => {
  it("solo conserva las claves de la lista blanca del tipo", () => {
    const evento = construirClave();
    expect(evento).not.toBeNull();
    expect(Object.keys(evento.detalle).sort()).toEqual(["limite", "ruta", "ventanaMs"]);
  });
  it("cada tipo respeta su lista blanca de claves del detalle", () => {
    const permitidas = ["familia", "campo", "ruta", "limite", "ventanaMs", "clase", "motivo", "directiva", "codigo", "invariante", "paso", "medio"];
    for (const tipo of TODOS) {
      const evento = construirEventoSeguridad({ ...ENTRADA, tipo, detalle: { ...ENTRADA.detalle, familia: "detector-claves", campo: "cuerpo" } }, AHORA);
      expect(evento).not.toBeNull();
      for (const clave of Object.keys(evento?.detalle ?? {})) expect(permitidas).toContain(clave);
    }
  });
  it("claves y valores con forma de dato personal se descartan, sin enmascarar", () => {
    const evento = construirEventoSeguridad({ tipo: "secreto-detectado", severidad: "critica", elemento: "app", detalle: { familia: "detector-claves", campo: "cuerpo", valor: CLAVE_PRUEBA, correo: CORREO_PRUEBA, ip: IP_PRUEBA } }, AHORA) as EventoSeguridad;
    expect(Object.keys(evento.detalle).sort()).toEqual(["campo", "familia"]);
    expect(textoLibre(evento)).not.toContain(CLAVE_PRUEBA);
  });
  it("entrada inválida o vocabulario desconocido devuelve null", () => {
    expect(construirEventoSeguridad(null, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ ...ENTRADA, tipo: "algo-raro" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ ...ENTRADA, severidad: "terrible" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ ...ENTRADA, elemento: "letra" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad(ENTRADA, Number.NaN)).toBeNull();
  });
  it("id estable con la misma entrada; distinto al cambiar el elemento", () => {
    expect(construirClave().id).toEqual(construirEventoSeguridad(ENTRADA, AHORA)?.id ?? "");
    expect(construirClave().id).toEqual(construirEventoSeguridad(ENTRADA, AHORA + 1000)?.id ?? "");
    expect(construirClave().id.startsWith("evs-")).toBe(true);
    expect(construirClave().id).not.toEqual(construirEventoSeguridad({ ...ENTRADA, elemento: "red" }, AHORA)?.id ?? "");
  });  it("ninguna cadena de la salida guarda el secreto, un correo ni una IP", () => {
    for (const tipo of TODOS) {
      const texto = textoLibre(construirEventoSeguridad({ ...ENTRADA, tipo, detalle: { ...ENTRADA.detalle, motivo: CORREO_PRUEBA } }, AHORA));
      expect(texto).not.toContain(CLAVE_PRUEBA);
      expect(texto).not.toContain(CORREO_PRUEBA);
      expect(texto).not.toContain(IP_PRUEBA);
      expect(texto).not.toContain("ghp_");
    }  });
  it("el resumen sale de la plantilla fija: no cambia con la entrada", () => {
    const conResumen = construirEventoSeguridad({ ...ENTRADA, resumen: "Escríbelo como te parezca mejor" }, AHORA) as EventoSeguridad;
    expect(construirClave().resumen).toEqual(conResumen.resumen);
    expect(conResumen.resumen).toMatch(/^Se alcanzó el límite/);
  });
  it("contador válido entra; lo demás cae en 1", () => {
    expect(construirEventoSeguridad({ ...ENTRADA, contador: 4 }, AHORA)?.contador).toEqual(4);
    expect(construirEventoSeguridad({ ...ENTRADA, contador: 0 }, AHORA)?.contador).toEqual(1);
  });});

describe("proponerRespuesta", () => {
  it("nunca contiene acciones automáticas de castigo contra una persona", () => {
    for (const tipo of TODOS) {
      const elemento: ElementoRed = tipo === "limite-peticiones" ? "api" : "cuenta";
      const propuesta = proponerRespuesta(construirEventoSeguridad({ ...ENTRADA, tipo, elemento }, AHORA) as EventoSeguridad);
      const texto = JSON.stringify(propuesta);
      expect(texto).not.toContain("bloquear");
      expect(texto).not.toContain("suspender");
      expect(propuesta.acciones.length).toBeGreaterThan(0);    }
  });
  it("cuenta, grupo y página requieren humano y remiten a un Círculo de Paz", () => {
    for (const elemento of ["cuenta", "grupo", "pagina"] as ElementoRed[]) {
      const propuesta = proponerRespuesta(construirEventoSeguridad({ ...ENTRADA, elemento }, AHORA) as EventoSeguridad);
      expect(propuesta.requiereHumano).toBe(true);
      expect(propuesta.motivo).toContain("Círculo de Paz");
    }
  });  it("elemento técnico no fuerza la vía humana", () => {
    expect(proponerRespuesta(construirEventoSeguridad({ ...ENTRADA, elemento: "api" }, AHORA) as EventoSeguridad).requiereHumano).toBe(false);
  });});

describe("pareceDatoPersonal y política", () => {
  it("reconoce correo, IPv4, IPv6, JWT, hex y base64 largos y prefijos de credencial", () => {
    expect(pareceDatoPersonal(CORREO_PRUEBA)).toBe(true);
    expect(pareceDatoPersonal(IP_PRUEBA)).toBe(true);
    expect(pareceDatoPersonal("fe80" + "::1a2b:3c4d:5e6f")).toBe(true);
    expect(pareceDatoPersonal("eyJhbGciOi" + ".eyJzdWIi" + ".abc")).toBe(true);
    expect(pareceDatoPersonal("abcdef01" + "23456789" + "abcdef12" + "3456")).toBe(true);
    expect(pareceDatoPersonal("aGVsbG8gd" + "3Vyc2xkIG" + "JvdGFsbGE")).toBe(true);
    expect(pareceDatoPersonal(CLAVE_PRUEBA)).toBe(true);
    expect(pareceDatoPersonal("ghp_" + "cortis")).toBe(true);
    expect(pareceDatoPersonal("AKIA")).toBe(true);
    expect(pareceDatoPersonal("/api/feed")).toBe(false);
    expect(pareceDatoPersonal("no hay nada raro aquí")).toBe(false);
    expect(pareceDatoPersonal("")).toBe(false);
  });  it("desdeSeveridadScanner mapea el vocabulario del escáner; lo demás vale null", () => {
    expect(desdeSeveridadScanner("critical")).toEqual("critica");
    expect(desdeSeveridadScanner("high")).toEqual("alta");
    expect(desdeSeveridadScanner("medium")).toEqual("media");
    expect(desdeSeveridadScanner("low")).toEqual("baja");
    expect(desdeSeveridadScanner("grave")).toBeNull();
  });  it("política: severidad mínima y, si hay, lista de tipos", () => {
    const evento = construirClave();
    expect(evento.severidad).toEqual("media");
    expect(politicaPermite(evento, { severidadMinima: "baja" })).toBe(true);
    expect(politicaPermite(evento, { severidadMinima: "media" })).toBe(true);
    expect(politicaPermite(evento, { severidadMinima: "alta" })).toBe(false);
    expect(politicaPermite(evento, { severidadMinima: "media", tipos: ["limite-peticiones"] })).toBe(true);
    expect(politicaPermite(evento, { severidadMinima: "media", tipos: ["ssrf-bloqueado"] })).toBe(false);
  });
  it("ORDEN_SEVERIDAD va de la más leve a la más alta", () => {
    expect([...ORDEN_SEVERIDAD]).toEqual(["baja", "media", "alta", "critica"]);
  });
});