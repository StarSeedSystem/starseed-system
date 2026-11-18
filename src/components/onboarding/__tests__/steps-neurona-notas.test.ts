import { describe, it, expect } from "vitest";
import {
  atributosNota,
  clasesNota,
  crearNota,
  type TonoNota,
} from "../steps-neurona";

describe("notas del rito (pasos de neurona)", () => {
  it("un error se anuncia como alerta inmediata", () => {
    expect(atributosNota("error")).toEqual({ role: "alert", "aria-live": "assertive" });
  });

  it("aviso y éxito se anuncian sin interrumpir", () => {
    for (const tono of ["aviso", "exito"] as TonoNota[]) {
      expect(atributosNota(tono)).toEqual({ role: "status", "aria-live": "polite" });
    }
  });

  it("cada tono usa contraste alto sobre su propio fondo", () => {
    expect(clasesNota("error")).toContain("text-red-100");
    expect(clasesNota("error")).toContain("border-red-400");
    expect(clasesNota("error")).toContain("bg-red-950");
    expect(clasesNota("aviso")).toContain("text-amber-100");
    expect(clasesNota("aviso")).toContain("border-amber-400");
    expect(clasesNota("exito")).toContain("text-emerald-100");
    expect(clasesNota("exito")).toContain("border-emerald-400");
  });

  it("una nota vacía no ocupa espacio en la interfaz", () => {
    expect(crearNota("", "error")).toBeNull();
    expect(crearNota("   ", "aviso")).toBeNull();
    expect(crearNota(null, "exito")).toBeNull();
    expect(crearNota(undefined, "error")).toBeNull();
  });

  it("recorta el texto y conserva el tono elegido", () => {
    expect(crearNota("  No se pudo vincular ahora.  ", "error")).toEqual({
      texto: "No se pudo vincular ahora.",
      tono: "error",
    });
    expect(crearNota("Correo vinculado", "exito")?.tono).toBe("exito");
  });
});
