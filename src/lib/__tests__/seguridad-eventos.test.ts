// ════════════════════════════════════════════════════════════════════════════
// Pruebas de eventos de seguridad saneados (INF1025A)
// ────────────────────────────────────────────────────────────────────────────
// Cubre el contrato de la tarea: lista blanca (falla cerrado), id estable,
// sin datos personales ni claves en la salida, resumen fijo, propuestas que
// nunca castigan y política de salida.
// ════════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from "vitest";

import {
  construirEventoSeguridad,
  desdeSeveridadScanner,
  ORDEN_SEVERIDAD,
  pareceDatoPersonal,
  politicaPermite,
  proponerRespuesta,
  type EventoSeguridad,
  type TipoEventoSeguridad,
} from "@/lib/security/eventos-seguridad";

const AHORA = 1_760_000_000_000; // fijo: sin reloj en las pruebas
const LOS_TIPOS: TipoEventoSeguridad[] = [
  "secreto-detectado",
  "limite-peticiones",
  "ssrf-bloqueado",
  "csp-informe",
  "repeticion-rechazada",
  "invariante-violada",
  "hallazgo-strix",
  "acceso-inusual",
];

function entradaBase(tipo: string): Record<string, unknown> {
  return { tipo, severidad: "alta", elemento: "api" };
}

describe("construirEventoSeguridad · falla cerrado", () => {
  it("entrada inválida devuelve null", () => {
    expect(construirEventoSeguridad(null, AHORA)).toBeNull();
    expect(construirEventoSeguridad(undefined, AHORA)).toBeNull();
    expect(construirEventoSeguridad("secreto-detectado", AHORA)).toBeNull();
    expect(construirEventoSeguridad(42, AHORA)).toBeNull();
    expect(construirEventoSeguridad([], AHORA)).toBeNull();
  });

  it("tipo desconocido devuelve null (no adivina)", () => {
    expect(
      construirEventoSeguridad({ tipo: "cosa-rara", severidad: "alta", elemento: "api" }, AHORA),
    ).toBeNull();
    expect(construirEventoSeguridad(entradaBase("SSRF"), AHORA)).toBeNull();
  });

  it("severidad y elemento fuera del vocabulario devuelven null", () => {
    expect(
      construirEventoSeguridad({ ...entradaBase("ssrf-bloqueado"), severidad: "critical" }, AHORA),
    ).toBeNull();
    expect(
      construirEventoSeguridad({ ...entradaBase("ssrf-bloqueado"), elemento: "persona" }, AHORA),
    ).toBeNull();
    expect(
      construirEventoSeguridad({ severidad: "alta", elemento: "api" }, AHORA),
    ).toBeNull();
  });

  it("ahoraMs no finito devuelve null", () => {
    expect(
      construirEventoSeguridad(entradaBase("ssrf-bloqueado"), Number.NaN),
    ).toBeNull();
  });
});

describe("construirEventoSeguridad · forma del evento", () => {
  it("evento válido con los campos del contrato", () => {
    const e = construirEventoSeguridad(
      { ...entradaBase("limite-peticiones"), detalle: { ruta: "/api/feed", limite: 30, ventanaMs: 60_000 } },
      AHORA,
    );
    expect(e).not.toBeNull();
    expect(e?.version).toBe(1);
    expect(e?.tipo).toBe("limite-peticiones");
    expect(e?.severidad).toBe("alta");
    expect(e?.elemento).toBe("api");
    expect(e?.contador).toBe(1);
    expect(e?.cuando).toBe(new Date(AHORA).toISOString());
    expect(e?.resumen).toBe("Una ruta alcanzó su límite de peticiones.");
    expect(e?.detalle).toEqual({ ruta: "/api/feed", limite: 30, ventanaMs: 60_000 });
  });

  it("contador validado: ≥ 1 o vuelve a 1", () => {
    const con3 = construirEventoSeguridad(
      { ...entradaBase("csp-informe"), contador: 3 },
      AHORA,
    );
    expect(con3?.contador).toBe(3);
    const loco = construirEventoSeguridad(
      { ...entradaBase("csp-informe"), contador: 0 },
      AHORA,
    );
    expect(loco?.contador).toBe(1);
    const texto = construirEventoSeguridad(
      { ...entradaBase("csp-informe"), contador: "3" },
      AHORA,
    );
    expect(texto?.contador).toBe(1);
  });

  it("el resumen sale de la plantilla y no cambia con la entrada", () => {
    const a = construirEventoSeguridad(
      { ...entradaBase("hallazgo-strix"), detalle: { familia: "cadena" } },
      AHORA,
    );
    const b = construirEventoSeguridad(
      { ...entradaBase("hallazgo-strix"), detalle: { familia: "ipa" }, comentario: "todo distinto" },
      AHORA,
    );
    expect(a?.resumen).toBe(b?.resumen);
    expect(a?.resumen).toBe("La auditoría de Strix trae un hallazgo nuevo.");
  });
});

describe("construirEventoSeguridad · detalle saneado", () => {
  it("una clave desconocida del detalle no sale", () => {
    const e = construirEventoSeguridad(
      {
        ...entradaBase("secreto-detectado"),
        detalle: { familia: "clave_api", campo: "旧", valor_secreto: "superviviente" },
      },
      AHORA,
    );
    expect(e?.detalle).toEqual({ familia: "clave_api", campo: "旧" });
    expect(e?.detalle).not.toHaveProperty("valor_secreto");
  });

  it("un valor con pinta de dato personal se descarta, no se enmascara", () => {
    const e = construirEventoSeguridad(
      {
        ...entradaBase("secreto-detectado"),
        detalle: { familia: "clave_api", campo: "ana@ejemplo.com" },
      },
      AHORA,
    );
    expect(e?.detalle).toEqual({ familia: "clave_api" });
  });

  it("una cadena de más de 80 caracteres se descarta", () => {
    const e = construirEventoSeguridad(
      { ...entradaBase("invariante-violada"), detalle: { invariante: "x".repeat(81) } },
      AHORA,
    );
    expect(e?.detalle).toEqual({});
  });

  it("ninguna cadena de la salida lleva forma de clave, correo ni IP", () => {
    const claveLarga = "sk-" + "a".repeat(32);
    const e = construirEventoSeguridad(
      {
        ...entradaBase("secreto-detectado"),
        detalle: { familia: claveLarga, campo: "ana@ejemplo.com" },
        donde: "192.168.1.4",
      },
      AHORA,
    );
    const texto = JSON.stringify(e);
    expect(texto).not.toContain(claveLarga);
    expect(texto).not.toContain("ana@ejemplo.com");
    expect(texto).not.toContain("192.168.1.4");
  });
});

describe("construirEventoSeguridad · id determinista", () => {
  const entrada = {
    ...entradaBase("limite-peticiones"),
    detalle: { ruta: "/api/feed", limite: 30, ventanaMs: 60_000 },
  };

  it("mismos datos, mismo id; y empieza por evs-", () => {
    const a = construirEventoSeguridad(entrada, AHORA);
    const b = construirEventoSeguridad(entrada, AHORA);
    expect(a?.id).toBe(b?.id);
    expect(a?.id.startsWith("evs-")).toBe(true);
  });

  it("dentro del mismo cubo de 60 s el id no cambia", () => {
    const a = construirEventoSeguridad(entrada, AHORA);
    const b = construirEventoSeguridad(entrada, AHORA + 30_000);
    expect(a?.id).toBe(b?.id);
  });

  it("al cruzar el cubo de 60 s el id cambia", () => {
    const a = construirEventoSeguridad(entrada, AHORA);
    const b = construirEventoSeguridad(entrada, AHORA + 60_000);
    expect(a?.id).not.toBe(b?.id);
  });

  it("cambiar el elemento cambia el id", () => {
    const a = construirEventoSeguridad(entrada, AHORA);
    const b = construirEventoSeguridad(
      { ...entrada, elemento: "red" },
      AHORA,
    );
    expect(a?.id).not.toBe(b?.id);
  });
});

describe("pareceDatoPersonal", () => {
  it("correos, IPs, JWT y prefijos de clave salen cierto", () => {
    expect(pareceDatoPersonal("ana@ejemplo.com")).toBe(true);
    expect(pareceDatoPersonal("192.168.1.4")).toBe(true);
    expect(pareceDatoPersonal("fe80::1")).toBe(true);
    expect(pareceDatoPersonal("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbmEi.x")).toBe(true);
    expect(pareceDatoPersonal("sk-" + "a".repeat(32))).toBe(true);
    expect(pareceDatoPersonal("ghp_" + "b".repeat(24))).toBe(true);
    expect(pareceDatoPersonal("AKIA" + "c".repeat(24))).toBe(true);
    expect(pareceDatoPersonal("a".repeat(30))).toBe(true);
    expect(pareceDatoPersonal("ABCDEF0123456789ABCDEF01")).toBe(true);
  });

  it("rutas, palabras y tiempos normales salen falso", () => {
    expect(pareceDatoPersonal("/api/feed")).toBe(false);
    expect(pareceDatoPersonal("invariante-violada")).toBe(false);
    expect(pareceDatoPersonal("60000")).toBe(false);
    expect(pareceDatoPersonal("2026-10-27T09:00:00.000Z")).toBe(false);
    expect(pareceDatoPersonal("muchas palabras de personas sin forma de credencial")).toBe(false);
  });
});

describe("desdeSeveridadScanner", () => {
  it("mapea el vocabulario del escáner al de eventos", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica");
    expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media");
    expect(desdeSeveridadScanner("low")).toBe("baja");
  });

  it("lo desconocido baja a baja (falla cerrado)", () => {
    expect(desdeSeveridadScanner("critica")).toBe("baja");
    expect(desdeSeveridadScanner("")).toBe("baja");
  });
});

describe("ORDEN_SEVERIDAD y politicaPermite", () => {
  it("ORDEN_SEVERIDAD va de la más fuerte a la más leve", () => {
    expect(ORDEN_SEVERIDAD).toEqual(["critica", "alta", "media", "baja"]);
  });

  function eventoDeSeveridad(severidad: EventoSeguridad["severidad"]): EventoSeguridad {
    const e = construirEventoSeguridad({ ...entradaBase("csp-informe"), severidad }, AHORA);
    expect(e).not.toBeNull();
    return e as EventoSeguridad;
  }

  it("severidadMinima deja pasar la mínima y las más fuertes", () => {
    const politica = { severidadMinima: "alta" as EventoSeguridad["severidad"] };
    expect(politicaPermite(eventoDeSeveridad("critica"), politica)).toBe(true);
    expect(politicaPermite(eventoDeSeveridad("alta"), politica)).toBe(true);
    expect(politicaPermite(eventoDeSeveridad("media"), politica)).toBe(false);
    expect(politicaPermite(eventoDeSeveridad("baja"), politica)).toBe(false);
  });

  it("el filtro por tipos es lista blanca", () => {
    const politica = {
      severidadMinima: "baja" as EventoSeguridad["severidad"],
      tipos: ["secreto-detectado" as TipoEventoSeguridad],
    };
    expect(politicaPermite(eventoDeSeveridad("alta"), politica)).toBe(false);
    const secreto = construirEventoSeguridad(
      { ...entradaBase("secreto-detectado"), severidad: "critica" },
      AHORA,
    );
    expect(politicaPermite(secreto, politica)).toBe(true);
  });

  it("evento nulo y política inválida no pasan", () => {
    expect(politicaPermite(null, { severidadMinima: "baja" })).toBe(false);
  });
});

describe("proponerRespuesta", () => {
  const LOS_ELEMENTOS: EventoSeguridad["elemento"][] = [
    "red",
    "cuenta",
    "grupo",
    "pagina",
    "app",
    "api",
  ];

  function eventoDe(tipo: TipoEventoSeguridad, elemento: EventoSeguridad["elemento"]): EventoSeguridad {
    const e = construirEventoSeguridad({ ...entradaBase(tipo), elemento }, AHORA);
    expect(e).not.toBeNull();
    return e as EventoSeguridad;
  }

  it("jamás propone bloqueos ni suspensiones automáticas", () => {
    for (const tipo of LOS_TIPOS) {
      for (const elemento of LOS_ELEMENTOS) {
        const propuesta = proponerRespuesta(eventoDe(tipo, elemento));
        const letra = `${propuesta.acciones.join(" | ")} ${propuesta.motivo}`.toLowerCase();
        expect(letra).not.toContain("bloquear");
        expect(letra).not.toContain("suspender");
        expect(propuesta.acciones.length).toBeGreaterThan(0);
        expect(propuesta.motivo.length).toBeGreaterThan(0);
      }
    }
  });

  it("cuenta, grupo y página remiten a un Círculo de Paz con humano", () => {
    for (const elemento of ["cuenta", "grupo", "pagina"] as const) {
      const propuesta = proponerRespuesta(eventoDe("acceso-inusual", elemento));
      expect(propuesta.requiereHumano).toBe(true);
      expect(propuesta.motivo).toContain("Círculo de Paz");
    }
  });

  it("red, app y api no exigen humano de entrada", () => {
    for (const elemento of ["red", "app", "api"] as const) {
      const propuesta = proponerRespuesta(eventoDe("csp-informe", elemento));
      expect(propuesta.requiereHumano).toBe(false);
    }
  });

  it("secreto-detectado propone rotarla a su dueña, nunca la adivina", () => {
    const propuesta = proponerRespuesta(eventoDe("secreto-detectado", "api"));
    expect(propuesta.acciones.join(" ")).toContain("rotar la clave: la rota su dueña");
    expect(propuesta.acciones.join(" ")).not.toContain("sk-");
  });
});
