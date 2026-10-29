// Pruebas de `src/lib/security/eventos-seguridad.ts` (INF1025A): lista blanca,
// falla cerrado, id determinista y salidas sin datos personales ni de claves.
import { describe, expect, it } from "vitest";
import {
  construirEventoSeguridad, desdeSeveridadScanner, ORDEN_SEVERIDAD, politicaPermite, proponerRespuesta,
  pareceDatoPersonal, type EventoSeguridad, type TipoEventoSeguridad,
} from "../security/eventos-seguridad";

const RECIENTE = 1_700_000_000_000; // fijo, sin Date.now()
const CLAVE = "sk-" + "a".repeat(32);
const LIMITE = { tipo: "limite-peticiones", severidad: "media", elemento: "api", detalle: { ruta: "red-mesh", limite: 20, ventanaMs: 60000 } };

describe("pareceDatoPersonal", () => {
  it("detecta correo, IPv4, IPv6, JWT, hex/base64 y prefijos de clave", () => {
    expect(pareceDatoPersonal("dueña@red.es")).toBe(true);
    expect(pareceDatoPersonal("127.0.0.1")).toBe(true);
    expect(pareceDatoPersonal("fe80::1")).toBe(true);
    expect(pareceDatoPersonal(CLAVE)).toBe(true);
    expect(pareceDatoPersonal("ghp_" + "b".repeat(30))).toBe(true);
    expect(pareceDatoPersonal("AKIA" + "C".repeat(20))).toBe(true);
    expect(pareceDatoPersonal("0123456789abcdef01234567")).toBe(true); // hex de 24
  });
  it("deja pasar el texto normal", () => {
    expect(pareceDatoPersonal("frontera de red-mesh")).toBe(false);
    expect(pareceDatoPersonal("")).toBe(false);
  });
});

describe("construirEventoSeguridad", () => {
  it("construye el evento con lista blanca y contador normalizado", () => {
    const ev = construirEventoSeguridad({ ...LIMITE, detalle: { ...LIMITE.detalle, desconocida: "x" } }, RECIENTE);
    expect(ev).not.toBeNull();
    expect(ev?.version).toBe(1);
    expect(ev?.resumen).toBe("Límite de peticiones superado en la misma ventana");
    expect(Object.keys(ev?.detalle ?? {})).toEqual(["ruta", "limite", "ventanaMs"]);
    expect(ev?.contador).toBe(1);
    expect(ev?.cuando).toBe(new Date(RECIENTE).toISOString());
  });
  it("entrada inválida da null (falla cerrado)", () => {
    expect(construirEventoSeguridad(null, RECIENTE)).toBeNull();
    expect(construirEventoSeguridad({ ...LIMITE, tipo: "ataque" }, RECIENTE)).toBeNull();
    expect(construirEventoSeguridad({ ...LIMITE, severidad: "grave" }, RECIENTE)).toBeNull();
    expect(construirEventoSeguridad({ ...LIMITE, elemento: "casa" }, RECIENTE)).toBeNull();
    expect(construirEventoSeguridad(LIMITE, Number.NaN)).toBeNull();
  });
  it("el id es estable y distinto al cambiar el elemento o el cubo de 60 s", () => {
    const a = construirEventoSeguridad(LIMITE, RECIENTE)?.id;
    const b = construirEventoSeguridad(LIMITE, RECIENTE + 10_000)?.id;
    const c = construirEventoSeguridad({ ...LIMITE, elemento: "red" }, RECIENTE)?.id;
    const d = construirEventoSeguridad(LIMITE, RECIENTE + 60_000)?.id;
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
  it("descarta los valores con forma de clave, correo o IP (no enmascara)", () => {
    const ev = construirEventoSeguridad(
      { ...LIMITE, detalle: { ruta: "red-mesh", limite: CLAVE, ventanaMs: "dueña@red.es" } },
      RECIENTE,
    );
    expect(Object.keys(ev?.detalle ?? {})).toEqual(["ruta"]);
  });
  it("el resumen no cambia con la entrada", () => {
    const a = construirEventoSeguridad({ ...LIMITE, detalle: { ruta: "una", limite: 1, ventanaMs: 2 } }, RECIENTE);
    const b = construirEventoSeguridad({ ...LIMITE, detalle: { ruta: "otro", limite: 99, ventanaMs: 5 } }, RECIENTE);
    expect(a?.resumen).not.toBe("");
    expect(a?.resumen === b?.resumen).toBe(true);
  });
  it("ninguna cadena de la salida contiene claves, correos ni IPs", () => {
    const casos: unknown[] = [
      { tipo: "secreto-detectado", severidad: "critica", elemento: "red", detalle: { familia: CLAVE, campo: "dueña@red.es" } },
      { tipo: "ssrf-bloqueado", severidad: "alta", elemento: "app", detalle: { host: "127.0.0.1", motivo: "repetido" } },
      LIMITE,
    ];
    const texto = casos.map((c) => JSON.stringify(construirEventoSeguridad(c, RECIENTE))).join("|");
    expect(texto).not.toContain(CLAVE);
    expect(texto).not.toContain("dueña@red.es");
    expect(texto).not.toContain("127.0.0.1");
  });
});

describe("proponerRespuesta", () => {
  const tipos: TipoEventoSeguridad[] = [
    "secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe",
    "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual",
  ];
  const evTipo = (tipo: TipoEventoSeguridad, elemento: EventoSeguridad["elemento"]): EventoSeguridad | null =>
    construirEventoSeguridad({ tipo, severidad: "alta", elemento }, RECIENTE);

  it("jamás propone bloquear ni suspender, en ningún tipo ni elemento", () => {
    for (const tipo of tipos) {
      for (const elemento of ["red", "cuenta", "grupo", "pagina", "app", "api"] as const) {
        const r = proponerRespuesta(evTipo(tipo, elemento));
        expect(r.acciones.join("|")).not.toMatch(/bloquear|suspender/i);
        expect(r.motivo).not.toMatch(/bloquear|suspender/i);
      }
    }
  });
  it("los elementos con personas piden Círculo de Paz y decisión humana", () => {
    for (const elemento of ["cuenta", "grupo", "pagina"] as const) {
      const r = proponerRespuesta(evTipo("acceso-inusual", elemento));
      expect(r.requiereHumano).toBe(true);
      expect(r.motivo).toContain("Círculo de Paz");
      expect(r.acciones.some((a) => a.includes("Círculo de Paz"))).toBe(true);
    }
    expect(proponerRespuesta(evTipo("hallazgo-strix", "app")!).requiereHumano).toBe(false);
  });
  it("evento desconocido: revisión humana, nunca bloqueo", () => {
    const r = proponerRespuesta(null);
    expect(r.requiereHumano).toBe(true);
    expect(r.motivo).not.toMatch(/bloquear|suspender/i);
  });
});

describe("desdeSeveridadScanner y política", () => {
  it("mapea el vocabulario del escáner", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica");
    expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media");
    expect(desdeSeveridadScanner("low")).toBe("baja");
    expect(desdeSeveridadScanner("otro")).toBe("media");
  });
  it("ORDEN_SEVERIDAD y politicaPermite filtran por severidad y tipo", () => {
    expect(ORDEN_SEVERIDAD).toEqual(["critica", "alta", "media", "baja"]);
    const ev = construirEventoSeguridad(LIMITE, RECIENTE)!; // media · limite-peticiones
    expect(politicaPermite(ev, { severidadMinima: "baja" })).toBe(true);
    expect(politicaPermite(ev, { severidadMinima: "critica" })).toBe(false);
    expect(politicaPermite(ev, { severidadMinima: "baja", tipos: ["csp-informe"] })).toBe(false);
    expect(politicaPermite(ev, { severidadMinima: "media", tipos: ["limite-peticiones"] })).toBe(true);
    expect(politicaPermite(null, { severidadMinima: "baja" })).toBe(false);
  });
});
