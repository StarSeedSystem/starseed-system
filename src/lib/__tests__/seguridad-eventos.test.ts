// src/lib/__tests__/seguridad-eventos.test.ts
// Pruebas del módulo puro de eventos de seguridad (INF1025A): lista blanca,
// falla cerrado, id determinista y saneado sin datos de nadie.
import { describe, expect, it } from "vitest";
import {
  ORDEN_SEVERIDAD,
  construirEventoSeguridad,
  desdeSeveridadScanner,
  politicaPermite,
  proponerRespuesta,
  pareceDatoPersonal,
  type EventoSeguridad,
} from "@/lib/security/eventos-seguridad";

const AHORA = 1_770_000_000_000; // instante fijo: nada de reloj del proceso

function textos(obj: unknown): string[] {
  const s: string[] = [];
  if (typeof obj === "string") s.push(obj);
  else if (Array.isArray(obj)) for (const v of obj) s.push(...textos(v));
  else if (obj && typeof obj === "object")
    for (const v of Object.values(obj)) s.push(...textos(v));
  return s;
}

describe("construirEventoSeguridad · falla cerrado", () => {
  it("devuelve null ante entradas inválidas o fuera del vocabulario", () => {
    expect(construirEventoSeguridad(null, AHORA)).toBeNull();
    expect(construirEventoSeguridad("texto", AHORA)).toBeNull();
    expect(construirEventoSeguridad([1], AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "otro", severidad: "alta", elemento: "api" }, AHORA)).toBeNull();
    expect(
      construirEventoSeguridad(
        { tipo: "limites", severidad: "alta", elemento: "api" },
        AHORA,
      ),
    ).toBeNull();
    expect(construirEventoSeguridad({ tipo: "secreto-detectado", severidad: "must", elemento: "api" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "secreto-detectado", severidad: "alta", elemento: "calle" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ tipo: "secreto-detectado", severidad: "alta", elemento: "api" }, NaN)).toBeNull();
  });

  it("construye un evento válido con contador e instante por parámetro", () => {
    const e = construirEventoSeguridad(
      { tipo: "limite-peticiones", severidad: "media", elemento: "api", contador: 3 },
      AHORA,
    );
    expect(e).not.toBeNull();
    expect(e?.version).toBe(1);
    expect(e?.contador).toBe(3);
    expect(e?.cuando).toBe(new Date(AHORA).toISOString());
  });

  it("deja el contador en 1 ante valores raros", () => {
    const e = construirEventoSeguridad(
      { tipo: "limite-peticiones", severidad: "media", elemento: "api", contador: 0 },
      AHORA,
    );
    expect(e?.contador).toBe(1);
  });
});

describe("detalle por lista blanca", () => {
  it("una clave desconocida del detalle no sale", () => {
    const e = construirEventoSeguridad(
      {
        tipo: "limite-peticiones",
        severidad: "media",
        elemento: "api",
        detalle: { ruta: "/api/feed", limite: 5, ventanaMs: 60_000, extra: "no" },
      },
      AHORA,
    );
    expect(e?.detalle).toEqual({ ruta: "/api/feed", limite: 5, ventanaMs: 60_000 });
  });

  it("claves fuera de la lista blanca de su tipo no salen", () => {
    const e = construirEventoSeguridad(
      {
        tipo: "secreto-detectado",
        severidad: "critica",
        elemento: "api",
        detalle: { familia: "clave_api", campo: "apikey", ruta: "/api/feed" },
      },
      AHORA,
    );
    expect(e?.detalle).toEqual({ familia: "clave_api", campo: "apikey" });
  });
});

describe("saneado: nada de la salida parece clave, correo ni IP", () => {
  const secreto = "sk-" + "a".repeat(32);
  const entrada = {
    tipo: "secreto-detectado",
    severidad: "critica",
    elemento: "api",
    detalle: {
      familia: secreto,
      campo: "alex@fundacion.starseed",
      intento: "192.168.1.44:8080",
    },
  };
  const e = construirEventoSeguridad(entrada, AHORA);

  it("los valores con forma dato personal se descartan del detalle", () => {
    expect(e?.detalle).toEqual({});
  });

  it("ninguna cadena de la salida contiene el secreto de la entrada", () => {
    for (const t of textos(e)) {
      expect(t.includes(secreto)).toBe(false);
      expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)).toBe(false);
      expect(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(t)).toBe(false);
    }
  });
});

describe("id determinista", () => {
  const entrada = { tipo: "limite-peticiones", severidad: "alta", elemento: "api" };

  it("es estable con la misma entrada e instante", () => {
    const a = construirEventoSeguridad(entrada, AHORA);
    const b = construirEventoSeguridad(entrada, AHORA);
    expect(a?.id).toBe(b?.id);
    expect(a?.id.startsWith("evs-")).toBe(true);
  });

  it("cambia al cambiar el elemento y al cambiar de cubo de 60 s", () => {
    const otro = construirEventoSeguridad({ ...entrada, elemento: "red" }, AHORA);
    const despues = construirEventoSeguridad(entrada, AHORA + 61_000);
    expect(otro?.id).not.toBe(construirEventoSeguridad(entrada, AHORA)?.id);
    expect(despues?.id).not.toBe(construirEventoSeguridad(entrada, AHORA)?.id);
  });
});

describe("resumen fijo y severidades", () => {
  it("el resumen no cambia con la entrada", () => {
    const a = construirEventoSeguridad(
      { tipo: "csp-informe", severidad: "baja", elemento: "pagina", detalle: { directiva: "default-src" } },
      AHORA,
    );
    const b = construirEventoSeguridad(
      { tipo: "csp-informe", severidad: "critica", elemento: "app", detalle: { violaciones: 9 } },
      AHORA,
    );
    expect(a?.resumen).toBe(b?.resumen);
    expect(a?.resumen.length).toBeGreaterThan(0);
  });

  it("desdeSeveridadScanner mapea y falla cerrado", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica");
    expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media");
    expect(desdeSeveridadScanner("low")).toBe("baja");
    expect(desdeSeveridadScanner("extreme")).toBeNull();
  });
});

describe("pareceDatoPersonal", () => {
  it("true ante secreto, correo, IP o cadena larga hex/base64", () => {
    expect(pareceDatoPersonal("sk-" + "a".repeat(32))).toBe(true);
    expect(pareceDatoPersonal("ghp_abcdef1234567890")).toBe(true);
    expect(pareceDatoPersonal("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(pareceDatoPersonal("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.abc")).toBe(true);
    expect(pareceDatoPersonal("alex@fundacion.starseed")).toBe(true);
    expect(pareceDatoPersonal("192.168.1.44")).toBe(true);
    expect(pareceDatoPersonal("2001:db8::1")).toBe(true);
    expect(pareceDatoPersonal("a1b2c3d4e5f6a1b2c3d4e5f6")).toBe(true);
  });

  it("false ante texto normal o entradas raras", () => {
    expect(pareceDatoPersonal("ruta de la API")).toBe(false);
    expect(pareceDatoPersonal("")).toBe(false);
    expect(pareceDatoPersonal("/api/feed")).toBe(false);
  });
});

describe("proponerRespuesta · justicia restaurativa", () => {
  const eventos: EventoSeguridad[] = (
    [
      ["secreto-detectado", "critica", "api"],
      ["limite-peticiones", "media", "red"],
      ["ssrf-bloqueado", "alta", "api"],
      ["csp-informe", "baja", "pagina"],
      ["repeticion-rechazada", "baja", "red"],
      ["invariante-violada", "alta", "app"],
      ["hallazgo-strix", "alta", "api"],
      ["acceso-inusual", "alta", "cuenta"],
    ] as const
  ).map(([tipo, severidad, elemento]) =>
    construirEventoSeguridad({ tipo, severidad, elemento }, AHORA),
  ) as EventoSeguridad[];

  it("nunca propone bloquear ni suspender", () => {
    for (const e of eventos) {
      const r = proponerRespuesta(e);
      expect(r.motivo.toLowerCase().includes("bloque")).toBe(false);
      expect(r.motivo.toLowerCase().includes("suspend")).toBe(false);
      for (const a of r.acciones) {
        expect(a.toLowerCase().includes("bloque")).toBe(false);
        expect(a.toLowerCase().includes("suspend")).toBe(false);
      }
    }
  });

  it("cuenta, grupo y pagina exigen humano y remiten a un Círculo de Paz", () => {
    for (const e of eventos.filter((e) => ["cuenta", "grupo", "pagina"].includes(e.elemento))) {
      const r = proponerRespuesta(e);
      expect(r.requiereHumano).toBe(true);
      expect(r.motivo).toContain("Círculo de Paz");
    }
  });

  it("api y red proponen sin exigir humano (salvo secreto detectado)", () => {
    const r = proponerRespuesta(eventos[1]!);
    expect(r.requiereHumano).toBe(false);
    expect(proponerRespuesta(eventos[0]!).requiereHumano).toBe(true);
  });
});

describe("politicaPermite y ORDEN_SEVERIDAD", () => {
  const critica = construirEventoSeguridad(
    { tipo: "secreto-detectado", severidad: "critica", elemento: "api" },
    AHORA,
  ) as EventoSeguridad;
  const media = construirEventoSeguridad(
    { tipo: "limite-peticiones", severidad: "media", elemento: "red" },
    AHORA,
  ) as EventoSeguridad;

  it("el orden es de lo flojo a lo fuerte", () => {
    expect(ORDEN_SEVERIDAD).toEqual(["baja", "media", "alta", "critica"]);
  });

  it("respeta el umbral y, si la política lista tipos, la pertenencia", () => {
    expect(politicaPermite(critica, { severidadMinima: "critica" })).toBe(true);
    expect(politicaPermite(critica, { severidadMinima: "baja" })).toBe(true);
    expect(politicaPermite(media, { severidadMinima: "alta" })).toBe(false);
    expect(politicaPermite(critica, { severidadMinima: "baja", tipos: ["hallazgo-strix"] })).toBe(false);
    expect(
      politicaPermite(critica, { severidadMinima: "baja", tipos: ["secreto-detectado", "csp-informe"] }),
    ).toBe(true);
  });
});
