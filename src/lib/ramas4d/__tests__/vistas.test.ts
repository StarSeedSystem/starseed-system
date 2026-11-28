import { describe, it, expect } from "vitest";
import {
  CLAVE_VISTAS,
  VERSION_VISTA,
  crearVista,
  migrarVista,
  leerVistas,
  guardarVista,
  borrarVista,
  configuracionCompartible,
  motivosCompartir,
  compartirVista,
  comoVariacionPublica,
  type AlmacenVistas,
  type VistaGuardada,
} from "../vistas";

function almacenEnMemoria(inicial: Record<string, string> = {}): AlmacenVistas & { datos: Record<string, string> } {
  const datos: Record<string, string> = { ...inicial };
  return {
    datos,
    getItem: (clave) => datos[clave] ?? null,
    setItem: (clave, valor) => { datos[clave] = valor; },
    removeItem: (clave) => { delete datos[clave]; },
  };
}

function vistaBase(parcial: Partial<VistaGuardada> = {}): VistaGuardada {
  return crearVista("ana", 1_000, () => "vista-uno", { nombre: "Mi galaxia", ...parcial });
}

describe("crearVista", () => {
  it("parte de los valores por defecto y respeta lo indicado", () => {
    const vista = vistaBase();
    expect(vista.version).toBe(VERSION_VISTA);
    expect(vista.dueno).toBe("ana");
    expect(vista.nombre).toBe("Mi galaxia");
    expect(vista.publica).toBe(false);
    expect(vista.capas.length).toBeGreaterThan(0);
    expect(vista.fisica.gravedad).toBeGreaterThan(0);
  });

  it("no muta el parcial y fija la fecha de actualización", () => {
    const parcial: Partial<VistaGuardada> = { nombre: "Otra", creada: 10 };
    const vista = crearVista("ana", 500, () => "v2", parcial);
    expect(vista.creada).toBe(10);
    expect(vista.actualizada).toBe(500);
    expect(parcial.actualizada).toBeUndefined();
  });
});

describe("migrarVista", () => {
  it("migra una vista v1 (colores/fondo de texto y sonido booleano)", () => {
    const v1 = {
      version: 1, id: "vieja", nombre: "Vieja", plantilla: "educacion", capas: ["sistema-educativo"],
      perspectiva: "mi-grupo", formas: { cerebro: "galaxia" }, colores: "primary",
      fisica: { gravedad: 1.5, distancia: 2, velocidad: 0.5 }, fondo: "var(--background)",
      sonido: true, dueno: "ana",
    };
    const vista = migrarVista(v1, 2_000);
    expect(vista).not.toBeNull();
    expect(vista?.version).toBe(VERSION_VISTA);
    expect(vista?.colores.base).toBe("var(--primary)");
    expect(vista?.fondo).toEqual({ tipo: "tema", valor: "var(--background)", opacidad: 1 });
    expect(vista?.sonido).toEqual({ activo: true, intensidad: 0.5 });
    expect(vista?.formas.cerebro).toEqual({ forma: "galaxia", icono: "punto" });
    expect(vista?.etiquetas.diseno).toBe("compacto");
  });

  it("sanea valores fuera de rango y colores no permitidos", () => {
    const vista = migrarVista({
      id: "x", version: 2, nombre: "X", colores: { nodo: "javascript:alert(1)", personalizados: ["#aabbcc", "rojo"] },
      fisica: { gravedad: 99, distancia: -3 }, fondo: { tipo: "raro", valor: "#112233", opacidad: 4 },
      etiquetas: { diseno: "gigante", tamano: 9 },
    }, 3_000);
    expect(vista?.colores.nodo).toBe("var(--primary)");
    expect(vista?.colores.personalizados).toEqual(["#aabbcc"]);
    expect(vista?.fisica.gravedad).toBe(2);
    expect(vista?.fisica.distancia).toBe(0.2);
    expect(vista?.fondo.tipo).toBe("tema");
    expect(vista?.fondo.opacidad).toBe(1);
    expect(vista?.etiquetas.diseno).toBe("compacto");
    expect(vista?.etiquetas.tamano).toBe(2);
  });

  it("devuelve null si falta el id", () => {
    expect(migrarVista({ nombre: "sin id" })).toBeNull();
    expect(migrarVista(null)).toBeNull();
    expect(migrarVista("texto")).toBeNull();
  });
});

describe("guardado y lectura", () => {
  it("guarda una vista nueva y la recupera migrada", () => {
    const almacen = almacenEnMemoria();
    const guardada = guardarVista(almacen, vistaBase(), 2_000);
    expect(guardada?.actualizada).toBe(2_000);
    const leidas = leerVistas(almacen, "ana");
    expect(leidas).toHaveLength(1);
    expect(leidas[0].nombre).toBe("Mi galaxia");
    expect(JSON.parse(almacen.datos[CLAVE_VISTAS]).version).toBe(VERSION_VISTA);
  });

  it("actualiza por id en vez de duplicar", () => {
    const almacen = almacenEnMemoria();
    guardarVista(almacen, vistaBase(), 1_000);
    guardarVista(almacen, { ...vistaBase(), nombre: "Renombrada" }, 3_000);
    const leidas = leerVistas(almacen, "ana");
    expect(leidas).toHaveLength(1);
    expect(leidas[0].nombre).toBe("Renombrada");
    expect(leidas[0].actualizada).toBe(3_000);
  });

  it("separa por dueño y borra sin tocar las demás", () => {
    const almacen = almacenEnMemoria();
    guardarVista(almacen, vistaBase(), 1_000);
    guardarVista(almacen, vistaBase({ id: "de-beto", dueno: "beto" }), 1_000);
    expect(leerVistas(almacen, "ana")).toHaveLength(1);
    expect(leerVistas(almacen, "beto")).toHaveLength(1);
    expect(borrarVista(almacen, "vista-uno")).toBe(true);
    expect(leerVistas(almacen, "ana")).toHaveLength(0);
    expect(leerVistas(almacen, "beto")).toHaveLength(1);
  });

  it("tolera almacén nulo y JSON roto", () => {
    expect(leerVistas(null)).toEqual([]);
    expect(guardarVista(null, vistaBase())).toBeNull();
    const roto = almacenEnMemoria({ [CLAVE_VISTAS]: "{no es json" });
    expect(leerVistas(roto)).toEqual([]);
  });
});

describe("compartir", () => {
  it("comparte solo la configuración, nunca dueño, grupo ni identificadores", () => {
    const vista = vistaBase({ grupo: "sangha-norte", publica: true });
    const config = configuracionCompartible(vista);
    expect(config).not.toHaveProperty("dueno");
    expect(config).not.toHaveProperty("grupo");
    expect(config).not.toHaveProperty("id");
    expect(config.nombre).toBe("Mi galaxia");
    expect(config.colores).not.toBe(vista.colores);
  });

  it("exige marcar pública para alcance público y grupo para alcance de grupo", () => {
    const vista = vistaBase();
    expect(motivosCompartir(vista, "privado")).toEqual([]);
    expect(motivosCompartir(vista, "publico")).toHaveLength(1);
    expect(motivosCompartir(vista, "grupo")).toHaveLength(1);
    expect(compartirVista(vista, "publico").ok).toBe(false);
  });

  it("exporta como variación pública válida cuando la vista es pública", () => {
    const vista = vistaBase({ publica: true });
    const variacion = comoVariacionPublica(vista);
    expect(variacion).not.toBeNull();
    expect(variacion?.clave).toBe("vista:vista-uno");
    expect(variacion?.payload).toEqual(configuracionCompartible(vista));
    expect(JSON.stringify(variacion?.payload)).not.toContain("ana");
  });

  it("no exporta una vista privada", () => {
    expect(comoVariacionPublica(vistaBase())).toBeNull();
  });
});
