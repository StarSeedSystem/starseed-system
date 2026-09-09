import { describe, it, expect } from "vitest";
import type { AccionUi } from "../ui-acciones";
import {
  AMBITOS_POR_DEFECTO,
  NIVEL_POR_DEFECTO,
  CLAVE_PERMISOS_UI,
  decidirUi,
  guardarPermisos,
  leerPermisos,
  type PermisoUi,
} from "../ui-permisos";

function accion(parcial: Partial<AccionUi> = {}): AccionUi {
  return {
    tipo: "fondo",
    ambito: "perfil",
    ambitoId: "p-7",
    parche: { background: { value: "nebulosa-lenta" } },
    motivo: "porque estás leyendo de noche",
    actor: "personalidad:aurora",
    ...parcial,
  };
}

function permiso(parcial: Partial<PermisoUi> = {}): PermisoUi {
  return {
    actor: "personalidad:aurora",
    nivel: "aplicar",
    tipos: ["fondo"],
    ambitos: ["perfil"],
    ...parcial,
  };
}

const AHORA = 1_000_000;

/* localStorage mínimo para ejercitar el camino de persistencia en node. */
function haceLocalStorage() {
  const mapa = new Map<string, string>();
  return {
    getItem: (k: string) => (mapa.has(k) ? mapa.get(k) ?? null : null),
    setItem: (k: string, v: string) => {
      mapa.set(k, v);
    },
    removeItem: (k: string) => {
      mapa.delete(k);
    },
    clear: () => {
      mapa.clear();
    },
    key: (i: number) => Array.from(mapa.keys())[i] ?? null,
    get length() {
      return mapa.size;
    },
  };
}

const LS_PARCIAL: Partial<Window> = { localStorage: haceLocalStorage() };

describe("reparto de fábrica", () => {
  it("sin permisos un actor puede proponer, no aplicar", () => {
    const d = decidirUi([], accion(), AHORA);
    expect(d.permitido).toBe(true);
    expect(d.nivel).toBe("proponer");
    expect(d.motivo).toMatch(/puede proponer/); // nunca aplica solo
  });

  it("el nivel y los ámbitos por defecto son los prometidos", () => {
    expect(NIVEL_POR_DEFECTO).toBe("proponer");
    expect(AMBITOS_POR_DEFECTO).toContain("perfil");
    expect(AMBITOS_POR_DEFECTO).toContain("pagina");
    expect(AMBITOS_POR_DEFECTO).not.toContain("cuenta");
  });

  it("un permiso que caduca deja de aplicar y vuelve a proponer", () => {
    const vigente = permiso({ nivel: "aplicar", expiraEn: AHORA + 1 });
    const d1 = decidirUi([vigente], accion(), AHORA);
    expect(d1.nivel).toBe("aplicar");

    const caducado = permiso({ nivel: "aplicar", expiraEn: AHORA - 1 });
    const d2 = decidirUi([caducado], accion(), AHORA);
    expect(d2.nivel).toBe("proponer");
  });
});

describe("comodín y salvaguardas del exocórtex", () => {
  it("el comodín `*` concede al actor sin permiso propio", () => {
    const wild = permiso({ actor: "*", nivel: "aplicar", ambitos: ["perfil"] });
    const d = decidirUi([wild], accion(), AHORA);
    expect(d.permitido).toBe(true);
    expect(d.nivel).toBe("aplicar");
  });

  it("el comodín de tipo y ámbito incluye, y el ámbito cuenta nunca se aplica solo", () => {
    const p = permiso({ nivel: "aplicar", tipos: ["*"], ambitos: ["*"] });
    const d = decidirUi([p], accion({ ambito: "cuenta" }), AHORA);
    expect(d.nivel).toBe("proponer"); // cuenta NUNCA automático
    expect(d.motivo).toMatch(/cuenta/);
  });

  it("una acción destructiva baja de `aplicar` a `proponer`", () => {
    const p = permiso({ nivel: "aplicar" });
    const destructiva = accion({ ambito: "cuenta" });
    const d = decidirUi([p], destructiva, AHORA);
    expect(d.nivel).toBe("proponer");
    expect(d.motivo).toMatch(/destructivo/);
  });

  it("el nivel `nada` bloquea", () => {
    const p = permiso({ nivel: "nada" });
    const d = decidirUi([p], accion(), AHORA);
    expect(d.permitido).toBe(false);
    expect(d.nivel).toBe("nada");
  });

  it("fuera de los tipos cubiertos vuelve al nivel por defecto", () => {
    const p = permiso({ nivel: "aplicar", tipos: ["tipografia"] });
    const d = decidirUi([p], accion({ tipo: "fondo" }), AHORA);
    expect(d.nivel).toBe("proponer");
  });
});

describe("persistencia (SSR-safe)", () => {
  it("expone la clave versionada", () => {
    expect(CLAVE_PERMISOS_UI).toMatch(/ui-permisos\.v1$/);
  });

  it("sin window (SSR) lee vacío sin lanzar", () => {
    expect(leerPermisos()).toEqual([]);
    expect(() => guardarPermisos([permiso()])).not.toThrow();
  });

  it("guarda y relee el mismo conjunto", () => {
    const w = LS_PARCIAL as Window;
    (globalThis as { window?: Window }).window = w;
    expect(globalThis.window).toBe(w);
    const p = permiso();
    guardarPermisos([p]);
    const leido = leerPermisos();
    expect(leido).toHaveLength(1);
    expect(leido[0]).toMatchObject({ actor: p.actor, nivel: "aplicar" });
    guardarPermisos([]);
    expect(leerPermisos()).toEqual([]);
    delete (globalThis as { window?: Window }).window;
  });

  it("tolera un JSON corrupto o ajeno al vocabulario", () => {
    const w = LS_PARCIAL as Window;
    (globalThis as { window?: Window }).window = w;
    globalThis.window?.localStorage.setItem(CLAVE_PERMISOS_UI, "no-es-json{");
    expect(leerPermisos()).toEqual([]);
    globalThis.window?.localStorage.setItem(
      CLAVE_PERMISOS_UI,
      JSON.stringify([{ actor: "", nivel: "reinar", tipos: "x" }, 42, null]),
    );
    expect(leerPermisos()).toEqual([]);
    delete (globalThis as { window?: Window }).window;
  });
});