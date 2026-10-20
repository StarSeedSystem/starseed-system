// src/lib/variaciones/__tests__/fuentes.test.ts
// Tests para las funciones puras de fuentes.ts

import { describe, it, expect } from "vitest";
import {
  generarClaveElemento,
  extraerFamilia,
  validarClaveElemento,
  crearVariacionPublica,
  conEtiquetas,
  incrementarVistas,
  validarVariacionPublica,
  filtrarPorTipo,
  filtrarPorFamilia,
  ordenarPorFechaReciente,
  buscarPorTexto,
  VariacionPublica,
  ResultadoBusquedaVariaciones
} from "../fuentes";

describe("fuentes.ts - Funciones de manejo de claves", () => {
  it("generarClaveElemento debería crear una clave básica", () => {
    const resultado = generarClaveElemento("widget", "clima");
    expect(resultado).toBe("widget:clima");
  });

  it("generarClaveElemento debería crear una clave con parte", () => {
    const resultado = generarClaveElemento("post", "123", "estilo");
    expect(resultado).toBe("post:123#estilo");
  });

  it("extraerFamilia debería obtener la familia de una clave", () => {
    const resultado = extraerFamilia("widget:clima");
    expect(resultado).toBe("widget");
  });

  it("extraerFamilia debería obtener la familia de una clave con parte", () => {
    const resultado = extraerFamilia("tema:synthwave-horizon#oscuro");
    expect(resultado).toBe("tema");
  });

  it("validarClaveElemento debería aceptar claves válidas", () => {
    expect(validarClaveElemento("widget:clima")).toBe(true);
    expect(validarClaveElemento("tema:synthwave-horizon#oscuro")).toBe(true);
    expect(validarClaveElemento("app:notas")).toBe(true);
  });

  it("validarClaveElemento debería rechazar claves inválidas", () => {
    expect(validarClaveElemento("widgetclima")).toBe(false); // falta :
    expect(validarClaveElemento("widget:")).toBe(false); // falta id
    expect(validarClaveElemento(":clima")).toBe(false); // falta familia
    expect(validarClaveElemento("widget:clima#")).toBe(false); // parte vacía
    expect(validarClaveElemento("widget:clima#estilo#extra")).toBe(false); // múltiples #
  });
});

describe("fuentes.ts - Funciones de variaciones públicas", () => {
  const variacionBase: VariacionPublica = {
    elemento: "widget:clima",
    tipo: "variacion",
    titulo: "Widget Clima Básico",
    descripcion: "Un widget simple que muestra el clima",
    payload: { temperatura: 25, unidad: "C" },
    familia: "widget",
    version: "1.0.0",
    licencia: "CC-BY-4.0",
    etiquetas: ["clima", "widget"],
    autor: "usuario1",
    fechaCreacion: "2026-10-20T10:00:00Z",
    fechaActualizacion: "2026-10-20T10:00:00Z",
    contadores: {
      vistas: 0,
      aplicaciones: 0,
      descargas: 0
    }
  };

  it("crearVariacionPublica debería crear una variación válida", () => {
    const variacion = crearVariacionPublica(
      "tema:oscuro",
      "variacion",
      "Tema Oscuro",
      "Tema oscuro para el OS",
      { fondo: "#000", texto: "#fff" },
      "tema",
      "usuario2"
    );

    expect(variacion.elemento).toBe("tema:oscuro");
    expect(variacion.tipo).toBe("variacion");
    expect(variacion.titulo).toBe("Tema Oscuro");
    expect(variacion.descripcion).toBe("Tema oscuro para el OS");
    expect(variacion.payload).toEqual({ fondo: "#000", texto: "#fff" });
    expect(variacion.familia).toBe("tema");
    expect(variacion.version).toBe("1.0.0");
    expect(variacion.licencia).toBe("CC-BY-4.0");
    expect(variacion.etiquetas).toEqual([]);
    expect(variacion.autor).toBe("usuario2");
    expect(variacion.fechaCreacion).toBeDefined();
    expect(variacion.fechaActualizacion).toBeDefined();
    expect(variacion.contadores).toEqual({ vistas: 0, aplicaciones: 0, descargas: 0 });
    expect(validarVariacionPublica(variacion)).toBe(true);
  });

  it("conEtiquetas debería añadir etiquetas a una variación", () => {
    const variacionConEtiquetas = conEtiquetas(variacionBase, ["nuevo", "test"]);
    expect(variacionConEtiquetas.etiquetas).toEqual(expect.arrayContaining(["clima", "widget", "nuevo", "test"]));
    expect(variacionConEtiquetas.fechaActualizacion).not.toBe(variacionBase.fechaActualizacion);
    // La variación original no debería cambiar
    expect(variacionBase.etiquetas).toEqual(["clima", "widget"]);
  });

  it("incrementarVistas debería aumentar el contador de vistas", () => {
    const variacionConVistas = incrementarVistas(variacionBase);
    expect(variacionConVistas.contadores.vistas).toBe(1);
    expect(variacionConVistas.contadores.aplicaciones).toBe(0);
    expect(variacionConVistas.contadores.descargas).toBe(0);
    expect(variacionConVistas.fechaActualizacion).not.toBe(variacionBase.fechaActualizacion);
  });

  it("validarVariacionPublica debería aceptar variaciones válidas", () => {
    expect(validarVariacionPublica(variacionBase)).toBe(true);
  });

  it("validarVariacionPublica debería rechazar variaciones con elemento inválido", () => {
    const variacionInvalida = { ...variacionBase, elemento: "widgetclima" };
    expect(validarVariacionPublica(variacionInvalida)).toBe(false);
  });

  it("validarVariacionPublica debería rechazar variaciones con campos vacíos requeridos", () => {
    const variacionSinTitulo = { ...variacionBase, titulo: "" };
    expect(validarVariacionPublica(variacionSinTitulo)).toBe(false);
    
    const variacionSinAutor = { ...variacionBase, autor: "" };
    expect(validarVariacionPublica(variacionSinAutor)).toBe(false);
  });

  it("filtrarPorTipo debería devolver solo variaciones del tipo especificado", () => {
    const variaciones: VariacionPublica[] = [
      variacionBase,
      { ...variacionBase, tipo: "nota", elemento: "widget:clima#nota1" },
      { ...variacionBase, tipo: "repo", elemento: "widget:clima#repo1" }
    ];
    
    const resultado = filtrarPorTipo(variaciones, "variacion");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].tipo).toBe("variacion");
  });

  it("filtrarPorFamilia debería devolver solo variaciones de la familia especificada", () => {
    const variaciones = [
      variacionBase,
      { ...variacionBase, familia: "tema", elemento: "tema:oscuro" }
    ];
    
    const resultado = filtrarPorFamilia(variaciones, "widget");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].familia).toBe("widget");
  });

  it("ordenarPorFechaReciente debería ordenar de más reciente a más antigua", () => {
    const variaciones = [
      { ...variacionBase, fechaCreacion: "2026-10-20T10:00:00Z" },
      { ...variacionBase, fechaCreacion: "2026-10-20T12:00:00Z", elemento: "widget:clima#2" },
      { ...variacionBase, fechaCreacion: "2026-10-20T09:00:00Z", elemento: "widget:clima#3" }
    ];
    
    const resultado = ordenarPorFechaReciente(variaciones);
    expect(resultado[0].fechaCreacion).toBe("2026-10-20T12:00:00Z");
    expect(resultado[1].fechaCreacion).toBe("2026-10-20T10:00:00Z");
    expect(resultado[2].fechaCreacion).toBe("2026-10-20T09:00:00Z");
  });

  it("buscarPorTexto debería encontrar variaciones por texto en título o descripción", () => {
    const variaciones = [
      variacionBase,
      { 
        ...variacionBase, 
        titulo: "Widget de Reloj",
        elemento: "widget:reloj",
        descripcion: "Un widget que muestra la hora actual"
      },
      { 
        ...variacionBase, 
        titulo: "Widget de Pronóstico",
        elemento: "widget:pronostico",
        descripcion: "Un widget que muestra el pronóstico detallado"
      }
    ];
    
    // Buscar por título
    let resultado = buscarPorTexto(variaciones, "Reloj");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].titulo).toBe("Widget de Reloj");
    
    // Buscar por descripción
    resultado = buscarPorTexto(variaciones, "pronóstico");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].descripcion).toContain("pronóstico");
    
    // Búsqueda case insensitive
    resultado = buscarPorTexto(variaciones, "CLIMA");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].titulo).toBe("Widget Clima Básico");
    
    // Texto vacío debería devolver todas
    resultado = buscarPorTexto(variaciones, "");
    expect(resultado).toHaveLength(3);
  });
});