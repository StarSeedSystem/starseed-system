import { describe, it, expect } from "vitest";
import {
  perfilFormDesdeFila, conTopeDe, type FilaPerfil,
} from "@/lib/onboarding/perfil-form";
import { MARCO_POR_DEFECTO, type Marco } from "@/lib/profile/marco-foto";
import type { Avatar3D } from "@/components/profile/avatar-3d";

const VACIO = {
  nombre: "", handle: "", bio: "", avatar: "", portada: "",
  marco: { ...MARCO_POR_DEFECTO }, avatar3d: null,
};

function avatar3d(url: string): Avatar3D {
  return {
    url, formato: "glb", posicion: { x: 0, y: 0, z: 0 }, rotacion: { x: 0, y: 0, z: 0 },
    escala: 1, animacion: "", autoRotar: false, exposicion: 1, sombra: 0,
    angulo: { theta: 0, phi: 0 }, distancia: 100, fov: 30,
  } as unknown as Avatar3D;
}

/**
 * Pruebas del módulo puro de carga de perfil (IMG): la fila de `profiles`
 * se convierte en estado del formulario, y toda promesa de carga corre con
 * tope de tiempo para que el spinner nunca quede eterno.
 */

describe("perfilFormDesdeFila", () => {
  it("fila nula → formulario vacío con el marco por defecto", () => {
    expect(perfilFormDesdeFila(null)).toEqual(VACIO);
  });

  it("fila sin nada → formulario vacío con el marco por defecto", () => {
    expect(perfilFormDesdeFila({})).toEqual(VACIO);
  });

  it("rellena cada campo y fusiona el marco con el por defecto", () => {
    const marco = { forma: "estrella", escala: 1.5 } as Marco;
    const fila: FilaPerfil = {
      handle: "alex", display_name: "Alex", bio: "Hola",
      avatar_url: "a.png", cover_url: "c.png", avatar_marco: marco,
      avatar_3d: avatar3d("m.glb"),
    };
    const e = perfilFormDesdeFila(fila);
    expect(e.nombre).toBe("Alex");
    expect(e.handle).toBe("alex");
    expect(e.bio).toBe("Hola");
    expect(e.avatar).toBe("a.png");
    expect(e.portada).toBe("c.png");
    expect(e.marco).toEqual({ ...MARCO_POR_DEFECTO, forma: "estrella", escala: 1.5 });
    expect(e.avatar3d?.url).toBe("m.glb");
  });

  it("avatar 3D sin url se descarta y el marco vacío queda por defecto", () => {
    const e = perfilFormDesdeFila({ avatar_3d: avatar3d("") });
    expect(e.avatar3d).toBeNull();
    expect(e.marco).toEqual(MARCO_POR_DEFECTO);
  });
});

describe("conTopeDe", () => {
  it("devuelve el valor si la promesa llega a tiempo", async () => {
    await expect(conTopeDe(Promise.resolve("listo"), 1000)).resolves.toBe("listo");
  });

  it("devuelve null si la promesa falla (catch silencioso)", async () => {
    await expect(conTopeDe(Promise.reject(new Error("x")), 1000)).resolves.toBeNull();
  });

  it("devuelve null si la promesa cuelga y vence el tope", async () => {
    const eterna = new Promise<string>(() => undefined);
    await expect(conTopeDe(eterna, 20)).resolves.toBeNull();
  });
});
