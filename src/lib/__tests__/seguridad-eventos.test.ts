import { describe, it, expect } from "vitest";
import {
  construirEventoSeguridad,
  proponerRespuesta,
  politicaPermite,
  desdeSeveridadScanner,
  pareceDatoPersonal,
  type EventoSeguridad,
  type TipoEventoSeguridad,
  type ElementoRed,
} from "@/lib/security/eventos-seguridad";

const AHORA = 1769000000000;

const CLAVE = "sk-" + "a".repeat(32);
const TOKEN = "ghp_" + "b".repeat(30);
const CORREO = ["una", "persona"].join(".") + "@" + ["ejemplo", "org"].join(".");
const IP = ["10", "24", "8", "9"].join(".");

const TIPOS: TipoEventoSeguridad[] = [
  "secreto-detectado",
  "limite-peticiones",
  "ssrf-bloqueado",
  "csp-informe",
  "repeticion-rechazada",
  "invariante-violada",
  "hallazgo-strix",
  "acceso-inusual",
];
const ELEMENTOS: ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];

function evento(tipo: TipoEventoSeguridad, detalle: Record<string, unknown> = {}) {
  return construirEventoSeguridad({ tipo, severidad: "media", elemento: "app", detalle }, AHORA);
}

function cadenasDe(valor: unknown): string[] {
  const out: string[] = [];
  const paso = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(paso);
    else if (v && typeof v === "object") Object.values(v).forEach(paso);
  };
  paso(valor);
  return out;
}

describe("construirEventoSeguridad", () => {
  it("construye el evento con vocabulario válido y detalle en lista blanca", () => {
    const e = evento("limite-peticiones", { ruta: "/api/ai/router", limite: 100, ventanaMs: 60000, trendy: "extra" });
    expect(e).not.toBeNull();
    expect(e?.version).toBe(1);
    expect(e?.tipo).toBe("limite-peticiones");
    expect(e?.severidad).toBe("media");
    expect(e?.elemento).toBe("app");
    expect(e?.cuando).toBe(new Date(AHORA).toISOString());
    expect(e?.contador).toBe(1);
    expect(e?.id).toMatch(/^evs-[0-9a-f]{8}$/);
    expect(e?.detalle).toEqual({ limite: 100, ventanaMs: 60000, ruta: "/api/ai/router" });
  });

  it("una clave desconocida del detalle no sale", () => {
    const e = evento("limite-peticiones", { ruta: "/api/ai", IP_origen: IP });
    expect(Object.keys(e?.detalle ?? {})).toEqual(["ruta"]);
  });

  it("entrada inválida devuelve null (falla cerrado)", () => {
    expect(construirEventoSeguridad(null, AHORA)).toBeNull();
    expect(construirEventoSeguridad(["x"], AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "tipo-raro", severidad: "alta", elemento: "app" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ severidad: "alta", elemento: "app" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "csp-informe", severidad: "altísima", elemento: "app" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "csp-informe", severidad: "alta", elemento: "huerto" }, AHORA)).toBeNull();
    expect(
      construirEventoSeguridad({ tipo: "csp-informe", severidad: "alta", elemento: "app" }, Number.NaN),
    ).toBeNull();
  });

  it("el id es estable al repetir la entrada y cambia al cambiar el elemento", () => {
    const entrada = { tipo: "limite-peticiones", severidad: "alta", elemento: "app", detalle: { ruta: "/api/ai" } };
    const primero = construirEventoSeguridad(entrada, AHORA);
    const repetido = construirEventoSeguridad(entrada, AHORA);
    expect(repetido?.id).toBe(primero?.id);
    const otroElemento = construirEventoSeguridad({ ...entrada, elemento: "api" }, AHORA);
    expect(otroElemento?.id).not.toBe(primero?.id);
  });

  it("ninguna cadena de la salida lleva claves, correos ni IPs", () => {
    for (const tipo of TIPOS) {
      const e = evento(tipo, { familia: CLAVE, campo: CORREO, motivo: CLAVE, ruta: `${"/api/" }${IP}` });
      expect(e).not.toBeNull();
      for (const cadena of cadenasDe(e)) {
        expect(cadena).not.toContain(CLAVE);
        expect(cadena).not.toContain(TOKEN);
        expect(cadena).not.toContain("@");
        expect(cadena).not.toContain(IP);
      }
    }
  });

  it("el resumen sale de la plantilla y no cambia con la entrada", () => {
    const uno = construirEventoSeguridad({ tipo: "ssrf-bloqueado", severidad: "alta", elemento: "api", detalle: { motivo: "texto uno" } }, AHORA);
    const dos = construirEventoSeguridad({ tipo: "ssrf-bloqueado", severidad: "alta", elemento: "api", detalle: { motivo: "otro texto" } }, AHORA);
    expect(uno?.resumen).toBe("Se detuvo una petición hacia un destino no permitido.");
    expect(dos?.resumen).toBe(uno?.resumen);
  });

  it("los valores con pinta de dato personal se descartan (no se enmascaran)", () => {
    const e = evento("secreto-detectado", { familia: "clave_api", campo: CORREO, favismo: CLAVE });
    expect(e?.detalle).toEqual({ familia: "clave_api" });
    expect(e?.contador).toBe(1);
  });
});

describe("pareceDatoPersonal", () => {
  it("detecta claves, correos, IPs, JWT, hex y base64", () => {
    expect(pareceDatoPersonal(CLAVE)).toBe(true);
    expect(pareceDatoPersonal(TOKEN)).toBe(true);
    expect(pareceDatoPersonal("AKIA" + "c".repeat(20))).toBe(true);
    expect(pareceDatoPersonal("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef")).toBe(true);
    expect(pareceDatoPersonal("a".repeat(24))).toBe(true);
    expect(pareceDatoPersonal("a1b2c3d4e5f6a1b2c3d4e5f6")).toBe(true);
    expect(pareceDatoPersonal(CORREO)).toBe(true);
    expect(pareceDatoPersonal(IP)).toBe(true);
    expect(pareceDatoPersonal("fe80::1")).toBe(true);
  });

  it("no marca texto normal", () => {
    expect(pareceDatoPersonal("abra un caso en el Círculo de Paz")).toBe(false);
    expect(pareceDatoPersonal("/api/ai/router")).toBe(false);
    expect(pareceDatoPersonal("")).toBe(true);
  });
});

describe("desdeSeveridadScanner", () => {
  it("mapea el vocabulario inglés del escáner", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica");
    expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media");
    expect(desdeSeveridadScanner("low")).toBe("baja");
    expect(desdeSeveridadScanner("urgente")).toBeNull();
  });
});

describe("proponerRespuesta", () => {
  it("nunca propone bloquear ni suspender, en ningún tipo ni elemento", () => {
    for (const tipo of TIPOS) {
      for (const elemento of ELEMENTOS) {
        const e = construirEventoSeguridad({ tipo, severidad: "alta", elemento }, AHORA) as EventoSeguridad;
        const propuesta = proponerRespuesta(e);
        const texto = JSON.stringify(propuesta);
        expect(texto).not.toContain("bloquear");
        expect(texto).not.toContain("suspender");
        expect(propuesta.acciones.length).toBeGreaterThan(0);
      }
    }
  });

  it("cuenta, grupo y página requieren persona y remiten a un Círculo de Paz", () => {
    for (const elemento of ["cuenta", "grupo", "pagina"] as ElementoRed[]) {
      const e = construirEventoSeguridad({ tipo: "acceso-inusual", severidad: "alta", elemento }, AHORA) as EventoSeguridad;
      const propuesta = proponerRespuesta(e);
      expect(propuesta.requiereHumano).toBe(true);
      expect(propuesta.motivo).toContain("Círculo de Paz");
    }
  });

  it("elementos técnicos no requieren persona", () => {
    for (const elemento of ["red", "app", "api"] as ElementoRed[]) {
      const e = construirEventoSeguridad({ tipo: "invariante-violada", severidad: "critica", elemento }, AHORA) as EventoSeguridad;
      expect(proponerRespuesta(e).requiereHumano).toBe(false);
    }
  });
});

describe("politicaPermite", () => {
  const e = construirEventoSeguridad(
    { tipo: "csp-informe", severidad: "media", elemento: "app" },
    AHORA,
  ) as EventoSeguridad;

  it("aplica el umbral de severidad", () => {
    expect(politicaPermite(e, { severidadMinima: "media" })).toBe(true);
    expect(politicaPermite(e, { severidadMinima: "baja" })).toBe(true);
    expect(politicaPermite(e, { severidadMinima: "alta" })).toBe(false);
    expect(politicaPermite(e, { severidadMinima: "critica" })).toBe(false);
  });

  it("aplica la lista de tipos si la política la trae", () => {
    expect(politicaPermite(e, { severidadMinima: "baja", tipos: ["csp-informe", "ssrf-bloqueado"] })).toBe(true);
    expect(politicaPermite(e, { severidadMinima: "baja", tipos: ["ssrf-bloqueado"] })).toBe(false);
  });
});
