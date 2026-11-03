import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTIVAS_EVENT, DIRECTIVAS_KEY, directivaActiva, guardarDirectivas, leerDirectivas,
  type ArchivoDirectivas, type DirectivaCapa,
} from "../directivas-almacen";
import { SYNCED_KEYS } from "@/lib/settings-sync";

const dir = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio", version: 2, sha256: "a".repeat(64), acierto: 0.6, base: 0.5, n: 80,
  fecha: "2026-10-27", origen: "meta-n", estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.", ...extra,
});
const archivo = (historial: DirectivaCapa[], activa: number | null): ArchivoDirectivas => ({
  v: 1, capa: "juicio", activa, historial,
});

class AlmacenMemoria {
  readonly datos = new Map<string, string>();
  fallar = false;
  getItem(k: string): string | null { return this.datos.get(k) ?? null; }
  setItem(k: string, v: string): void {
    if (this.fallar) throw new Error("QuotaExceededError");
    this.datos.set(k, v);
  }
}

let almacen: AlmacenMemoria;
let eventos: string[];
const ponerCrudo = (v: unknown) => almacen.datos.set(DIRECTIVAS_KEY, typeof v === "string" ? v : JSON.stringify(v));

beforeEach(() => {
  almacen = new AlmacenMemoria();
  eventos = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: almacen, dispatchEvent: (e: Event) => { eventos.push(e.type); return true; } },
  });
});
afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
});

describe("directivas-almacen", () => {
  it("declara la clave y el evento del contrato, y la clave viaja con la cuenta", () => {
    expect(DIRECTIVAS_KEY).toBe("starseed.capas.directivas.v1");
    expect(DIRECTIVAS_EVENT).toBe("starseed:capas-directivas");
    expect(SYNCED_KEYS).toContain(DIRECTIVAS_KEY);
  });

  it("lee la capa pedida y null si no está", () => {
    const a = archivo([dir()], 2);
    ponerCrudo({ juicio: a });
    expect(leerDirectivas("juicio")).toEqual(a);
    expect(leerDirectivas("reflejo")).toBeNull();
  });

  it("lectura defensiva: JSON roto, array, archivo sin forma o directivas rotas", () => {
    ponerCrudo("{no soy json");
    expect(leerDirectivas("juicio")).toBeNull();
    ponerCrudo([1, 2]);
    expect(leerDirectivas("juicio")).toBeNull();
    ponerCrudo({ juicio: { v: 2, activa: 1, historial: [] }, razon: "x" });
    expect(leerDirectivas("juicio")).toBeNull();
    expect(leerDirectivas("razon")).toBeNull();
    ponerCrudo({ juicio: { v: 1, activa: 2, historial: [dir(), { version: "3" }, null] } });
    expect(leerDirectivas("juicio")?.historial).toEqual([dir()]);
  });

  it("sin window (SSR) no lee ni escribe", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    expect(leerDirectivas("juicio")).toBeNull();
    expect(guardarDirectivas("juicio", archivo([dir()], 2))).toBe(false);
    expect(directivaActiva("juicio")).toBeUndefined();
  });

  it("guarda lo nuevo y emite el evento; varias capas conviven", () => {
    expect(guardarDirectivas("juicio", archivo([dir()], 2))).toBe(true);
    expect(guardarDirectivas("reflejo", { ...archivo([dir({ capa: "reflejo", version: 1 })], 1), capa: "reflejo" })).toBe(true);
    expect(eventos).toEqual([DIRECTIVAS_EVENT, DIRECTIVAS_EVENT]);
    expect(leerDirectivas("juicio")?.activa).toBe(2);
    expect(leerDirectivas("reflejo")?.activa).toBe(1);
  });

  it("no reescribe lo mismo ni una activa más vieja con el mismo historial", () => {
    const h = [dir({ version: 1, estado: "anterior" }), dir({ version: 2 })];
    guardarDirectivas("juicio", archivo(h, 2));
    eventos = [];
    expect(guardarDirectivas("juicio", archivo(h, 2))).toBe(false);
    expect(guardarDirectivas("juicio", archivo(h, 1))).toBe(false);
    expect(eventos).toEqual([]);
    expect(leerDirectivas("juicio")?.activa).toBe(2);
  });

  it("acepta una activa más nueva y una vuelta atrás (cambia el historial)", () => {
    const h = [dir({ version: 1, estado: "anterior" }), dir({ version: 2 })];
    guardarDirectivas("juicio", archivo([dir({ version: 1 })], 1));
    expect(guardarDirectivas("juicio", archivo(h, 2))).toBe(true);
    const atras = [dir({ version: 1 }), dir({ version: 2, estado: "retirada", motivo: "vuelta a la anterior" })];
    expect(guardarDirectivas("juicio", archivo(atras, 1))).toBe(true);
    expect(directivaActiva("juicio")?.version).toBe(1);
  });

  it("rechaza un archivo sin forma y no rompe si el almacenamiento falla", () => {
    expect(guardarDirectivas("juicio", { v: 2 } as unknown as ArchivoDirectivas)).toBe(false);
    almacen.fallar = true;
    expect(guardarDirectivas("juicio", archivo([dir()], 2))).toBe(false);
    expect(eventos).toEqual([]);
  });

  it("directivaActiva exige versión y estado coherentes", () => {
    ponerCrudo({ juicio: archivo([dir()], 2) });
    expect(directivaActiva("juicio")).toEqual(dir());
    ponerCrudo({ juicio: archivo([dir()], null) });
    expect(directivaActiva("juicio")).toBeUndefined();
    ponerCrudo({ juicio: archivo([dir()], 99) });
    expect(directivaActiva("juicio")).toBeUndefined();
    ponerCrudo({ juicio: archivo([dir({ estado: "propuesta" })], 2) });
    expect(directivaActiva("juicio")).toBeUndefined();
  });
});
