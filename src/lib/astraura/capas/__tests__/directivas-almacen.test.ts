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
  removeItem(clave: string): void {
    this.datos.delete(clave);
  }
}

const directiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio",
  version: 2,
  sha256: "a".repeat(64),
  acierto: 0.6,
  base: 0.5,
  n: 80,
  fecha: "2026-10-27",
  origen: "meta-n",
  estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.",
  ...extra,
});

const archivo = (
  historial: DirectivaCapa[],
  activa: number | null,
): ArchivoDirectivas => ({ v: 1, capa: "juicio", activa, historial });

describe("directivas-almacen", () => {
  let discos: AlmacenMemoria;
  let eventos: string[];

  beforeEach(() => {
    discos = new AlmacenMemoria();
    eventos = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: discos,
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

  describe("leerDirectivas", () => {
    it("devuelve null si la capa no tiene datos", () => {
      expect(leerDirectivas("juicio")).toBeNull();
    });

    it("devuelve el archivo de la capa pedida y null para las demás", () => {
      const guardado = archivo([directiva()], 2);
      discos.setItem(DIRECTIVAS_KEY, JSON.stringify({ juicio: guardado }));

      expect(leerDirectivas("juicio")).toEqual(guardado);
      expect(leerDirectivas("palabra")).toBeNull();
    });

    it("tolera JSON roto y valores que no son un mapa de capas", () => {
      discos.setItem(DIRECTIVAS_KEY, "{no soy json");
      expect(leerDirectivas("juicio")).toBeNull();

      discos.setItem(DIRECTIVAS_KEY, JSON.stringify(["juicio"]));
      expect(leerDirectivas("juicio")).toBeNull();

      discos.setItem(DIRECTIVAS_KEY, JSON.stringify({ juicio: "texto" }));
      expect(leerDirectivas("juicio")).toBeNull();
    });

    it("devuelve null sin window (SSR)", () => {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: undefined,
      });
      expect(leerDirectivas("juicio")).toBeNull();
    });
  });

  describe("guardarDirectivas", () => {
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

    it("escribe cuando la versión activa sube", () => {
      guardarDirectivas("juicio", archivo([directiva()], 2));

      const nuevo = archivo([directiva({ version: 3 })], 3);
      expect(guardarDirectivas("juicio", nuevo)).toBe(true);
      expect(leerDirectivas("juicio")?.activa).toBe(3);
    });

    it("no deja que una versión activa más vieja pise la actual", () => {
      guardarDirectivas("juicio", archivo([directiva()], 3));

      const viejo = archivo([directiva()], 2);
      expect(guardarDirectivas("juicio", viejo)).toBe(false);
      expect(leerDirectivas("juicio")?.activa).toBe(3);
    });

    it("escribe si cambió el historial (retirada o vuelta atrás)", () => {
      const activa = directiva({ version: 2 });
      guardarDirectivas("juicio", archivo([activa], 2));

      const vuelta = archivo(
        [{ ...activa, estado: "retirada" }],
        null,
      );
      expect(guardarDirectivas("juicio", vuelta)).toBe(true);
      expect(leerDirectivas("juicio")?.activa).toBeNull();
    });

    it("guarda capas distintas sin pisarse", () => {
      guardarDirectivas("juicio", archivo([directiva()], 2));
      guardarDirectivas(
        "palabra",
        archivo([directiva({ capa: "palabra", version: 1 })], 1),
      );

      expect(leerDirectivas("juicio")?.activa).toBe(2);
      expect(leerDirectivas("palabra")?.activa).toBe(1);
    });

    it("devuelve false sin window o si el almacenamiento falla", () => {
      const guardado = archivo([directiva()], 2);
      discos.setItem = () => {
        throw new Error("cuota llena");
      };
      expect(guardarDirectivas("juicio", guardado)).toBe(false);

      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: undefined,
      });
      expect(guardarDirectivas("juicio", guardado)).toBe(false);
    });
  });

  describe("directivaActiva", () => {
    it("devuelve la directiva activa de la capa", () => {
      const activa = directiva({ version: 2 });
      discos.setItem(
        DIRECTIVAS_KEY,
        JSON.stringify({ juicio: archivo([activa], 2) }),
      );

      expect(directivaActiva("juicio")).toEqual(activa);
    });

    it("devuelve undefined sin activa, con versión ausente o sin datos", () => {
      discos.setItem(
        DIRECTIVAS_KEY,
        JSON.stringify({ juicio: archivo([directiva()], null) }),
      );
      expect(directivaActiva("juicio")).toBeUndefined();

      discos.setItem(
        DIRECTIVAS_KEY,
        JSON.stringify({ juicio: archivo([directiva()], 99) }),
      );
      expect(directivaActiva("juicio")).toBeUndefined();

      expect(directivaActiva("juicio")).toBeUndefined();
    });

    it("exige que el estado sea «activa»", () => {
      const retirada = directiva({ estado: "retirada" });
      discos.setItem(
        DIRECTIVAS_KEY,
        JSON.stringify({ juicio: archivo([retirada], 2) }),
      );

      expect(directivaActiva("juicio")).toBeUndefined();
    });

    it("devuelve undefined sin window", () => {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: undefined,
      });
      expect(directivaActiva("juicio")).toBeUndefined();
    });
  });
});
