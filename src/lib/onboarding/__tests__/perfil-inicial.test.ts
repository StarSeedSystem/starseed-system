/**
 * IMG-profunda · Ventana de perfil inicial del rito — lógica pura.
 *
 * La ventana (src/components/onboarding/ventana-perfil-inicial.tsx) ya no habla
 * con Supabase: lo hace la capa de datos (src/lib/onboarding/onboarding.ts).
 * Lo que queda en el componente son conversiones puras, y esto las fija:
 * perfilDesdeFila (fila → formulario), payloadPerfilInicial (formulario → UN
 * payload para el perfil privado y su espejo público) y normalizarHandle.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARCO_POR_DEFECTO, type Marco } from "@/lib/profile/marco-foto";
import type { Avatar3D } from "@/components/profile/avatar-3d";
import { normalizarHandle, payloadPerfilInicial, perfilDesdeFila } from "../perfil-inicial";

const RAIZ = join(__dirname, "..", "..", "..", "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf-8");

/** Un avatar 3D completo, como lo guarda el editor. */
const avatar3d = (url: string): Avatar3D => ({
  url,
  posicion: { x: 0, y: 0, z: 0 },
  rotacion: { x: 0, y: 0, z: 0 },
  escala: 1, animacion: "", autoRotar: true, exposicion: 1, sombra: 0.6,
  angulo: { theta: 0, phi: 75 }, distancia: 105, fov: 30,
});

describe("perfilDesdeFila", () => {
  it("traduce la fila de `profiles` al estado del formulario", () => {
    const p = perfilDesdeFila({
      handle: "ana", display_name: "Ana Ruiz", bio: "Hola",
      avatar_url: "https://x/a.png", cover_url: "https://x/c.png",
      avatar_marco: { forma: "estrella", x: 1, y: 2, escala: 1, borde: 3 },
      avatar_3d: avatar3d("https://x/a.glb"),
    });
    expect(p.nombre).toBe("Ana Ruiz");
    expect(p.handle).toBe("ana");
    expect(p.bio).toBe("Hola");
    expect(p.avatar).toBe("https://x/a.png");
    expect(p.portada).toBe("https://x/c.png");
    expect(p.marco.forma).toBe("estrella");
    expect(p.avatar3d?.url).toBe("https://x/a.glb");
  });

  it("sin fila (o con campos vacíos) deja el formulario limpio y el marco por defecto", () => {
    for (const fila of [null, undefined, {}]) {
      const p = perfilDesdeFila(fila);
      expect(p.nombre).toBe("");
      expect(p.handle).toBe("");
      expect(p.bio).toBe("");
      expect(p.avatar).toBe("");
      expect(p.portada).toBe("");
      expect(p.avatar3d).toBeNull();
      expect(p.marco).toEqual(MARCO_POR_DEFECTO);
    }
  });

  it("un marco guardado incompleto se completa con los valores por defecto", () => {
    const p = perfilDesdeFila({ avatar_marco: { forma: "hexagono" } as unknown as Marco });
    expect(p.marco.forma).toBe("hexagono");
    expect(p.marco.borde).toBe(MARCO_POR_DEFECTO.borde);
  });
});

describe("payloadPerfilInicial", () => {
  it("un solo payload sirve para el perfil privado y el espejo público", () => {
    const payload = payloadPerfilInicial({
      nombre: "Ana Ruiz", handle: "ana", bio: "Hola",
      avatar: "https://x/a.png", portada: "https://x/c.png",
      marco: MARCO_POR_DEFECTO, avatar3d: avatar3d("https://x/a.glb"),
    });
    expect(payload).toEqual({
      avatar_url: "https://x/a.png",
      cover_url: "https://x/c.png",
      bio: "Hola",
      avatar_marco: expect.any(Object),
      avatar_3d: expect.objectContaining({ url: "https://x/a.glb" }),
    });
  });

  it("lo vacío NO se manda (no se borra lo que ya estaba guardado)", () => {
    const payload = payloadPerfilInicial({
      nombre: "Ana Ruiz", handle: "ana", bio: "", avatar: "", portada: "",
      marco: MARCO_POR_DEFECTO, avatar3d: null,
    });
    expect(payload.avatar_url).toBeUndefined();
    expect(payload.cover_url).toBeUndefined();
    expect(payload.bio).toBeUndefined();
    expect(payload.avatar_3d).toBeNull();
  });
});

describe("normalizarHandle", () => {
  it("minúsculas y solo a-z, 0-9 y _", () => {
    expect(normalizarHandle("  Ana_Ruiz 2 ")).toBe("ana_ruiz2");
    expect(normalizarHandle("ana-ruiz")).toBe("anaruiz");
    expect(normalizarHandle("Ánã")).toBe("n");
  });
});

/**
 * Guardia: la ventana de perfil NO abre su propio cliente de Supabase. Antes
 * lo abría dos veces (una para leer y otra para escribir el perfil público).
 * Con la base habla la capa de datos, y solo ella.
 */
describe("la ventana de perfil no duplica el cliente de Supabase", () => {
  const ventana = "src/components/onboarding/ventana-perfil-inicial.tsx";

  it("no importa ni llama a createClient, y delega en la capa de datos", () => {
    const src = leer(ventana);
    expect(src).not.toMatch(/createClient/);
    expect(src).not.toMatch(/@\/utils\/supabase\/client/);
    expect(src).toMatch(/leerPerfilPropio\(/);
    expect(src).toMatch(/guardarPerfilInicial\(/);
    expect(src).toMatch(/payloadPerfilInicial\(/);
  });
});
