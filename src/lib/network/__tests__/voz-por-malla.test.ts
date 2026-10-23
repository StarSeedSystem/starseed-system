/**
 * voz-por-malla (Ola 1018V · VST1018K) — manejadores puros de `voz.hablar` y
 * `oido.transcribir`: acceso por cuenta/grupo, permiso de voz ajena, licencia
 * por contexto y elección de motor. Sin red, micrófono ni reloj real.
 */
import { describe, it, expect } from "vitest";
import {
  manejarVozHablar, manejarOidoTranscribir, elegirMotorVoz, licenciaAdmitida,
  esContextoVozMalla, type PeticionVozMalla, type PermisoVoz, type MotorVozMalla,
} from "@/lib/network/voz-por-malla";

const libre: MotorVozMalla = { id: "kokoro", claseLicencia: "libre" };
const personal: MotorVozMalla = { id: "voicemorphic", claseLicencia: "personal" };
const condicionada: MotorVozMalla = { id: "sensevoice", claseLicencia: "condicionada" };
const desconocida: MotorVozMalla = { id: "raro", claseLicencia: "desconocida" };
const grupo = { id: "g1", miembros: ["ana", "beto"], permiteVoz: true };

function p(extra: Partial<PeticionVozMalla> = {}): PeticionVozMalla {
  return { solicitante: "ana", anfitrion: "ana", contexto: "personal", motores: [libre], ahora: 1000, ...extra };
}

const permiso: PermisoVoz = {
  id: "p1", titular: "beto", concedidoA: "ana", para: ["grupo"], desde: 0, hasta: 5000,
};

describe("acceso: misma cuenta o grupo con permiso", () => {
  it("acepta la misma cuenta y devuelve { motor, motivo }", () => {
    const r = manejarVozHablar(p());
    expect(r).toMatchObject({ ok: true, motor: "kokoro" });
    expect(r.motivo).toContain("kokoro");
  });

  it("rechaza otra cuenta sin grupo", () => {
    const r = manejarVozHablar(p({ anfitrion: "beto", contexto: "grupo" }));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("misma cuenta");
  });

  it("acepta un grupo autorizado con las dos cuentas dentro", () => {
    const r = manejarVozHablar(p({ anfitrion: "beto", contexto: "grupo", grupo }));
    expect(r.ok).toBe(true);
  });

  it("no deja colar «personal» en un préstamo entre cuentas", () => {
    const r = manejarVozHablar(p({ anfitrion: "beto", contexto: "personal", motores: [personal] }));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("personal");
  });

  it("rechaza grupo sin permiso, o con alguien fuera", () => {
    expect(manejarVozHablar(p({ anfitrion: "beto", contexto: "grupo", grupo: { ...grupo, permiteVoz: false } })).ok).toBe(false);
    expect(manejarVozHablar(p({ anfitrion: "beto", contexto: "grupo", grupo: { ...grupo, miembros: ["beto"] } })).motivo).toContain("solicitante");
    expect(manejarVozHablar(p({ anfitrion: "beto", contexto: "grupo", grupo: { ...grupo, miembros: ["ana"] } })).motivo).toContain("neurona");
  });
});

describe("voz y audio de terceros: permiso de clonación", () => {
  it("rechaza la voz de otra persona sin permiso", () => {
    const r = manejarVozHablar(p({ anfitrion: "beto", grupo, contexto: "grupo", titularVoz: "beto" }));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("permiso");
  });

  it("acepta la voz ajena con permiso vigente y la rechaza caducado", () => {
    const base: Partial<PeticionVozMalla> = {
      anfitrion: "beto", grupo, contexto: "grupo", titularVoz: "beto", permisos: [permiso],
    };
    expect(manejarVozHablar(p(base)).ok).toBe(true);
    expect(manejarOidoTranscribir(p({ ...base, ahora: 9999, audioDe: "beto" })).ok).toBe(false);
  });

  it("el audio propio no necesita permiso y el ajeno sí", () => {
    expect(manejarOidoTranscribir(p({ contexto: "grupo" })).ok).toBe(true);
    const ajeno = manejarOidoTranscribir(p({ anfitrion: "beto", grupo, contexto: "grupo", audioDe: "beto" }));
    expect(ajeno.ok).toBe(false);
    expect(ajeno.motivo).toContain("permiso");
  });
});

describe("licencia por contexto", () => {
  it("nunca elige clase personal fuera de lo personal", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      const m = elegirMotorVoz([personal, libre], contexto);
      expect(m?.id).toBe("kokoro");
      expect(elegirMotorVoz([personal], contexto)).toBeNull();
    }
  });

  it("en personal sí admite la clase personal", () => {
    expect(elegirMotorVoz([personal], "personal")?.id).toBe("voicemorphic");
  });

  it("condicionada solo con su condición cumplida; desconocida nunca", () => {
    expect(licenciaAdmitida("condicionada", "comercial", false)).toBe(false);
    expect(licenciaAdmitida("condicionada", "comercial", true)).toBe(true);
    expect(elegirMotorVoz([condicionada, libre], "comercial")?.id).toBe("kokoro");
    expect(licenciaAdmitida("desconocida", "personal", true)).toBe(false);
    expect(elegirMotorVoz([desconocida], "personal")).toBeNull();
  });

  it("elige el motor de menor prioridad y rechaza si no hay ninguno válido", () => {
    const lento: MotorVozMalla = { id: "lento", claseLicencia: "libre", prioridad: 50 };
    expect(elegirMotorVoz([libre, lento], "grupo")?.id).toBe("lento");
    const r = manejarVozHablar(p({ contexto: "grupo", motores: [personal] }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("licencia");
  });
});

describe("validación del contexto y utilidades", () => {
  it("rechaza contextos no válidos sin asumir «personal»", () => {
    const r = manejarVozHablar(p({ contexto: "otro" as PeticionVozMalla["contexto"] }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("Contexto");
  });

  it("esContextoVozMalla conoce los cinco contextos", () => {
    expect(esContextoVozMalla("personal")).toBe(true);
    expect(esContextoVozMalla("comercial")).toBe(true);
    expect(esContextoVozMalla("otro")).toBe(false);
    expect(esContextoVozMalla(null)).toBe(false);
  });
});
