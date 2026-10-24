import { describe, expect, it } from "vitest";
import {
  ESPACIOS_3D,
  espaciosParaPlan,
  normalizarPreferenciaEspacios,
  permiteEspacioHf,
  permiteFotoDePersonas,
  resolverPermisoEspacios,
} from "@/lib/espacios/permiso-espacios";

describe("permiso de Spaces: por defecto apagado y una sola pregunta", () => {
  it("una cuenta normal empieza apagada y con la pregunta pendiente", () => {
    expect(resolverPermisoEspacios()).toEqual({
      permitido: false,
      preguntado: false,
      preguntarAhora: true,
      origen: "defecto",
    });
  });

  it("la cuenta de administración del OS viene encendida por la decisión de Alex", () => {
    expect(resolverPermisoEspacios({ esCuentaDeAdministracion: true })).toMatchObject({
      permitido: true,
      preguntado: true,
      preguntarAhora: false,
      origen: "administracion",
    });
  });

  it("lo guardado manda: si la administración lo apaga, sigue apagado y no se pregunta", () => {
    const r = resolverPermisoEspacios({ guardada: { permitido: false, preguntado: true }, esCuentaDeAdministracion: true });
    expect(r).toMatchObject({ permitido: false, preguntarAhora: false, origen: "guardado" });
  });

  it("si la persona ya aceptó, se respeta aunque no sea administración", () => {
    expect(resolverPermisoEspacios({ guardada: { permitido: true, preguntado: true } })).toMatchObject({
      permitido: true,
      preguntarAhora: false,
      origen: "guardado",
    });
  });
});

describe("normalización de lo guardado", () => {
  it("acepta el objeto actual y el booleano heredado", () => {
    expect(normalizarPreferenciaEspacios({ permitido: true, preguntado: true })).toEqual({ permitido: true, preguntado: true });
    expect(normalizarPreferenciaEspacios({ permitido: false })).toEqual({ permitido: false, preguntado: true });
    expect(normalizarPreferenciaEspacios(true)).toEqual({ permitido: true, preguntado: true });
  });

  it("lo roto o desconocido cuenta como nunca preguntado (sin inventar un sí)", () => {
    expect(normalizarPreferenciaEspacios(null)).toBeNull();
    expect(normalizarPreferenciaEspacios({ permitido: "sí" })).toBeNull();
    expect(normalizarPreferenciaEspacios(["true"])).toBeNull();
    expect(resolverPermisoEspacios({ guardada: { permitido: 1 } }).permitido).toBe(false);
  });
});

describe("lo que come el motor 3D y el plan de imágenes", () => {
  it("permiteEspacioHf es el booleano de capacidadesDe", () => {
    expect(permiteEspacioHf(true)).toBe(true);
    expect(permiteEspacioHf({ permitido: true })).toBe(true);
    expect(permiteEspacioHf({ permitido: false })).toBe(false);
    expect(permiteEspacioHf(null)).toBe(false);
    expect(permiteEspacioHf(undefined)).toBe(false);
  });

  it("sin permiso no hay lista de espacios; con permiso lleva los ids del catálogo", () => {
    expect(espaciosParaPlan(false)).toEqual([]);
    const ids = espaciosParaPlan({ permitido: true });
    expect(ids).toContain("flux1-schnell");
    expect(ids).toContain("qwen-image");
    expect(ids).not.toContain("qwen-image-2.1");
    expect(ids.every((id) => id !== "")).toBe(true);
  });

  it("respeta un catálogo ajeno (pruebas sin tocar los datos reales)", () => {
    const catalogo = [
      { id: "con-space", espacio: "autor/space" },
      { id: "sin-space" },
    ];
    expect(espaciosParaPlan(true, catalogo)).toEqual(["con-space"]);
    expect(espaciosParaPlan({ permitido: false }, catalogo)).toEqual([]);
  });

  it("los dos Spaces de 3D de la decisión siguen siendo Pixal3D y TRELLIS.2", () => {
    expect(ESPACIOS_3D.map((e) => e.id)).toEqual(["TencentARC/Pixal3D", "microsoft/TRELLIS.2"]);
  });
});

describe("fotos de personas: doble consentimiento", () => {
  it("hacen falta el permiso de la cuenta Y el consentimiento de esa imagen", () => {
    expect(permiteFotoDePersonas(true, true)).toBe(true);
    expect(permiteFotoDePersonas(true, false)).toBe(false);
    expect(permiteFotoDePersonas(false, true)).toBe(false);
    expect(permiteFotoDePersonas({ permitido: false }, true)).toBe(false);
  });
});
