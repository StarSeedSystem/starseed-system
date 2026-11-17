import { describe, it, expect } from "vitest";
import {
  camposPerfilPrivado,
  camposPerfilPublico,
  type DatosPerfilOpcional,
} from "@/lib/onboarding/onboarding";

describe("camposPerfilPrivado", () => {
  it("devuelve vacío cuando no hay datos", () => {
    expect(camposPerfilPrivado({})).toEqual({});
  });

  it("solo incluye los valores presentes", () => {
    const d: DatosPerfilOpcional = { avatar_url: "https://x/a.png", bio: "hola" };
    expect(camposPerfilPrivado(d)).toEqual({ avatar_url: "https://x/a.png", bio: "hola" });
  });

  it("incluye marco y avatar 3D aunque sean null (se marcan definidos)", () => {
    const d: DatosPerfilOpcional = { avatar_marco: null, avatar_3d: null };
    expect(camposPerfilPrivado(d)).toEqual({ avatar_marco: null, avatar_3d: null });
  });

  it("no mezcla identidad (handle/display_name) en el perfil privado", () => {
    const d: DatosPerfilOpcional = { handle: "ana", display_name: "Ana" };
    expect(camposPerfilPrivado(d)).toEqual({});
  });
});

describe("camposPerfilPublico", () => {
  it("devuelve vacío cuando no hay datos", () => {
    expect(camposPerfilPublico({})).toEqual({});
  });

  it("espeja los campos privados más la identidad", () => {
    const d: DatosPerfilOpcional = {
      handle: "ana",
      display_name: "Ana",
      avatar_url: "https://x/a.png",
      cover_url: "https://x/c.png",
      bio: "hola",
      avatar_marco: { forma: "estrella" },
      avatar_3d: { url: "https://x/3d.glb" },
    };
    expect(camposPerfilPublico(d)).toEqual({
      handle: "ana",
      display_name: "Ana",
      avatar_url: "https://x/a.png",
      cover_url: "https://x/c.png",
      bio: "hola",
      avatar_marco: { forma: "estrella" },
      avatar_3d: { url: "https://x/3d.glb" },
    });
  });

  it("omite identidad vacía o en blanco", () => {
    const d: DatosPerfilOpcional = { handle: "  ", display_name: "" };
    expect(camposPerfilPublico(d)).toEqual({});
  });
});
