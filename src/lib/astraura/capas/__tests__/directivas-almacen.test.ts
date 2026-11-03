import { beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTIVAS_EVENT,
  DIRECTIVAS_KEY,
  directivaActiva,
  guardarDirectivas,
  leerDirectivas,
} from "../directivas-almacen";
import type { ArchivoDirectivas, DirectivaCapa } from "../directivas";

class AlmacenMemoria {
  private readonly datos = new Map<string, string>();
  getItem(clave: string): string | null {
    return this.datos.get(clave) ?? null;
  }
  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }
}

const directiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio", version: 2, sha256: "a".repeat(64),
  acierto: 0.6, base: 0.5, n: 80, fecha: "2026-10-27",
  origen: "meta-n", estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.",
  ...extra,
});

const archivo = (historial: DirectivaCapa[], activa: number | null): ArchivoDirectivas =>
  ({ v: 1, capa: "juicio", activa, historial });

describe("directivas-almacen", () => {
  let disco: AlmacenMemoria;
  let eventos: string[];

  beforeEach(() => {
    disco = new AlmacenMemoria();
    eventos = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: disco,
        dispatchEvent: (evento: Event) => {
          eventos.push(evento.type);
          return true;
        },
      },
    });
  });

  it("declara la clave y el evento de sincronía", () => {
    expect(DIRECTIVAS_KEY).toBe("starseed.capas.directivas.v1");
    expect(DIRECTIVAS_EVENT).toBe("starseed:capas-directivas");
  });

  it("lee solo la capa pedida y tolera valores rotos", () => {
    const guardado = archivo([directiva()], 2);
    disco.setItem(DIRECTIVAS_KEY, JSON.stringify({ juicio: guardado }));

    expect(leerDirectivas("juicio")).toEqual(guardado);
    expect(leerDirectivas("palabra")).toBeNull();

    for (const roto of ["{no soy json", JSON.stringify(["juicio"]), JSON.stringify({ juicio: "texto" })]) {
      disco.setItem(DIRECTIVAS_KEY, roto);
      expect(leerDirectivas("juicio")).toBeNull();
    }
  });

  it("devuelve null sin window (SSR)", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    expect(leerDirectivas("juicio")).toBeNull();
  });

  it("guarda una capa nueva y avisa por el evento", () => {
    const guardado = archivo([directiva()], 2);

    expect(guardarDirectivas("juicio", guardado)).toBe(true);
    expect(leerDirectivas("juicio")).toEqual(guardado);
    expect(eventos).toEqual([DIRECTIVAS_EVENT]);
  });

  it("no reescribe si no cambió nada", () => {
    const guardado = archivo([directiva()], 2);
    guardarDirectivas("juicio", guardado);
    eventos.length = 0;

    expect(guardarDirectivas("juicio", guardado)).toBe(false);
    expect(eventos).toEqual([]);
  });

  it("escribe si la versión activa sube y no si baja", () => {
    guardarDirectivas("juicio", archivo([directiva()], 3));

    expect(guardarDirectivas("juicio", archivo([directiva()], 2))).toBe(false);
    expect(leerDirectivas("juicio")?.activa).toBe(3);

    expect(guardarDirectivas("juicio", archivo([directiva({ version: 4 })], 4))).toBe(true);
    expect(leerDirectivas("juicio")?.activa).toBe(4);
  });

  it("escribe si cambió el historial (una vuelta atrás)", () => {
    const activa = directiva({ version: 2 });
    guardarDirectivas("juicio", archivo([activa], 2));

    const vuelta = archivo([{ ...activa, estado: "retirada" }], null);
    expect(guardarDirectivas("juicio", vuelta)).toBe(true);
    expect(leerDirectivas("juicio")?.activa).toBeNull();
  });

  it("devuelve false sin window o si el almacenamiento falla", () => {
    const guardado = archivo([directiva()], 2);
    disco.setItem = () => {
      throw new Error("cuota llena");
    };
    expect(guardarDirectivas("juicio", guardado)).toBe(false);

    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    expect(guardarDirectivas("juicio", guardado)).toBe(false);
  });

  it("devuelve la directiva activa solo si versión y estado cuadran", () => {
    const activa = directiva({ version: 2 });
    disco.setItem(DIRECTIVAS_KEY, JSON.stringify({ juicio: archivo([activa], 2) }));
    expect(directivaActiva("juicio")).toEqual(activa);

    disco.setItem(DIRECTIVAS_KEY, JSON.stringify({ juicio: archivo([directiva()], null) }));
    expect(directivaActiva("juicio")).toBeUndefined();

    disco.setItem(DIRECTIVAS_KEY, JSON.stringify({ juicio: archivo([directiva()], 99) }));
    expect(directivaActiva("juicio")).toBeUndefined();

    disco.setItem(
      DIRECTIVAS_KEY,
      JSON.stringify({ juicio: archivo([directiva({ estado: "retirada" })], 2) }),
    );
    expect(directivaActiva("juicio")).toBeUndefined();
  });
});
