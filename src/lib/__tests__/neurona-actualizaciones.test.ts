import { describe, it, expect, beforeEach } from "vitest";
import {
  MODO_POR_DEFECTO,
  CLAVE_PREFERENCIAS,
  leerPreferencia,
  guardarPreferencia,
  hayVersionNueva,
  decidirAccion,
  type ModoActualizacion,
  type PreferenciaNeurona,
} from "../neurons/actualizaciones";

// Mock mínimo de localStorage (vitest corre en entorno node).
class LocalStorageFalso {
  private datos = new Map<string, string>();
  getItem(k: string): string | null { return this.datos.get(k) ?? null; }
  setItem(k: string, v: string): void { this.datos.set(k, v); }
  removeItem(k: string): void { this.datos.delete(k); }
  clear(): void { this.datos.clear(); }
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = new LocalStorageFalso();
});

function preferencia(modo: ModoActualizacion, versionVista: string | null): PreferenciaNeurona {
  return {
    neuronaId: "n-1",
    modo,
    ultimaComprobacion: null,
    versionVista,
  };
}

describe("instalaciones de la neurona", () => {
  it("leer sin nada guardado devuelve el modo por defecto (manual)", () => {
    const pref = leerPreferencia("n-1");
    expect(pref.modo).toBe(MODO_POR_DEFECTO);
    expect(pref.modo).toBe("manual");
    expect(pref.versionVista).toBeNull();
    expect(pref.ultimaComprobacion).toBeNull();
  });

  it("guardar y volver a leer conserva la preferencia por neurona", () => {
    guardarPreferencia(preferencia("automatica", "2026.07.01"));
    const pref = leerPreferencia("n-1");
    expect(pref.modo).toBe("automatica");
    expect(pref.versionVista).toBe("2026.07.01");
  });

  it("lectura con la clave sin inicializar no lanza en modo privado", () => {
    expect(() => leerPreferencia("n-2")).not.toThrow();
    expect(leerPreferencia("n-2").modo).toBe("manual");
  });
});

describe("hayVersionNueva", () => {
  it("detecta una fecha posterior por calendario, no alfabéticamente", () => {
    expect(hayVersionNueva("2026.07.01", "2026.09.09")).toBe(true);
    expect(hayVersionNueva("2026.09.09", "2026.09.09")).toBe(false);
    expect(hayVersionNueva("2026.09.09", "2026.07.01")).toBe(false);
  });

  it("devuelve false ante cualquier cadena que no parsee", () => {
    expect(hayVersionNueva("basura", "2026.09.09")).toBe(false);
    expect(hayVersionNueva("2026.07.01", "basura")).toBe(false);
    expect(hayVersionNueva("", "2026.09.09")).toBe(false);
    expect(hayVersionNueva("13.99.99", "2026.09.09")).toBe(false);
  });
});

describe("decidirAccion", () => {
  it("modo automático con versión nueva → aplicar", () => {
    const pref = preferencia("automatica", "2026.07.01");
    expect(decidirAccion(pref, "2026.09.09")).toBe("aplicar");
  });

  it("modo manual con versión nueva → avisar", () => {
    const pref = preferencia("manual", "2026.07.01");
    expect(decidirAccion(pref, "2026.09.09")).toBe("avisar");
  });

  it("misma versión o ya vista → nada", () => {
    const pref = preferencia("manual", "2026.09.09");
    expect(decidirAccion(pref, "2026.09.09")).toBe("nada");
    expect(decidirAccion(pref, "2026.07.01")).toBe("nada");
  });

  it("sin versión vista no hay base de comparación → nada", () => {
    expect(decidirAccion(preferencia("automatica", null), "2026.09.09")).toBe("nada");
  });

  it("versión del servidor inválida nunca produce una acción", () => {
    const pref = preferencia("automatica", "2026.07.01");
    expect(decidirAccion(pref, "basura")).toBe("nada");
  });
});