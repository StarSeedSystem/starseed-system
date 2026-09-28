import { beforeEach, describe, expect, it } from "vitest";
import {
  borrarPreferencia,
  guardarPreferencia,
  leerPreferencias,
  resolverPantallaInicial,
} from "../pantalla-inicial";

class AlmacenMemoria {
  private readonly datos = new Map<string, string>();

  getItem(clave: string): string | null {
    return this.datos.get(clave) ?? null;
  }

  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }
}

describe("pantalla inicial", () => {
  let eventos: string[];

  beforeEach(() => {
    eventos = [];
    const localStorage = new AlmacenMemoria();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage,
        dispatchEvent: (evento: Event) => {
          eventos.push(evento.type);
          return true;
        },
      },
    });
  });

  it("aplica la precedencia neurona, perfil y defecto", () => {
    const rutaValida = () => true;
    expect(resolverPantallaInicial({
      perfil: { tipo: "escritorios" },
      neurona: { tipo: "inicio" },
      rutaValida,
    })).toBe("/inicio");
    expect(resolverPantallaInicial({
      perfil: { tipo: "escritorios" },
      rutaValida,
    })).toBe("/escritorios");
    expect(resolverPantallaInicial({ rutaValida })).toBe("/dashboard");
  });

  it("resuelve dashboards identificados y rutas internas válidas", () => {
    expect(resolverPantallaInicial({
      perfil: { tipo: "dashboard", dashboardId: "mi espacio" },
      rutaValida: () => true,
    })).toBe("/dashboard?d=mi%20espacio");
    expect(resolverPantallaInicial({
      perfil: { tipo: "ruta", ruta: "/library" },
      rutaValida: (ruta) => ruta === "/library",
    })).toBe("/library");
  });

  it.each(["https://externa.test", "//externa.test", "/login", "/ya-no-existe"])(
    "hace caer la ruta %s al dashboard por defecto",
    (ruta) => {
      expect(resolverPantallaInicial({
        perfil: { tipo: "ruta", ruta },
        rutaValida: (candidata) => candidata !== "/ya-no-existe",
      })).toBe("/dashboard");
    },
  );

  it("guarda, lee y borra preferencias con el almacén mínimo", () => {
    guardarPreferencia("perfil", "perfil-1", { tipo: "inicio" });
    guardarPreferencia("neurona", "neurona-1", {
      tipo: "dashboard",
      dashboardId: "principal",
    });

    expect(leerPreferencias()).toEqual({
      v: 1,
      perfiles: { "perfil-1": { tipo: "inicio" } },
      neuronas: {
        "neurona-1": { tipo: "dashboard", dashboardId: "principal" },
      },
    });
    expect(eventos).toEqual(["starseed:inicio", "starseed:inicio"]);

    borrarPreferencia("perfil", "perfil-1");
    expect(leerPreferencias().perfiles).toEqual({});
  });
});
