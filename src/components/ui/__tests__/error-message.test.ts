import { describe, it, expect } from "vitest";
import {
  atributosAccesibles,
  clasificarTono,
  construirMensaje,
  estilosTono,
  type TonoMensaje,
} from "../error-message";

const TONOS: TonoMensaje[] = ["error", "validacion", "permiso", "aviso", "exito"];

describe("clasificarTono", () => {
  it("reconoce un fallo de red sin afirmar que el servicio está caído", () => {
    expect(clasificarTono("No pude leer tus cerebros ahora (¿sin red o con la pausa de consumo?).")).toBe("error");
    expect(clasificarTono("No se pudo conectar con la fuente.")).toBe("error");
  });

  it("separa la validación de un dato del resto de errores", () => {
    expect(clasificarTono("Escribe un correo válido.")).toBe("validacion");
    expect(clasificarTono("El formato del handle es incorrecto.")).toBe("validacion");
  });

  it("reconoce la falta de permiso como causa accionable", () => {
    expect(clasificarTono("El micrófono está bloqueado por el navegador.")).toBe("permiso");
    expect(clasificarTono("No tienes permiso para acceder a esta carpeta.")).toBe("permiso");
  });

  it("no presenta como error lo que sí quedó guardado", () => {
    expect(clasificarTono("Guardé tu elección localmente; la sincronizaré cuando haya conexión.")).toBe("aviso");
    expect(clasificarTono("Correo vinculado a tu cuenta ✓")).toBe("exito");
  });

  it("usa error como tono seguro ante un texto desconocido o vacío", () => {
    expect(clasificarTono("Algo pasó.")).toBe("error");
    expect(clasificarTono("")).toBe("error");
  });
});

describe("construirMensaje", () => {
  it("conserva el detalle y añade una guía concreta para un error de red", () => {
    const m = construirMensaje("No pude leer tus cerebros ahora (¿sin red?).");
    expect(m.tono).toBe("error");
    expect(m.titulo).toBe("No se pudo completar");
    expect(m.detalle).toBe("No pude leer tus cerebros ahora (¿sin red?).");
    expect(m.sugerencia).toContain("conexión");
    expect(m.sugerencia).toContain("inténtalo");
  });

  it("guía a corregir el dato en una validación", () => {
    const m = construirMensaje("Escribe un correo válido.");
    expect(m.tono).toBe("validacion");
    expect(m.titulo).toBe("Revisa lo que escribiste");
    expect(m.sugerencia).toContain("Corrige");
  });

  it("lleva el permiso a Ajustes en vez de pedir reintentos inútiles", () => {
    const m = construirMensaje("El micrófono está bloqueado por el navegador.");
    expect(m.tono).toBe("permiso");
    expect(m.sugerencia).toContain("Ajustes");
  });

  it("no sugiere reintentar cuando el resultado ya es correcto", () => {
    const m = construirMensaje("Correo vinculado a tu cuenta ✓");
    expect(m.tono).toBe("exito");
    expect(m.titulo).toBe("Listo");
    expect(m.sugerencia).toBeNull();
  });

  it("permite forzar el tono cuando quien llama conoce el contexto", () => {
    const m = construirMensaje("Todo en orden.", "aviso");
    expect(m.tono).toBe("aviso");
  });

  it("nunca devuelve un detalle vacío", () => {
    const m = construirMensaje("   ");
    expect(m.detalle.length).toBeGreaterThan(0);
  });
});

describe("atributosAccesibles", () => {
  it("anuncia los errores de inmediato y los avisos sin interrumpir", () => {
    expect(atributosAccesibles("error")).toEqual({ role: "alert", ariaLive: "assertive" });
    expect(atributosAccesibles("validacion")).toEqual({ role: "alert", ariaLive: "assertive" });
    expect(atributosAccesibles("exito")).toEqual({ role: "status", ariaLive: "polite" });
    expect(atributosAccesibles("aviso")).toEqual({ role: "status", ariaLive: "polite" });
  });
});

describe("estilosTono", () => {
  it("cada tono usa tinta clara sobre fondo translúcido y borde visible", () => {
    for (const tono of TONOS) {
      const estilos = estilosTono(tono);
      expect(estilos.contenedor).toMatch(/border-(rose|amber|orange|sky|emerald)-300\/40/);
      expect(estilos.contenedor).toMatch(/bg-(rose|amber|orange|sky|emerald)-500\/15/);
      expect(estilos.titulo).toMatch(/text-(rose|amber|orange|sky|emerald)-(50|100)/);
      expect(estilos.detalle).toMatch(/text-(rose|amber|orange|sky|emerald)-(50|100)/);
    }
  });

  it("da a cada tono una familia de color distinta", () => {
    const contenedores = TONOS.map((tono) => estilosTono(tono).contenedor);
    expect(new Set(contenedores).size).toBe(TONOS.length);
  });
});
