import { describe, expect, it } from "vitest";
import {
  ORDEN_SEVERIDAD,
  construirEventoSeguridad,
  desdeSeveridadScanner,
  pareceDatoPersonal,
  politicaPermite,
  proponerRespuesta,
  type EventoSeguridad,
  type TipoEventoSeguridad,
} from "@/lib/security/eventos-seguridad";

const AHORA = Date.UTC(2026, 9, 27, 12, 0, 30);
const BASE = {
  tipo: "limite-peticiones",
  severidad: "alta",
  elemento: "api",
  contador: 3,
  detalle: { ruta: "/api/salud", limite: 60, ventanaMs: 60_000 },
};

function evento(extra: Record<string, unknown> = {}): EventoSeguridad {
  const creado = construirEventoSeguridad({ ...BASE, ...extra }, AHORA);
  if (!creado) throw new Error("el evento de prueba debería construirse");
  return creado;
}

describe("desdeSeveridadScanner y orden", () => {
  it("mapea las cuatro severidades del escáner y usa un orden fijo", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica");
    expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media");
    expect(desdeSeveridadScanner("low")).toBe("baja");
    expect(ORDEN_SEVERIDAD).toEqual(["critica", "alta", "media", "baja"]);
  });
});

describe("construirEventoSeguridad", () => {
  it("falla cerrado ante una entrada inválida o fuera de vocabulario", () => {
    expect(construirEventoSeguridad(null, AHORA)).toBeNull();
    expect(construirEventoSeguridad("texto", AHORA)).toBeNull();
    expect(construirEventoSeguridad({ ...BASE, tipo: "otro" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ ...BASE, severidad: "critical" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad({ ...BASE, elemento: "persona" }, AHORA)).toBeNull();
    expect(construirEventoSeguridad(BASE, Number.NaN)).toBeNull();
  });

  it("calcula cuando desde ahoraMs, respeta el contador y usa plantilla fija", () => {
    const e = evento();
    expect(e.version).toBe(1);
    expect(e.cuando).toBe("2026-10-27T12:00:30.000Z");
    expect(e.contador).toBe(3);
    const otro = evento({ contador: -8, detalle: { ruta: "/otra" } });
    expect(otro.contador).toBe(1);
    expect(otro.resumen).toBe(e.resumen);
  });

  it("conserva solo claves de la lista blanca y descarta valores con datos personales", () => {
    const secreto = "sk-" + "a".repeat(32);
    const e = evento({
      detalle: {
        ruta: "persona@ejemplo.com",
        limite: "60",
        ventanaMs: "10.0.0.1",
        claveDesconocida: "no debe salir",
      },
      secreto,
    });
    expect(e.detalle).toEqual({ limite: "60" });
    expect("claveDesconocida" in e.detalle).toBe(false);
    expect(JSON.stringify(e)).not.toContain("claveDesconocida");
    expect(JSON.stringify(e)).not.toContain("persona@ejemplo.com");
    expect(JSON.stringify(e)).not.toContain(secreto);
  });

  it("el id es estable por minuto y cambia al cambiar el elemento", () => {
    const a = evento();
    const b = evento();
    const mismoMinuto = construirEventoSeguridad(BASE, AHORA + 20_000);
    const otroElemento = evento({ elemento: "red" });
    const otroMinuto = construirEventoSeguridad(BASE, AHORA + 60_000);
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(mismoMinuto?.id);
    expect(a.id.startsWith("evs-")).toBe(true);
    expect(a.id).not.toBe(otroElemento.id);
    expect(a.id).not.toBe(otroMinuto?.id);
  });

  it("ninguna cadena de la salida lleva clave, correo ni IP aunque entren", () => {
    const secreto = "sk-" + "a".repeat(32);
    const jwt = "eyJ" + "b".repeat(30) + "." + "c".repeat(20) + "." + "d".repeat(10);
    const e = evento({
      detalle: { ruta: secreto, limite: "ana@ejemplo.com", ventanaMs: "203.0.113.7" },
    });
    const salida = JSON.stringify(e);
    expect(salida).not.toContain(secreto);
    expect(salida).not.toContain("ana@ejemplo.com");
    expect(salida).not.toContain("203.0.113.7");
    expect(salida).not.toContain(jwt);
    expect(pareceDatoPersonal(secreto)).toBe(true);
    expect(pareceDatoPersonal(jwt)).toBe(true);
  });
});

describe("pareceDatoPersonal", () => {
  it("reconoce correos, IPs, JWT, cadenas largas y prefijos de clave", () => {
    expect(pareceDatoPersonal("ana@ejemplo.com")).toBe(true);
    expect(pareceDatoPersonal("192.168.1.20")).toBe(true);
    expect(pareceDatoPersonal("2001:db8::1")).toBe(true);
    expect(pareceDatoPersonal("eyJ" + "x".repeat(20) + ".firma.datos")).toBe(true);
    expect(pareceDatoPersonal("a".repeat(32))).toBe(true);
    expect(pareceDatoPersonal("ghp_" + "z".repeat(20))).toBe(true);
  });

  it("no marca texto normal de rutas ni vocabulario del evento", () => {
    expect(pareceDatoPersonal("/api/salud")).toBe(false);
    expect(pareceDatoPersonal("limite-peticiones")).toBe(false);
    expect(pareceDatoPersonal("api")).toBe(false);
  });
});

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

describe("proponerRespuesta", () => {
  it("propone acciones en español y nunca bloquea ni sanciona a nadie", () => {
    for (const tipo of TIPOS) {
      const e = evento({ tipo, elemento: "red" });
      const r = proponerRespuesta(e);
      const texto = [...r.acciones, r.motivo].join(" ").toLowerCase();
      expect(r.acciones.length).toBeGreaterThan(0);
      expect(texto).not.toContain("bloquear");
      expect(texto).not.toContain("suspender");
    }
  });

  it("exige una persona y remite a un Círculo de Paz si toca cuentas, grupos o páginas", () => {
    for (const elemento of ["cuenta", "grupo", "pagina"] as const) {
      const r = proponerRespuesta(evento({ elemento }));
      expect(r.requiereHumano).toBe(true);
      expect(r.motivo).toContain("Círculo de Paz");
    }
    expect(proponerRespuesta(evento({ severidad: "critica" })).requiereHumano).toBe(true);
    expect(proponerRespuesta(evento({ elemento: "red", severidad: "baja" })).requiereHumano).toBe(
      false,
    );
  });
});

describe("politicaPermite", () => {
  it("filtra por severidad mínima y por tipos permitidos", () => {
    const e = evento({ severidad: "alta" });
    expect(politicaPermite(e, { severidadMinima: "media" })).toBe(true);
    expect(politicaPermite(e, { severidadMinima: "critica" })).toBe(false);
    expect(politicaPermite(e, { severidadMinima: "baja", tipos: ["limite-peticiones"] })).toBe(
      true,
    );
    expect(politicaPermite(e, { severidadMinima: "baja", tipos: ["ssrf-bloqueado"] })).toBe(false);
    expect(politicaPermite(e, { severidadMinima: "baja", tipos: [] })).toBe(false);
  });
});
