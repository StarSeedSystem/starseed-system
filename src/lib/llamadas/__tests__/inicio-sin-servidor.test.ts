/**
 * LLA1110D — empezar una llamada desde una neurona sin internet.
 */
import { describe, expect, it } from "vitest";
import { anadirPendiente, decidirInicio, guardarIdentidadLocal, idSesionLocal, intentarServidor, leerIdentidadLocal, leerPendientes, quitarPendiente } from "@/lib/llamadas/inicio-sin-servidor";

function memoria(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe("inicio sin servidor (LLA1110D)", () => {
  it("sin internet y con enlace directo con la neurona: va por el enlace, sin servidor", () => {
    expect(intentarServidor({ internet: false })).toBe(false);
    expect(decidirInicio({ internet: false, sesionServidor: "no-intentado", enlaceDirecto: true, neurona: true }).via).toBe("local");
  });
  it("con internet pero el servidor no responde: también por el enlace directo", () => {
    const d = decidirInicio({ internet: true, sesionServidor: "fallo", enlaceDirecto: true, neurona: true });
    expect(d).toEqual({ via: "local", motivo: "el servidor no responde: va por el enlace directo" });
  });
  it("con servidor: como siempre; sin servidor ni enlace: imposible, con motivo", () => {
    expect(decidirInicio({ internet: true, sesionServidor: "ok", enlaceDirecto: false, neurona: true }).via).toBe("servidor");
    expect(decidirInicio({ internet: false, sesionServidor: "no-intentado", enlaceDirecto: false, neurona: true }).via).toBe("imposible");
    expect(decidirInicio({ internet: false, sesionServidor: "no-intentado", enlaceDirecto: true, neurona: false }).via).toBe("imposible");
    expect(intentarServidor({ internet: true, sinServidor: true })).toBe(false);
  });
  it("el id local tiene forma de uuid (los temas y canales lo aceptan)", () => {
    expect(idSesionLocal()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(
      idSesionLocal(() => {
        throw new Error("sin crypto");
      }),
    ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("la identidad conocida se guarda y se recupera sin red; los invitados no", () => {
    const s = memoria();
    expect(leerIdentidadLocal(s)).toBeNull();
    guardarIdentidadLocal({ base: "u1", uid: "u1", nombre: "Alex", avatar: null, invitado: false }, s);
    expect(leerIdentidadLocal(s)).toEqual({ base: "u1", uid: "u1", nombre: "Alex", avatar: null, invitado: false });
    const t = memoria();
    guardarIdentidadLocal({ base: "inv-1", uid: null, nombre: "X", avatar: null, invitado: true }, t);
    expect(leerIdentidadLocal(t)).toBeNull();
  });
  it("lo del servidor queda en cola (sin repetir) y se quita al escribirlo", () => {
    const s = memoria();
    const p = { sesionId: "a", tipo: "llamada:audio", titulo: "Mac", neurona: "n1", invitados: [], en: 1 };
    anadirPendiente(p, s);
    anadirPendiente(p, s);
    expect(leerPendientes(s)).toHaveLength(1);
    quitarPendiente("a", s);
    expect(leerPendientes(s)).toEqual([]);
  });
});
