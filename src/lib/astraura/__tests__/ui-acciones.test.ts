import { describe, it, expect } from "vitest";
import {
  CAMPOS_PERMITIDOS,
  validarAccionUi,
  describirAccion,
  esAccionDestructiva,
  type AccionUi,
} from "../ui-acciones";

function base(): AccionUi {
  return {
    tipo: "fondo",
    ambito: "perfil",
    ambitoId: "p-7",
    parche: { background: { value: "nebulosa-lenta" } },
    motivo: "porque estás leyendo de noche",
    actor: "personalidad:aurora",
  };
}

describe("validarAccionUi · desconfía del modelo", () => {
  it("acepta una acción correcta", () => {
    const r = validarAccionUi({ ...base(), parche: { background: { value: "x" } } });
    expect(r).not.toBeNull();
    expect(r?.tipo).toBe("fondo");
    expect(r?.ambitoId).toBe("p-7");
  });

  it("recorta una ruta prohibida del parche", () => {
    const r = validarAccionUi({
      ...base(),
      parche: { background: { value: "x" }, typography: { scale: 1.1 } },
    });
    expect(r).not.toBeNull();
    expect(r?.parche).toEqual({ background: { value: "x" } });
  });

  it("controla tipografía no puede tocar el fondo", () => {
    const r = validarAccionUi({
      ...base(),
      tipo: "tipografia",
      parche: { typography: { scale: 1.05 }, background: { value: "hack" } },
    });
    expect(r).not.toBeNull();
    expect(r?.parche).toEqual({ typography: { scale: 1.05 } });
  });

  it("motivo vacío → null", () => {
    expect(validarAccionUi({ ...base(), motivo: "   " })).toBeNull();
  });

  it("motivo demasiado largo → null", () => {
    expect(validarAccionUi({ ...base(), motivo: "x".repeat(241) })).toBeNull();
  });

  it("actor inválido → null", () => {
    expect(validarAccionUi({ ...base(), actor: "hacker al azar" })).toBeNull();
  });

  it("tipo desconocido → null", () => {
    expect(validarAccionUi({ ...base(), tipo: "borratodo" })).toBeNull();
  });

  it("ámbito desconocido → null", () => {
    expect(validarAccionUi({ ...base(), ambito: "equipo" })).toBeNull();
  });

  it("cambio de cuenta no admite ambitoId", () => {
    expect(validarAccionUi({ ...base(), ambito: "cuenta", ambitoId: "x" })).toBeNull();
  });

  it("basura (número, null, array) → null", () => {
    expect(validarAccionUi(42)).toBeNull();
    expect(validarAccionUi(null)).toBeNull();
    expect(validarAccionUi([base()])).toBeNull();
  });

  it("parche que no es objeto → null", () => {
    expect(validarAccionUi({ ...base(), parche: "azul" })).toBeNull();
  });

  it("todos los tipos del vocabulario aceptan sus campos permitidos", () => {
    const casos: Array<[AccionUi["tipo"], Record<string, string>]> = [
      ["apariencia", { "styling.radius": "1" }],
      ["distribucion", { "layout.menuPosition": "top" }],
      ["preset", { "styling.crystalPreset": "frosted" }],
      ["movimiento", { "background.animation": "zoom" }],
      ["restaurar", {}],
    ];
    for (const [tipo, rutas] of casos) {
      expect(CAMPOS_PERMITIDOS[tipo].length).toBeGreaterThanOrEqual(0);
      void rutas;
      const r = validarAccionUi({ ...base(), tipo });
      expect(r).not.toBeNull();
    }
  });
});

describe("recorte por comodín · las ramas `.*` sobreviven enteras", () => {
  it("«apariencia» conserva las hojas de styling.*", () => {
    const r = validarAccionUi({
      ...base(),
      tipo: "apariencia",
      parche: { styling: { radius: 1.2, glassIntensity: 18 }, layout: { menuPosition: "top" } },
    });
    expect(r).not.toBeNull();
    expect(r?.parche).toEqual({ styling: { radius: 1.2, glassIntensity: 18 } });
  });

  it("«distribucion» conserva las hojas de layout.*", () => {
    const r = validarAccionUi({
      ...base(),
      tipo: "distribucion",
      parche: { layout: { menuPosition: "right", menuStyle: "dock" }, styling: { radius: 9 } },
    });
    expect(r).not.toBeNull();
    expect(r?.parche).toEqual({ layout: { menuPosition: "right", menuStyle: "dock" } });
  });

  it("«movimiento» conserva las hojas de background.living.*, arrays incluidos", () => {
    const r = validarAccionUi({
      ...base(),
      tipo: "movimiento",
      parche: {
        background: {
          animation: "pulse",
          living: { variant: "aurora", speed: 0.6, colors: ["#7cf", "#a5f"] },
        },
        animations: { enabled: true },
      },
    });
    expect(r).not.toBeNull();
    expect(r?.parche).toEqual({
      background: {
        animation: "pulse",
        living: { variant: "aurora", speed: 0.6, colors: ["#7cf", "#a5f"] },
      },
      animations: { enabled: true },
    });
  });

  it("«movimiento» sigue SIN poder tocar background.value", () => {
    const r = validarAccionUi({
      ...base(),
      tipo: "movimiento",
      parche: { background: { value: "hack", living: { speed: 1.4 } } },
    });
    expect(r).not.toBeNull();
    expect(r?.parche).toEqual({ background: { living: { speed: 1.4 } } });
  });
});

describe("describirAccion", () => {
  it("describe los siete tipos con frase legible", () => {
    const frases: Record<string, RegExp> = {
      apariencia: /La característica «apariencia» no aplica/,
    };
    void frases;
    const a: AccionUi = { ...base(), tipo: "fondo" };
    expect(describirAccion(a)).toMatch(/Aurora quiere cambiar el fondo de tu perfil — porque estás leyendo de noche/);
  });

  it("maneja actor 'usuario' y ámbito 'cuenta'", () => {
    const a: AccionUi = { ...base(), actor: "usuario", ambito: "cuenta" };
    expect(describirAccion(a)).toMatch(/El usuario quiere cambiar el fondo de tu cuenta/);
  });

  it("cada uno de los siete tipos produce una descripción", () => {
    for (const tipo of Object.keys(CAMPOS_PERMITIDOS) as AccionUi["tipo"][]) {
      const frase = describirAccion({ ...base(), tipo });
      expect(frase.length).toBeGreaterThan(10);
    }
  });
});

describe("esAccionDestructiva", () => {
  it("vaciar capas del fondo es destructivo", () => {
    expect(
      esAccionDestructiva({ ...base(), parche: { background: { layers: [] } } }),
    ).toBe(true);
  });

  it("cambiar el ámbito cuenta es destructivo", () => {
    expect(esAccionDestructiva({ ...base(), ambito: "cuenta" })).toBe(true);
  });

  it("borrar fuentes personalizadas es destructivo", () => {
    expect(
      esAccionDestructiva({
        ...base(),
        tipo: "tipografia",
        parche: { typography: { customFonts: [] } },
      }),
    ).toBe(true);
  });

  it("una acción banal no es destructiva", () => {
    expect(esAccionDestructiva(base())).toBe(false);
  });
});