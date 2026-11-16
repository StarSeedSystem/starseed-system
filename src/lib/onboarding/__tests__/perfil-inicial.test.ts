/**
 * El perfil de la ventana del rito (el paso «Tu perfil en la red»).
 *
 * Módulo PURO: la fila de `profiles` entra por parámetro y sale el perfil
 * normalizado; de un perfil salen los campos del perfil PÚBLICO (`os_profiles`).
 * Sin red y sin disco: aquí no hay cliente Supabase, la ventana del rito usa
 * el de la capa de datos (@/lib/onboarding/onboarding).
 */
import { describe, expect, it } from "vitest";
import { camposPerfilPublico, perfilDesdeFila } from "../perfil-inicial";

describe("perfilDesdeFila", () => {
  it("trae los campos del perfil tal cual están guardados", () => {
    const p = perfilDesdeFila({
      handle: "alma",
      display_name: "Alma",
      bio: "Hola, red.",
      avatar_url: "https://x/a.png",
      cover_url: "https://x/c.png",
    });
    expect(p.handle).toBe("alma");
    expect(p.display_name).toBe("Alma");
    expect(p.bio).toBe("Hola, red.");
    expect(p.avatar_url).toBe("https://x/a.png");
    expect(p.cover_url).toBe("https://x/c.png");
  });

  it("una fila vacía o con nulos deja el perfil en blanco (nunca undefined)", () => {
    const p = perfilDesdeFila({ handle: null, display_name: undefined, bio: null });
    expect(p.handle).toBe("");
    expect(p.display_name).toBe("");
    expect(p.bio).toBe("");
    expect(p.avatar_url).toBe("");
    expect(p.cover_url).toBe("");
  });

  it("conserva el marco y el avatar 3D, e ignora lo que no es un objeto", () => {
    const p = perfilDesdeFila({
      avatar_marco: { forma: "estrella", x: 1 },
      avatar_3d: { url: "https://x/m.glb" },
    });
    expect(p.avatar_marco).toEqual({ forma: "estrella", x: 1 });
    expect(p.avatar_3d).toEqual({ url: "https://x/m.glb" });
    const roto = perfilDesdeFila({ avatar_marco: "estrella", avatar_3d: 7 });
    expect(roto.avatar_marco).toBeUndefined();
    expect(roto.avatar_3d).toBeUndefined();
  });
});

describe("camposPerfilPublico", () => {
  it("manda al perfil público lo que tiene valor, con el @handle como nombre público", () => {
    const campos = camposPerfilPublico({
      handle: "alma",
      display_name: "Alma",
      bio: "Hola, red.",
      avatar_url: "https://x/a.png",
      cover_url: "https://x/c.png",
    });
    expect(campos.handle).toBe("alma");
    expect(campos.username).toBe("alma");
    expect(campos.display_name).toBe("Alma");
    expect(campos.bio).toBe("Hola, red.");
    expect(campos.avatar_url).toBe("https://x/a.png");
    expect(campos.cover_url).toBe("https://x/c.png");
  });

  it("lo vacío NO se manda: no se borra lo que ya está publicado en la red", () => {
    expect(camposPerfilPublico({ handle: "", display_name: "", bio: "", avatar_url: "", cover_url: "" })).toEqual({});
  });

  it("el avatar 3D se limpia con null y el marco se manda cuando hay", () => {
    expect(camposPerfilPublico({ avatar_3d: null }).avatar_3d).toBeNull();
    expect("avatar_3d" in camposPerfilPublico({})).toBe(false);
    expect(camposPerfilPublico({ avatar_marco: { forma: "estrella" } }).avatar_marco).toEqual({ forma: "estrella" });
  });
});
