import { describe, it, expect } from "vitest";
import {
  leerConexion,
  suscribirConexion,
  type ConexionNavegador,
} from "../lector-conexion";

/** `navigator.connection` de prueba con oyentes registrables (puro, sin DOM). */
function conexionFalsa(
  datos: Partial<ConexionNavegador>,
  oyentes?: Map<string, () => void>,
): ConexionNavegador {
  const mapa = oyentes ?? new Map<string, () => void>();
  return {
    ...datos,
    addEventListener: (t: string, cb: () => void) => {
      mapa.set(t, cb);
    },
    removeEventListener: (t: string, cb: () => void) => {
      if (mapa.get(t) === cb) mapa.delete(t);
    },
  };
}

describe("leerConexion", () => {
  it("sin connection devuelve solo nativaMedida null (Safari, Firefox)", () => {
    expect(leerConexion({})).toEqual({ nativaMedida: null });
    expect(leerConexion({ navigator: null })).toEqual({ nativaMedida: null });
    expect(leerConexion({ navigator: { connection: null } })).toEqual({
      nativaMedida: null,
    });
  });

  it("con connection lee tipo, saveData y effectiveType", () => {
    const lectura = leerConexion({
      navigator: {
        connection: { type: "cellular", saveData: true, effectiveType: "2g" },
      },
    });
    expect(lectura).toEqual({
      tipo: "cellular",
      saveData: true,
      effectiveType: "2g",
      nativaMedida: null,
    });
  });

  it("connection sin campos conocidos no inventa datos", () => {
    expect(leerConexion({ navigator: { connection: {} } })).toEqual({
      nativaMedida: null,
    });
  });

  it("marca nativa true y false", () => {
    expect(leerConexion({ nativa: { medida: () => true } })).toEqual({
      nativaMedida: true,
    });
    expect(leerConexion({ nativa: { medida: () => false } })).toEqual({
      nativaMedida: false,
    });
  });

  it("marca nativa ausente, vacía o null da nativaMedida null", () => {
    expect(leerConexion({ nativa: null }).nativaMedida).toBe(null);
    expect(leerConexion({ nativa: {} }).nativaMedida).toBe(null);
    expect(leerConexion({ nativa: { medida: () => null } }).nativaMedida).toBe(null);
  });

  it("una medida nativa que lanza nunca tumba la lectura", () => {
    const lectura = leerConexion({
      nativa: {
        medida: () => {
          throw new Error("puente roto");
        },
      },
    });
    expect(lectura).toEqual({ nativaMedida: null });
  });

  it("combina navegador y marca nativa", () => {
    const lectura = leerConexion({
      navigator: { connection: { type: "wifi" } },
      nativa: { medida: () => true },
    });
    expect(lectura).toEqual({ tipo: "wifi", nativaMedida: true });
  });
});

describe("suscribirConexion", () => {
  it("escucha change y la baja quita el oyente", () => {
    const oyentes = new Map<string, () => void>();
    const conexion = conexionFalsa({}, oyentes);
    let avisos = 0;
    const baja = suscribirConexion({ navigator: { connection: conexion } }, () => {
      avisos += 1;
    });
    oyentes.get("change")?.();
    expect(avisos).toBe(1);
    baja();
    expect(oyentes.has("change")).toBe(false);
  });

  it("sin connection la suscripción no hace nada y la baja es segura", () => {
    const baja = suscribirConexion({}, () => {});
    expect(() => baja()).not.toThrow();
    const bajaNula = suscribirConexion({ navigator: null }, () => {});
    expect(() => bajaNula()).not.toThrow();
  });

  it("un connection sin addEventListener también da una baja segura", () => {
    const baja = suscribirConexion(
      { navigator: { connection: { type: "wifi" } } },
      () => {},
    );
    expect(() => baja()).not.toThrow();
  });
});
