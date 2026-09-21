import { describe, it, expect } from "vitest";
import {
  avatarPersonalidadPorDefecto,
  avatarDePersonalidad,
  avatarResolvableDe,
  AVATARES_PERSONALIDAD_KEY,
  AVATAR_PERSONALIDAD_EVENT,
} from "@/lib/aurora/persona-avatar-vivo";

describe("persona-avatar-vivo", () => {
  it("genera la configuración por defecto correcta para una personalidad", () => {
    const config = avatarPersonalidadPorDefecto("preset-aurora");
    expect(config.personalidadId).toBe("preset-aurora");
    expect(config.fuente.tipo).toBe("procedural");
    expect(config.movimiento.automatico).toBe(true);
    expect(config.movimiento.energia).toBe(0.5);
    expect(config.movimiento.expresividad).toBe(0.5);
    expect(config.movimiento.nivel).toBe("auto");
    expect(config.acompanante.mostrar).toBe(false);
    expect(config.acompanante.esquina).toBe("inferior-derecha");
    expect(config.acompanante.tamano).toBe(96);
    expect(config.acompanante.opacidad).toBe(1);
  });

  it("devuelve la configuración por defecto si la personalidad no tiene datos guardados", () => {
    const config = avatarDePersonalidad("preset-incoherente-inexistente");
    expect(config.personalidadId).toBe("preset-incoherente-inexistente");
    expect(config.fuente.tipo).toBe("procedural");
  });

  it("expone las constantes del evento y clave de almacenamiento", () => {
    expect(AVATARES_PERSONALIDAD_KEY).toBe("starseed.avatares.personalidad.v1");
    expect(AVATAR_PERSONALIDAD_EVENT).toBe("starseed:avatar-personalidad");
  });

  it("resuelve perfil y configuración para una personalidad válida", () => {
    const res = avatarResolvableDe("preset-aurora");
    expect(res).not.toBeNull();
    if (res) {
      expect(res.perfil.id).toBe("preset-aurora");
      expect(res.config.personalidadId).toBe("preset-aurora");
    }
  });
});
