import { describe, it, expect } from "vitest";
import {
  crearHerramientaVariaciones,
  formatearVariaciones,
  validarArgumentosVariaciones,
  type VariacionPublica,
} from "../herramienta-variaciones";

const variaciones: readonly VariacionPublica[] = [
  {
    id: "v1",
    clave: "widget:clima",
    tipo: "variacion",
    titulo: "Cristal suave",
    licencia: "MIT",
    usos: 12,
    etiquetas: ["cristal", "suave"],
    descripcion: "Cristal con menos opacidad.",
  },
  {
    id: "r1",
    clave: "widget:clima",
    tipo: "repo",
    titulo: "Repositorio de temas de clima",
    licencia: "Apache-2.0",
  },
];

const listadorFalso = async (p: { clave: string; buscar?: string; orden?: string }) =>
  variaciones.filter((v) => v.clave === p.clave);

describe("validarArgumentosVariaciones", () => {
  it("exige una clave no vacía", () => {
    expect(validarArgumentosVariaciones({}).error).toContain("clave del elemento");
    expect(validarArgumentosVariaciones({ clave: "   " }).error).toContain("clave del elemento");
    expect(validarArgumentosVariaciones({ clave: 42 }).error).toContain("clave del elemento");
  });

  it("recorta la clave y la devuelve limpia", () => {
    const r = validarArgumentosVariaciones({ clave: "  widget:clima " });
    expect(r.error).toBeUndefined();
    expect(r.argumentos).toEqual({ clave: "widget:clima" });
  });

  it("rechaza buscar no texto y orden desconocido", () => {
    expect(validarArgumentosVariaciones({ clave: "widget:clima", buscar: 7 }).error).toContain("buscar");
    expect(validarArgumentosVariaciones({ clave: "widget:clima", orden: "salto" }).error).toContain("orden");
  });

  it("acepta buscar y orden válidos", () => {
    const r = validarArgumentosVariaciones({ clave: "tema:aurora", buscar: "cristal", orden: "populares" });
    expect(r.argumentos).toEqual({ clave: "tema:aurora", buscar: "cristal", orden: "populares" });
  });

  it("descarta un buscar que queda vacío al recortar", () => {
    const r = validarArgumentosVariaciones({ clave: "tema:aurora", buscar: "  " });
    expect(r.argumentos).toEqual({ clave: "tema:aurora" });
  });
});

describe("formatearVariaciones", () => {
  it("pone clave, orden y número de resultados en la cabecera", () => {
    const lineas = formatearVariaciones({ clave: "widget:clima", orden: "usadas" }, variaciones);
    expect(lineas[0]).toContain("widget:clima");
    expect(lineas[0]).toContain("usadas");
    expect(lineas[0]).toContain("2 resultado(s)");
  });

  it("pinta tipo, título, licencia, usos y etiquetas de cada variación", () => {
    const lineas = formatearVariaciones({ clave: "widget:clima" }, variaciones);
    expect(lineas.join("\n")).toContain("[variacion] Cristal suave");
    expect(lineas.join("\n")).toContain("licencia MIT");
    expect(lineas.join("\n")).toContain("12 usos");
    expect(lineas.join("\n")).toContain("cristal, suave");
  });

  it("deja la descripción en su propia línea", () => {
    const lineas = formatearVariaciones({ clave: "widget:clima" }, [variaciones[0]]);
    expect(lineas.join("\n")).toContain("Cristal con menos opacidad.");
  });

  it("anuncia cero resultados sin peticiones adicionales", () => {
    const lineas = formatearVariaciones({ clave: "app:notas" }, []);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toContain("0 resultado(s)");
  });
});

describe("herramienta variaciones_buscar", () => {
  it("declara nombre, permiso y esquema con clave obligatoria", () => {
    const herramienta = crearHerramientaVariaciones(listadorFalso);
    expect(herramienta.nombre).toBe("variaciones_buscar");
    expect(herramienta.permiso).toBe("variaciones:buscar");
    const requeridos = (herramienta.esquema.required as string[]) ?? [];
    expect(requeridos).toContain("clave");
  });

  it("ejecuta el listador inyectado y devuelve las variaciones", async () => {
    const herramienta = crearHerramientaVariaciones(listadorFalso);
    const r = await herramienta.ejecutar({ clave: "widget:clima", orden: "novedades" });
    expect(r.esError).toBeUndefined();
    expect(r.contenido).toHaveLength(4);
    expect(r.contenido[0].texto).toContain("widget:clima");
    expect(r.contenido[1].texto).toContain("Cristal suave");
  });

  it("pasa buscar al listador inyectado", async () => {
    let recibido = "";
    const listadorEspia = async (p: { buscar?: string }) => {
      recibido = p.buscar ?? "";
      return variaciones;
    };
    const r = await crearHerramientaVariaciones(listadorEspia).ejecutar({
      clave: "widget:clima",
      buscar: "cristal",
    });
    expect(recibido).toBe("cristal");
    expect(r.esError).toBeUndefined();
  });

  it("sin clave devuelve esError con mensaje", async () => {
    const r = await crearHerramientaVariaciones(listadorFalso).ejecutar({});
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toContain("clave del elemento");
  });

  it("devuelve esError si el listador falla", async () => {
    const listadorRoto = async () => {
      throw new Error("sin conexión a la capa de datos");
    };
    const r = await crearHerramientaVariaciones(listadorRoto).ejecutar({ clave: "widget:clima" });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toContain("sin conexión a la capa de datos");
  });
});
