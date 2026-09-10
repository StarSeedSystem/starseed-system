import { describe, it, expect } from "vitest";
import type { AppearanceConfig } from "../../../context/appearance-context";
import type { AccionUi } from "../ui-acciones";
import {
  MAX_BITACORA,
  aplicarAccion,
  deshacer,
  recortarBitacora,
  resumirCambio,
  type EntradaBitacora,
} from "../ui-aplicador";

/**
 * Fixture mínima pero realista de `AppearanceConfig`. Se castea porque la
 * interfaz real tiene muchas más secciones (secondary, buttons, widgets…) que
 * este módulo ni mira: aquí solo interesan las cuatro que toca la gramática.
 */
function configBase(): AppearanceConfig {
  return {
    typography: { fontFamily: "Inter", scale: 1, customFonts: [] },
    layout: {
      menuPosition: "left",
      menuStyle: "sidebar",
      menuBehavior: "sticky",
      iconStyle: "outline",
    },
    styling: {
      radius: 12,
      glassIntensity: 8,
      opacity: 0.8,
      borderWidth: 1,
      refraction: 0.2,
      chromaticAberration: 0,
      noiseOpacity: 0,
      glowIntensity: 0.3,
      hardShadows: false,
      uppercase: false,
      neonTicker: false,
      fluidity: 0.5,
      surfaceTension: 0.5,
      frostOpacity: 0.4,
      glassNoise: 0.1,
    },
    background: {
      type: "living",
      value: "nebulosa",
      blur: 0,
      animation: "none",
      overlayOpacity: 0.2,
      overlayColor: "black",
      scopes: {},
      living: {
        variant: "nebula",
        speed: 1,
        intensity: 0.6,
        colors: ["#00ffee", "#ff00aa"],
        autoCycleSec: 0,
      },
    },
  } as unknown as AppearanceConfig;
}

function accion(extra: Partial<AccionUi> = {}): AccionUi {
  return {
    tipo: "fondo",
    ambito: "cuenta",
    parche: { background: { value: "aurora" } },
    motivo: "porque estás leyendo de noche",
    actor: "personalidad:aurora",
    ...extra,
  };
}

describe("aplicarAccion + deshacer · ningún cambio es irreversible", () => {
  it("deshacer devuelve la config idéntica a la original (ámbito cuenta)", () => {
    const antes = configBase();
    const { siguiente, entrada } = aplicarAccion(antes, accion(), { ahora: 1000, id: "b1" });
    expect(siguiente).not.toEqual(antes);
    expect(deshacer(siguiente, entrada)).toStrictEqual(configBase());
    // Y no muta la config de entrada.
    expect(antes).toStrictEqual(configBase());
  });

  it("deshacer borra las claves que el parche creó de cero", () => {
    const antes = configBase();
    const a = accion({
      tipo: "preset",
      parche: { styling: { crystalPreset: "holographic" } },
    });
    const { siguiente, entrada } = aplicarAccion(antes, a, { ahora: 2000, id: "b2" });
    expect(siguiente.styling.crystalPreset).toBe("holographic");
    const vuelta = deshacer(siguiente, entrada);
    expect("crystalPreset" in vuelta.styling).toBe(false);
    expect(vuelta).toStrictEqual(configBase());
  });

  it("ámbito perfil escribe en scopes y no en la raíz, y también se deshace", () => {
    const antes = configBase();
    const a = accion({ ambito: "perfil", ambitoId: "p-7" });
    const { siguiente, entrada } = aplicarAccion(antes, a, { ahora: 3000, id: "b3" });
    expect(siguiente.background.value).toBe("nebulosa");
    expect(siguiente.background.scopes?.["perfil:p-7"]).toEqual({ value: "aurora" });
    expect(deshacer(siguiente, entrada)).toStrictEqual(configBase());
  });

  it("en ámbito página el fondo entra por la ruta, no por la raíz", () => {
    const a = accion({ ambito: "pagina", ambitoId: "/perfil/alex" });
    const { siguiente } = aplicarAccion(configBase(), a, { ahora: 4000, id: "b4" });
    expect(siguiente.background.scopes?.["pagina:/perfil/alex"]).toEqual({ value: "aurora" });
    expect(siguiente.background.value).toBe("nebulosa");
  });

  it("lo que no es fondo sigue yendo a la raíz aunque el ámbito sea perfil", () => {
    const a = accion({
      tipo: "apariencia",
      ambito: "perfil",
      ambitoId: "p-7",
      parche: { styling: { radius: 20 } },
    });
    const { siguiente, entrada } = aplicarAccion(configBase(), a, { ahora: 5000, id: "b5" });
    expect(siguiente.styling.radius).toBe(20);
    expect(siguiente.background.scopes).toEqual({});
    expect(deshacer(siguiente, entrada)).toStrictEqual(configBase());
  });

  it("los arrays se reemplazan enteros, nunca se concatenan", () => {
    const a = accion({
      tipo: "movimiento",
      parche: { background: { living: { colors: ["#ffffff"] } } },
    });
    const { siguiente, entrada } = aplicarAccion(configBase(), a, { ahora: 6000, id: "b6" });
    expect(siguiente.background.living?.colors).toEqual(["#ffffff"]);
    // El resto de `living` se conserva: la fusión es profunda, no un reemplazo.
    expect(siguiente.background.living?.variant).toBe("nebula");
    expect(deshacer(siguiente, entrada).background.living?.colors).toEqual([
      "#00ffee",
      "#ff00aa",
    ]);
  });
});

describe("resumirCambio · qué cambió de verdad", () => {
  it("dice «sin cambios» cuando no cambió nada", () => {
    expect(resumirCambio(configBase(), configBase())).toBe("sin cambios");
  });

  it("nombra las hojas distintas con su valor antiguo y el nuevo", () => {
    const antes = configBase();
    const despues = configBase();
    despues.background.value = "aurora";
    despues.styling.radius = 20;
    const frase = resumirCambio(antes, despues);
    expect(frase).toContain("fondo: nebulosa → aurora");
    expect(frase).toContain("radio: 12 → 20");
    expect(frase).toContain("; ");
  });

  it("una acción que no cambia nada se resume como tal en la bitácora", () => {
    const a = accion({ parche: { background: { value: "nebulosa" } } });
    const { entrada } = aplicarAccion(configBase(), a, { ahora: 7000, id: "b7" });
    expect(entrada.resumen).toBe("sin cambios");
    expect(entrada.inverso).toEqual({});
  });

  it("guarda el porqué y quién lo pidió", () => {
    const { entrada } = aplicarAccion(configBase(), accion(), { ahora: 8000, id: "b8" });
    expect(entrada).toMatchObject({
      id: "b8",
      at: 8000,
      actor: "personalidad:aurora",
      tipo: "fondo",
      ambito: "cuenta",
      motivo: "porque estás leyendo de noche",
    });
    expect(entrada.resumen).toContain("fondo: nebulosa → aurora");
  });
});

function entradaFalsa(at: number): EntradaBitacora {
  return {
    id: `e-${at}`,
    at,
    actor: "usuario",
    tipo: "apariencia",
    ambito: "cuenta",
    motivo: "prueba",
    resumen: "sin cambios",
    inverso: {},
  };
}

describe("recortarBitacora", () => {
  it("con 60 entradas deja 50, las más nuevas primero", () => {
    const bitacora = Array.from({ length: 60 }, (_, i) => entradaFalsa(i));
    const recortada = recortarBitacora(bitacora);
    expect(MAX_BITACORA).toBe(50);
    expect(recortada).toHaveLength(50);
    expect(recortada[0].at).toBe(59);
    expect(recortada[49].at).toBe(10);
  });

  it("no muta la bitácora original", () => {
    const bitacora = [entradaFalsa(1), entradaFalsa(3), entradaFalsa(2)];
    recortarBitacora(bitacora);
    expect(bitacora.map((e) => e.at)).toEqual([1, 3, 2]);
  });
});
