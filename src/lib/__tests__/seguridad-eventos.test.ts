import { describe, expect, it } from "vitest";
import {
  construirEventoSeguridad,
  desdeSeveridadScanner,
  ORDEN_SEVERIDAD,
  politicaPermite,
  proponerRespuesta,
  pareceDatoPersonal,
  type EventoSeguridad,
} from "../security/eventos-seguridad";

const AHORA = 1792168800000; // fijo: el módulo no mira el reloj
const base = {
  tipo: "limite-peticiones" as const,
  severidad: "alta" as const,
  elemento: "api" as const,
  detalle: { ruta: "/api/mandar", limite: 30, ventanaMs: 60000 },
};

describe("construirEventoSeguridad", () => {
  it("valida el vocabulario: lo desconocido da null (falla cerrado)", () => {
    expect(construirEventoSeguridad(base, AHORA)).not.toBeNull();
    expect(construirEventoSeguridad({ ...base, tipo: "otra-cosa" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ ...base, severidad: "urgente" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ ...base, elemento: "cerebro" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad(null, AHORA)).toBeNull();
    expect(construirEventoSeguridad("ataque", AHORA)).toBeNull();
    expect(construirEventoSeguridad(base, Number.NaN)).toBeNull();
  });

  it("una clave desconocida del detalle no sale", () => {
    const ev = construirEventoSeguridad({ ...base, detalle: { ...base.detalle, secreto: "x" } }, AHORA);
    expect(ev).not.toBeNull();
    expect(Object.keys(ev!.detalle)).toEqual(["ruta", "limite", "ventanaMs"]);
  });

  it("el resumen es una plantilla fija: no cambia con la entrada", () => {
    const a = construirEventoSeguridad({ ...base, detalle: { ruta: "a" } }, AHORA);
    const b = construirEventoSeguridad({ ...base, detalle: { ruta: "b" } }, AHORA);
    expect(a!.resumen).toBe("Límite de peticiones alcanzado");
    expect(a!.resumen).toBe(b!.resumen);
    expect(a!.cuando).toBe(new Date(AHORA).toISOString());
    expect(a!.contador).toBeGreaterThanOrEqual(1);
  });

  it("id estable, distinto al cambiar el elemento y en otro cubo de 60 s", () => {
    const a = construirEventoSeguridad(base, AHORA);
    const b = construirEventoSeguridad(base, AHORA);
    const otro = construirEventoSeguridad({ ...base, elemento: "red" }, AHORA);
    expect(a!.id).toBe(b!.id);
    expect(a!.id.startsWith("evs-")).toBe(true);
    expect(a!.id).not.toBe(otro!.id);
    expect(construirEventoSeguridad(base, AHORA + 61000)!.id).not.toBe(a!.id);
  });

  it("descarta campos con forma de clave, correo o IP; conserva lo saneado", () => {
    const clave = "sk-" + "a".repeat(32);
    const ev = construirEventoSeguridad(
      {
        tipo: "secreto-detectado", severidad: "critica", elemento: "app",
        detalle: { familia: "clave de OpenAI", campo: clave, valor: clave,
          correoroto: "alguien@ejemplo.com", ip: "192.168.10.4", nota: "escaping" },
      },
      AHORA,
    ) as EventoSeguridad;
    const texto = JSON.stringify(ev);
    expect(texto).not.toContain(clave);
    expect(texto).not.toContain("@ejemplo.com");
    expect(texto).not.toContain("192.168.10.4");
    expect(ev.detalle).toEqual({ familia: "clave de OpenAI" });
    expect(ev.detalle["familia"]).toBe("clave de OpenAI");
  });
});

describe("pareceDatoPersonal", () => {
  it("detecta claves, correos, IP, JWT, hex y base64 largos; no palabras normales", () => {
    expect(pareceDatoPersonal("sk-" + "a".repeat(32))).toBe(true);
    expect(pareceDatoPersonal("ghp_abc123")).toBe(true);
    expect(pareceDatoPersonal("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(pareceDatoPersonal("eyJhbGciOi.eyJzdGF0.SflKxw")).toBe(true);
    expect(pareceDatoPersonal("de".repeat(24))).toBe(true); // hex de 48
    expect(pareceDatoPersonal("a".repeat(24))).toBe(true); // base64 de 24
    expect(pareceDatoPersonal("alguien@ejemplo.com")).toBe(true);
    expect(pareceDatoPersonal("2601:8db:f000:1234:5678:9abc:def0:1234")).toBe(true);
    expect(pareceDatoPersonal("ruta /api/mandar")).toBe(false);
    expect(pareceDatoPersonal("clave de OpenAI")).toBe(false);
    expect(pareceDatoPersonal("evs-17921688")).toBe(false);
  });
});

describe("desdeSeveridadScanner", () => {
  it("mapea el inglés del escáner; lo desconocido sube a critica", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica");
    expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media");
    expect(desdeSeveridadScanner("low")).toBe("baja");
    expect(desdeSeveridadScanner("otra")).toBe("critica");
  });
});

describe("politicaPermite", () => {
  const ev = construirEventoSeguridad({ ...base, severidad: "media" }, AHORA)!;
  it("filtra por severidad mínima y por tipos", () => {
    expect(politicaPermite(ev, { severidadMinima: "baja" })).toBe(true);
    expect(politicaPermite(ev, { severidadMinima: "media" })).toBe(true);
    expect(politicaPermite(ev, { severidadMinima: "alta" })).toBe(false);
    expect(politicaPermite(ev, { severidadMinima: "baja", tipos: ["limite-peticiones"] })).toBe(true);
    expect(politicaPermite(ev, { severidadMinima: "baja", tipos: ["csp-informe"] })).toBe(false);
    expect(ORDEN_SEVERIDAD).toEqual(["baja", "media", "alta", "critica"]);
  });
});

describe("proponerRespuesta", () => {
  const tipos = ["secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe",
    "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual"] as const;
  const elementos = ["red", "cuenta", "grupo", "pagina", "app", "api"] as const;

  it("nunca bloquea ni suspende, en ningún tipo ni elemento", () => {
    for (const tipo of tipos) {
      const ev = construirEventoSeguridad({ tipo, severidad: "alta", elemento: "api" }, AHORA)!;
      const r = proponerRespuesta(ev);
      const mezcla = r.acciones.join(" ") + " " + r.motivo;
      expect(mezcla.toLowerCase()).not.toContain("bloquear");
      expect(mezcla.toLowerCase()).not.toContain("suspender");
      expect(r.requiereHumano).toBe(false);
      expect(r.motivo).toContain("persona decide");
    }
  });

  it("cuenta, grupo y página: requiereHumano y remite al Círculo de Paz", () => {
    for (const elemento of elementos) {
      const ev = construirEventoSeguridad({ ...base, elemento }, AHORA)!;
      const r = proponerRespuesta(ev);
      if (elemento === "cuenta" || elemento === "grupo" || elemento === "pagina") {
        expect(r.requiereHumano).toBe(true);
        expect(r.motivo).toContain("Círculo de Paz");
      } else {
        expect(r.requiereHumano).toBe(false);
      }
    }
  });
});
