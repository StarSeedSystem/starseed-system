import { describe, it, expect } from "vitest";
import { motivosNuevaVariacion } from "@/lib/variaciones/datos";
import {
  VERSION_VISTA,
  VISTA_FABRICA,
  CLAVE_VISTAS,
  normalizarVista,
  versionDeVista,
  normalizarColeccion,
  leerColeccion,
  guardarVista,
  eliminarVista,
  vistasDe,
  configuracionCompartible,
  claveDeVista,
  aVariacionPublica,
  vistaDesdeConfiguracion,
  type AlmacenVistas,
  type Vista4D,
} from "../vistas";

function almacen(): AlmacenVistas & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => { datos.set(clave, valor); },
    removeItem: (clave) => { datos.delete(clave); },
  };
}

function vista(parche: Partial<Vista4D> = {}): Vista4D {
  return normalizarVista({ ...VISTA_FABRICA, id: "v1", nombre: "Mía", ...parche });
}

describe("vistas de Ramas 4D", () => {
  it("sanea y acota una vista sin lanzar", () => {
    const v = normalizarVista({
      id: "x", nombre: "  Prueba  ", plantilla: "educacion", capas: ["sistema-educativo", 3, " "],
      perspectiva: "neurona", fondo: "natural", sonidoEspacial: true,
      fisica: { gravedad: 99, distancia: 0, velocidad: 2 },
      etiquetas: { tamano: 9, siempre: true },
      colores: { acento: "#7C3AED", nodo: "accent", arista: "no-es-hex", texto: { tipo: "token", valor: "primary" } },
    });
    expect(v.v).toBe(VERSION_VISTA);
    expect(v.nombre).toBe("Prueba");
    expect(v.capas).toEqual(["sistema-educativo"]);
    expect(v.fisica).toEqual({ gravedad: 5, distancia: 0.5, velocidad: 2 });
    expect(v.etiquetas).toEqual({ tamano: 3, siempre: true });
    expect(v.colores.acento).toEqual({ tipo: "personalizado", valor: "#7c3aed" });
    expect(v.colores.nodo).toEqual({ tipo: "token", valor: "--accent" });
    expect(v.colores.arista).toEqual(VISTA_FABRICA.colores.arista);
    expect(v.colores.texto).toEqual({ tipo: "token", valor: "--primary" });
    expect(normalizarVista(null).id).toBe(VISTA_FABRICA.id);
  });

  it("migra la v1 (color suelto) a la v2 con sus campos nuevos", () => {
    const v1 = {
      v: 1, id: "vieja", nombre: "Vieja", plantilla: "cerebros", capas: ["sistema-ia"],
      perspectiva: "grupo", color: "#00f0ff", fisica: { gravedad: 2, distancia: 4, velocidad: 1 },
      formas: { neurona: "estrella" }, alcance: "grupo", grupo: "g-1", actualizado: 7,
    };
    expect(versionDeVista(v1)).toBe(1);
    const v = normalizarVista(v1);
    expect(v.v).toBe(2);
    expect(v.colores.acento).toEqual({ tipo: "personalizado", valor: "#00f0ff" });
    expect(v.fondo).toBe("noche");
    expect(v.sonidoEspacial).toBe(false);
    expect(v.etiquetas).toEqual({ tamano: 1, siempre: false });
    expect(v.iconos).toEqual({});
    expect(v.alcance).toBe("grupo");
    expect(v.grupo).toBe("g-1");
    expect(v.actualizado).toBe(7);
  });

  it("guarda, lee, actualiza por id y elimina", () => {
    const a = almacen();
    const r1 = guardarVista(a, vista({ id: "a", nombre: "A" }), 100);
    expect(r1.ok).toBe(true);
    expect(a.datos.has(CLAVE_VISTAS)).toBe(true);
    guardarVista(a, vista({ id: "b", nombre: "B" }), 101);
    const r2 = guardarVista(a, vista({ id: "a", nombre: "A2" }), 102);
    const guardadas = leerColeccion(a);
    expect(guardadas.vistas).toHaveLength(2);
    expect(guardadas.vistas.find((v) => v.id === "a")?.nombre).toBe("A2");
    expect(r2.coleccion.vistas.find((v) => v.id === "a")?.actualizado).toBe(102);
    const r3 = eliminarVista(a, "b");
    expect(r3.coleccion.vistas.map((v) => v.id)).toEqual(["a"]);
  });

  it("una colección rota cae en vacío, no en una excepción", () => {
    const a = almacen();
    a.datos.set(CLAVE_VISTAS, "{no es json");
    expect(leerColeccion(a).vistas).toEqual([]);
    expect(normalizarColeccion({ vistas: "x" }).vistas).toEqual([]);
  });

  it("separa las vistas por persona y por grupo", () => {
    const coleccion = normalizarColeccion({
      vistas: [
        vista({ id: "p1", alcance: "persona" }),
        vista({ id: "g1", alcance: "grupo", grupo: "equipo-a" }),
        vista({ id: "g2", alcance: "grupo", grupo: "equipo-b" }),
      ],
    });
    expect(vistasDe(coleccion, "persona").map((v) => v.id)).toEqual(["p1"]);
    expect(vistasDe(coleccion, "grupo", "equipo-a").map((v) => v.id)).toEqual(["g1"]);
  });

  it("al compartir viaja solo la configuración, nunca la identidad", () => {
    const v = vista({ id: "secreta", nombre: "Mía", alcance: "grupo", grupo: "equipo-a", dueno: "persona-1" });
    const cfg = configuracionCompartible(v) as Record<string, unknown>;
    expect(cfg).not.toHaveProperty("id");
    expect(cfg).not.toHaveProperty("dueno");
    expect(cfg).not.toHaveProperty("grupo");
    expect(cfg).not.toHaveProperty("actualizado");
    expect(cfg).not.toHaveProperty("nombre");
    expect(cfg.plantilla).toBe(v.plantilla);
    expect(cfg.alcance).toBe("grupo");
    expect(cfg.capas).not.toBe(v.capas);
  });

  it("exporta una variación pública válida por plantilla", () => {
    const v = vista({ plantilla: "educacion", capas: ["sistema-educativo"] });
    expect(claveDeVista(v)).toBe("vista:educacion");
    const variacion = aVariacionPublica(v, { titulo: "Aula 4D", etiquetas: [" Aula ", "aula", "4D"] });
    expect(variacion.clave).toBe("vista:educacion");
    expect(variacion.titulo).toBe("Aula 4D");
    expect(variacion.licencia).toBe("CC-BY-4.0");
    expect(variacion.etiquetas).toEqual(["aula", "4d"]);
    expect(variacion.deVariacion).toBeNull();
    expect(motivosNuevaVariacion(variacion).motivos).toEqual([]);
    const payload = variacion.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("dueno");
  });

  it("aplica una configuración compartida a una vista propia", () => {
    const original = vista({ plantilla: "cultura", fondo: "profundidad", fisica: { gravedad: 2, distancia: 5, velocidad: 1.5 } });
    const aplicada = vistaDesdeConfiguracion(configuracionCompartible(original), { id: "mía", nombre: "Copia", dueno: "yo", alcance: "persona" }, 50);
    expect(aplicada.id).toBe("mía");
    expect(aplicada.nombre).toBe("Copia");
    expect(aplicada.dueno).toBe("yo");
    expect(aplicada.plantilla).toBe("cultura");
    expect(aplicada.fondo).toBe("profundidad");
    expect(aplicada.fisica).toEqual(original.fisica);
    expect(aplicada.actualizado).toBe(50);
  });
});
