import { describe, it, expect } from "vitest";
import { SYNCED_KEYS, NEVER_SYNCED_KEYS } from "@/lib/settings-sync";
import {
  aplicar,
  capturarEntorno,
  diferencia,
  duplicarEntorno,
  revisarEntorno,
  type EntornoCompleto,
} from "../entorno-completo";
import type { PaqueteSistema } from "../paquete-sistema";

const paquete = (): PaqueteSistema => ({
  id: "p1",
  nombre: "Mi entorno",
  autor: { perfil: "yo", nombre: "Yo" },
  creadoEn: 0,
  uiSpec: { version: 1, superficie: "os:test", bloques: [] } as unknown as PaqueteSistema["uiSpec"],
  permisosPedidos: [],
  requiere: [],
  version: 1,
});

const nada = { validarUiSpec: (b: unknown) => ({ spec: b as PaqueteSistema["uiSpec"], problemas: [] }), validarContraInvariantes: () => [] };

function almacen(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    m,
    leer: (k: string) => m.get(k) ?? null,
    escribir: (k: string, v: string | null) => void (v === null ? m.delete(k) : m.set(k, v)),
  };
}

describe("entorno completo", () => {
  const sincronizada = SYNCED_KEYS.find((k) => !(NEVER_SYNCED_KEYS as readonly string[]).includes(k))!;
  const prohibida = NEVER_SYNCED_KEYS[0];

  it("ninguna clave prohibida viaja, ni siquiera si está guardada", () => {
    const a = almacen({ [sincronizada]: '{"a":1}', [prohibida]: "x" });
    const e = capturarEntorno(a, paquete(), []);
    expect(e.ajustes[sincronizada]).toBe('{"a":1}');
    expect(Object.keys(e.ajustes)).not.toContain(prohibida);
  });

  it("los volúmenes van por referencia, sin contenido", () => {
    const e = capturarEntorno(almacen(), paquete(), [{ id: "v", raiz: "banda-1", contenido: "ENORME" } as never]);
    expect(e.volumenes).toEqual([{ id: "v", raiz: "banda-1" }]);
  });

  it("un secreto o una clave prohibida bloquean con su motivo", () => {
    const e = capturarEntorno(almacen({ [sincronizada]: "sk-abcdef123456" }), paquete(), []);
    const r = revisarEntorno(e, nada);
    expect(r.instalable).toBe(false);
    expect(r.motivos.join(" ")).toMatch(/secreto/);
    const p: EntornoCompleto = { ...e, ajustes: { [prohibida]: "1" } };
    expect(revisarEntorno(p, nada).motivos.join(" ")).toMatch(/clave prohibida/);
  });

  it("un entorno limpio es instalable", () => {
    const e = capturarEntorno(almacen({ [sincronizada]: '{"a":1}' }), paquete(), []);
    expect(revisarEntorno(e, nada).instalable).toBe(true);
  });

  it("sin guardianes del núcleo falla cerrado", () => {
    const e = capturarEntorno(almacen(), paquete(), []);
    expect(revisarEntorno(e, null).instalable).toBe(false);
  });

  it("duplicar no comparte referencias", () => {
    const e = capturarEntorno(almacen({ [sincronizada]: "1" }), paquete(), [{ id: "v", raiz: "r" }]);
    const d = duplicarEntorno(e, "Copia");
    d.ajustes[sincronizada] = "2";
    d.volumenes[0].raiz = "otra";
    d.paquete.permisosPedidos.push("x");
    expect(d.nombre).toBe("Copia");
    expect(d.paquete.nombre).toBe("Copia");
    expect(e.ajustes[sincronizada]).toBe("1");
    expect(e.volumenes[0].raiz).toBe("r");
    expect(e.paquete.permisosPedidos).toEqual([]);
  });

  it("diferencia dice qué claves cambian", () => {
    const [k1, k2, k3] = SYNCED_KEYS;
    const a = { ajustes: { [k1]: "1", [k2]: "1" } } as unknown as EntornoCompleto;
    const b = { ajustes: { [k2]: "2", [k3]: "3" } } as unknown as EntornoCompleto;
    expect(diferencia(a, b)).toEqual({ anadidas: [k3], quitadas: [k1], cambiadas: [k2], iguales: [] });
  });

  it("aplicar y deshacer dejan todo igual", () => {
    const [k1, k2] = SYNCED_KEYS;
    const e = { ...capturarEntorno(almacen(), paquete(), []), ajustes: { [k1]: "nuevo", [k2]: "otro", [prohibida]: "no" } };
    const a = almacen({ [k1]: "viejo" });
    const antes = new Map(a.m);
    const { cambios, deshacer } = aplicar(e, a);
    expect(cambios).toEqual([k1, k2]);
    expect(a.m.get(k1)).toBe("nuevo");
    expect(a.m.has(prohibida)).toBe(false);
    deshacer();
    expect(a.m).toEqual(antes);
  });
});
