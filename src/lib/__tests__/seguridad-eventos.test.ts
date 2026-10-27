import { describe, it, expect } from "vitest";
import {
  construirEventoSeguridad, desdeSeveridadScanner, ORDEN_SEVERIDAD, pareceDatoPersonal,
  politicaPermite, proponerRespuesta, TIPOS_EVENTO, type EventoSeguridad,
} from "@/lib/security/eventos-seguridad";
// (Ola 1025R · INF1025A) La promesa: lo detectado sale SANEADO hacia Tracecat — ni correos,
// IPs ni claves; si un campo o valor no está en la lista blanca no sale. Reloj fijo: el módulo
// lo recibe por parámetro, nunca mira la hora del mundo.
const AHORA = 1_760_000_000_000;
const ENTRADA = {
  tipo: "limite-peticiones", severidad: "media", elemento: "api", contador: 3,
  detalle: { ruta: "/api/genesis", limite: 120, ventanaMs: 60_000 },
};
function construir(cambios: Record<string, unknown> = {}): EventoSeguridad | null {
  return construirEventoSeguridad({ ...ENTRADA, ...cambios }, AHORA);
}
function cadenas(x: unknown, todo: string[] = []): string[] {
  if (typeof x === "string") todo.push(x);
  else if (Array.isArray(x)) x.forEach((v) => cadenas(v, todo));
  else if (typeof x === "object" && x !== null)
    for (const [clave, valor] of Object.entries(x)) { todo.push(clave); cadenas(valor, todo); }
  return todo;
}
describe("falla cerrado", () => {
  it("acepta una entrada del vocabulario y devuelve el evento completo", () => {
    const e = construir()!;
    expect(e.version).toBe(1); expect(e.tipo).toBe("limite-peticiones");
    expect(e.severidad).toBe("media"); expect(e.elemento).toBe("api");
    expect(e.contador).toBe(3); expect(e.id).toMatch(/^evs-[0-9a-f]+$/);
    expect(e.cuando).toBe(new Date(AHORA).toISOString());
  });
  it("devuelve null ante vocabulario, entrada o reloj inválidos", () => {
    expect(construir({ tipo: "raro" })).toBeNull(); expect(construir({ severidad: "fatal" })).toBeNull();
    expect(construir({ elemento: "persona" })).toBeNull();
    expect(construirEventoSeguridad("texto", AHORA)).toBeNull(); expect(construirEventoSeguridad([], AHORA)).toBeNull();
    expect(construirEventoSeguridad(ENTRADA, Number.NaN)).toBeNull();
  });
  it("contador inválido cae a 1, nunca menor que 1", () => {
    expect(construir({ contador: 0 })?.contador).toBe(1); expect(construir({ contador: 2.5 })?.contador).toBe(1);
    expect(construir({ contador: "x" })?.contador).toBe(1); expect(construir({ contador: 7 })?.contador).toBe(7);
  });
});
describe("lista blanca del detalle", () => {
  it("una clave desconocida del detalle no sale; las permitidas sí", () => {
    const e = construir({ detalle: { ruta: "/api/genesis", limite: 120, filtrados: 9 } });
    expect(Object.keys(e?.detalle ?? {}).sort()).toEqual(["limite", "ruta"]);
  });
  it("los valores con forma de dato personal se descartan, nunca se enmascaran", () => {
    const e = construir({ detalle: { ruta: "a@b.example", limite: "sk-" + "a".repeat(32), ventanaMs: "192.168.4.20" } });
    expect(e).not.toBeNull(); expect(Object.keys(e?.detalle ?? {})).toEqual([]);
  });
  it("cadenas largas se recortan; se descartan si el recorte parece dato personal", () => {
    const larga = "texto-largo-" + "x".repeat(100);
    expect(construir({ detalle: { ruta: larga } })?.detalle.ruta).toBe(larga.slice(0, 80));
    expect(construir({ detalle: { ruta: "sk-" + "b".repeat(100) } })?.detalle.ruta).toBeUndefined();
  });
  it("secreto-detectado lleva familia y campo, jamás el valor", () => {
    const e = construirEventoSeguridad({ tipo: "secreto-detectado", severidad: "critica", elemento: "red", detalle: { familia: "clave-servidor", campo: "sk_env_iw", valor: "sk-" + "c".repeat(40) } }, AHORA)!;
    expect(Object.keys(e.detalle).sort()).toEqual(["campo", "familia"]);
    expect(JSON.stringify(e)).not.toContain("sk-");
  });
});
describe("id determinista y resumen por plantilla", () => {
  it("el id es estable entre iguales y distinto al cambiar elemento o cubo de 60 s", () => {
    const base = construir();
    expect(base?.id).toBe(construir()?.id);
    expect(construir({ elemento: "app" })?.id).not.toBe(base?.id);
    expect(construirEventoSeguridad(ENTRADA, AHORA + 60_000)?.id).not.toBe(base?.id);
  });
  it("el resumen no cambia con la entrada", () => {
    expect(construir({ detalle: { ruta: "/a", limite: 1 } })?.resumen)
      .toBe(construir({ detalle: { ruta: "/b/larguisima", limite: 999 } })?.resumen);
  });
});
describe("salida sin datos personales y propuestas", () => {
  it("ninguna cadena del evento ni de la propuesta lleva clave, correo o IP", () => {
    const CLAVE = "sk-" + "d".repeat(32), CORREO = "agente-1025@example.com", IP = "192.168.4.20";
    const e = construirEventoSeguridad({ tipo: "acceso-inusual", severidad: "alta", elemento: "cuenta", detalle: { patron: CLAVE, ventanaMs: CORREO, otraIp: IP } }, AHORA)!;
    for (const t of [...cadenas(e), ...cadenas(proponerRespuesta(e))]) {
      expect(t).not.toContain(CLAVE); expect(t).not.toContain(CORREO); expect(t).not.toContain(IP);
    }
  });
  it("cuenta, grupo y página remiten a un Círculo de Paz con personas decidiendo", () => {
    const p = proponerRespuesta(construir({ elemento: "grupo" })!);
    expect(p.requiereHumano).toBe(true); expect(p.motivo).toContain("Círculo de Paz");
  });
  it("nunca propone bloquear ni suspender a una persona", () => {
    for (const tipo of TIPOS_EVENTO)
      for (const elemento of ["cuenta", "api"] as const) {
        const texto = JSON.stringify(proponerRespuesta(construirEventoSeguridad({ tipo, severidad: "media", elemento }, AHORA)!)) ?? "";
        expect(texto).not.toContain("bloquear"); expect(texto).not.toContain("suspender");
      }
  });
});
describe("política de severidad y mapeo del escáner", () => {
  it("ORDEN_SEVERIDAD va de crítica a baja; la política respeta mínima y tipos", () => {
    expect(ORDEN_SEVERIDAD).toEqual(["critica", "alta", "media", "baja"]);
    const e = construir()!;
    expect(politicaPermite(e, { severidadMinima: "media" })).toBe(true);
    expect(politicaPermite(e, { severidadMinima: "alta" })).toBe(false);
    expect(politicaPermite(e, { severidadMinima: "media", tipos: ["limite-peticiones"] })).toBe(true);
    expect(politicaPermite(e, { severidadMinima: "media", tipos: ["hallazgo-strix"] })).toBe(false);
  });
  it("desdeSeveridadScanner mapea el escáner y da null ante lo desconocido", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica"); expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media"); expect(desdeSeveridadScanner("low")).toBe("baja");
    expect(desdeSeveridadScanner("otra")).toBeNull();
  });
});
describe("pareceDatoPersonal", () => {
  it("reconoce correo, IP, JWT, cadenas largas y prefijos de clave; descarta texto normal", () => {
    expect(pareceDatoPersonal("alguien@sistemas.org")).toBe(true); expect(pareceDatoPersonal("10.0.34.7")).toBe(true);
    expect(pareceDatoPersonal("fe80::1a2b:3c4d")).toBe(true);
    expect(pareceDatoPersonal("eyJhbGciOiJIUzI1NiJ9.eyJwIjoxfQ.gXfirma")).toBe(true);
    expect(pareceDatoPersonal("a1b2c3d4e5f6a1b2c3d4e5f6")).toBe(true);
    expect(pareceDatoPersonal("ghp_abc123")).toBe(true); expect(pareceDatoPersonal("AKIAABCDEF123456")).toBe(true);
    expect(pareceDatoPersonal("/api/genesis")).toBe(false);
    expect(pareceDatoPersonal("revisar el ritmo de peticiones")).toBe(false);
  });
});
