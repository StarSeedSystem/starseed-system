/**
 * GUI1021I · puerta común `abrirGuia` y reglas del modo invitado (todo puro).
 * El evento no se compara importándolo: se lee el TEXTO de `guia-acceso.ts` y
 * de `aurora-guide.tsx` y se comprueba que son literalmente la misma cadena
 * (contrato de la tarea; `aurora-guide` no se importa desde aquí).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accionesDelPaso,
  abrirGuia,
  ETIQUETA_DISPONIBLE_AL_ENTRAR,
  esOrigenDeAcceso,
  modoGuia,
  unirVistas,
  zGuia,
  Z_GUIA_HOY,
  Z_GUIA_SOBRE_ACCESO,
  type DetalleAbrirGuia,
} from "../guia-acceso";

const RAIZ = join(__dirname, "..", "..", "..", "..");

const leerFuente = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf-8");

/** Extrae el valor literal de un `export const NOMBRE = "…";` en una fuente. */
const valorConstante = (fuente: string, nombre: string): string | null => {
  const coincidencia = fuente.match(
    new RegExp(`export const ${nombre} = "([^"]+)"`, "m"),
  );
  return coincidencia ? coincidencia[1] : null;
};

/** Ventana de mentira que solo registra lo que se le despacha. */
function ventanaRegistro(): {
  ventana: Pick<Window, "dispatchEvent">;
  eventos: { tipo: string; detalle: unknown }[];
} {
  const eventos: { tipo: string; detalle: unknown }[] = [];
  return {
    eventos,
    ventana: {
      dispatchEvent: (evento: Event) => {
        eventos.push({
          tipo: evento.type,
          detalle: (evento as CustomEvent).detail,
        });
        return true;
      },
    },
  };
}

describe("puerta común abrirGuia", () => {
  it("el evento es literalmente el mismo que OPEN_GUIDE_EVENT (por texto, sin importar)", () => {
    const fuente = leerFuente("src/lib/onboarding/guia-acceso.ts");
    const tour = leerFuente("src/components/onboarding/aurora-guide.tsx");
    const nuestro = valorConstante(fuente, "EVENTO_ABRIR_GUIA");
    const suyo = valorConstante(tour, "OPEN_GUIDE_EVENT");
    expect(nuestro).toBe("starseed:open-guide");
    expect(suyo).toBe(nuestro);
  });

  it("el módulo es puro: sin import de node:* (lo cargará el cliente)", () => {
    const fuente = leerFuente("src/lib/onboarding/guia-acceso.ts");
    expect(fuente).not.toMatch(/from "node:/);
  });

  it("sin window NO hace nada y nunca lanza (entorno node: no hay window)", () => {
    expect(() => abrirGuia({ desde: "login" })).not.toThrow();
  });

  it("con window despacha el evento con { desde } como detalle", () => {
    const { ventana, eventos } = ventanaRegistro();
    abrirGuia({ desde: "bienvenida" }, ventana);
    expect(eventos).toEqual([
      { tipo: "starseed:open-guide", detalle: { desde: "bienvenida" } },
    ]);
  });

  it("con temaInicial lo incluye en el detalle; sin él, no añade la clave", () => {
    const { ventana, eventos } = ventanaRegistro();
    const conTema: DetalleAbrirGuia = { desde: "ajustes", temaInicial: "malla" };
    abrirGuia(conTema, ventana);
    abrirGuia({ desde: "boton" }, ventana);
    expect(eventos).toEqual([
      {
        tipo: "starseed:open-guide",
        detalle: { desde: "ajustes", temaInicial: "malla" },
      },
      { tipo: "starseed:open-guide", detalle: { desde: "boton" } },
    ]);
  });
});

describe("modo invitado", () => {
  it("modoGuia: hay sesión → cuenta; sin sesión → invitado", () => {
    expect(modoGuia(true)).toBe("cuenta");
    expect(modoGuia(false)).toBe("invitado");
  });

  it("accionesDelPaso en invitado: ni Ir ni Hazlo por mí, con la etiqueta del límite", () => {
    expect(accionesDelPaso("invitado")).toEqual({
      puedeIr: false,
      puedeHacerlo: false,
      etiquetaDisponibleAlEntrar: ETIQUETA_DISPONIBLE_AL_ENTRAR,
    });
    expect(ETIQUETA_DISPONIBLE_AL_ENTRAR).toBe("Disponible al entrar");
  });

  it("accionesDelPaso en cuenta: Ir y Hazlo por mí disponibles, sin etiqueta extra", () => {
    expect(accionesDelPaso("cuenta")).toEqual({
      puedeIr: true,
      puedeHacerlo: true,
      etiquetaDisponibleAlEntrar: null,
    });
  });

  it("esOrigenDeAcceso solo reconoce las ventanas que piden cuenta", () => {
    expect(esOrigenDeAcceso("login")).toBe(true);
    expect(esOrigenDeAcceso("bienvenida")).toBe(true);
    expect(esOrigenDeAcceso("aviso")).toBe(true);
    expect(esOrigenDeAcceso("ajustes")).toBe(false);
    expect(esOrigenDeAcceso("boton")).toBe(false);
  });

  it("zGuia: sin sesión, 240 siempre (antes de cuenta la guía flota por encima)", () => {
    for (const desde of ["login", "bienvenida", "ajustes", "aviso", "boton"] as const) {
      expect(zGuia(desde, false)).toBe(240);
    }
  });

  it("zGuia: desde una ventana de acceso, 240 aunque haya sesión; si no, el valor de hoy", () => {
    expect(zGuia("login", true)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("bienvenida", true)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("aviso", true)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("ajustes", true)).toBe(Z_GUIA_HOY);
    expect(zGuia("boton", true)).toBe(Z_GUIA_HOY);
  });
});

describe("unirVistas (lo visto como invitado se une a la cuenta)", () => {
  it("une ambas marcas sin perder nada y la cuenta va primero", () => {
    expect(unirVistas(["orbe", "malla"], ["orbe", "neuronas-cerebro"])).toEqual([
      "orbe",
      "neuronas-cerebro",
      "malla",
    ]);
  });

  it("no duplica: ni entre sí, ni dentro de un mismo origen", () => {
    expect(unirVistas(["a", "a", "b"], ["b", "c"])).toEqual(["b", "c", "a"]);
    expect(unirVistas([], [])).toEqual([]);
  });

  it("con una de las dos vacías devuelve la otra completa", () => {
    expect(unirVistas([], ["pilar-politica", "genesis"])).toEqual([
      "pilar-politica",
      "genesis",
    ]);
    expect(unirVistas(["libreria-biblioteca"], [])).toEqual(["libreria-biblioteca"]);
  });
});
