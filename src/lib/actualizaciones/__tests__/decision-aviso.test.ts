/**
 * (VER1107B) ¿Se abre «Hay una versión nueva»? La decisión pura, caso por caso.
 */
import { describe, expect, it } from "vitest";
import { decidirAviso, textoAlDia, textoPreparando } from "../decision-aviso";

const base = { medio: "escritorio" as const, instalada: "0.5.0", publicada: "v0.6.0", vistas: {} };

describe("decidirAviso", () => {
  it("el bug: la instalada era el build de la web → antes salía «más nueva»; ahora NADA", () => {
    const d = decidirAviso({ ...base, instalada: "mvq6sg7z-kt91hk", updater: { estado: "ok", disponible: null } });
    expect(d).toEqual({ tipo: "nada", motivo: "No se sabe la versión instalada de esta app." });
    expect(decidirAviso({ ...base, instalada: null }).tipo).toBe("nada");
  });

  it("publicada más nueva y el canal de la app la ofrece → ventana con la versión del canal", () => {
    expect(decidirAviso({ ...base, updater: { estado: "ok", disponible: "0.6.0" } })).toEqual({
      tipo: "ventana",
      version: "0.6.0",
      origen: "updater",
      apk: null,
    });
  });

  it("publicada más nueva pero el updater no tiene nada → «se está preparando», sin ventana", () => {
    const d = decidirAviso({ ...base, updater: { estado: "ok", disponible: null } });
    expect(d.tipo).toBe("preparando");
    if (d.tipo === "preparando") {
      expect(d.version).toBe("0.6.0");
      expect(d.texto).toBe(textoPreparando("0.6.0", "escritorio"));
    }
    // Un canal que ofrece algo igual o más viejo que lo instalado tampoco cuenta.
    expect(decidirAviso({ ...base, updater: { estado: "ok", disponible: "0.5.0" } }).tipo).toBe("preparando");
    expect(decidirAviso({ ...base, updater: { estado: "ok", disponible: "basura" } }).tipo).toBe("preparando");
  });

  it("app anterior sin buscar_actualizacion → se decide con la lista", () => {
    expect(decidirAviso({ ...base, updater: { estado: "sin-comando" } })).toEqual({ tipo: "ventana", version: "0.6.0", origen: "lista", apk: null });
  });

  it("el updater falla o no se pudo preguntar → nada (no se abre lo que no se puede confirmar)", () => {
    expect(decidirAviso({ ...base, updater: { estado: "error", motivo: "sin red" } })).toEqual({ tipo: "nada", motivo: "sin red" });
    expect(decidirAviso({ ...base, updater: null }).tipo).toBe("nada");
  });

  it("al día, ya vista o en un medio sin ventana → nada; «forzar» ignora «ya vista»", () => {
    expect(decidirAviso({ ...base, instalada: "0.6.0", updater: { estado: "ok", disponible: null } }).tipo).toBe("nada");
    const vista = { ...base, vistas: { "0.6.0": 1 }, updater: { estado: "ok" as const, disponible: "0.6.0" } };
    expect(decidirAviso(vista).tipo).toBe("nada");
    expect(decidirAviso({ ...vista, forzar: true }).tipo).toBe("ventana");
    for (const medio of ["web", "pwa", "ios"] as const) expect(decidirAviso({ ...base, medio }).tipo).toBe("nada");
  });

  it("Android: con el .apk de la misma firma → ventana; sin él → «se está preparando»", () => {
    expect(decidirAviso({ ...base, medio: "android", apk: "https://x/StarSeed-os-0.6.0.apk" })).toEqual({
      tipo: "ventana",
      version: "0.6.0",
      origen: "lista",
      apk: "https://x/StarSeed-os-0.6.0.apk",
    });
    const d = decidirAviso({ ...base, medio: "android", apk: null });
    expect(d.tipo).toBe("preparando");
    if (d.tipo === "preparando") expect(d.texto).toMatch(/preparando para Android/);
  });
});

describe("textoAlDia", () => {
  it("«Ya tienes la X.Y.Z», y si lo publicado es más nuevo, que aún se prepara", () => {
    expect(textoAlDia("0.5.0")).toBe("Ya tienes la 0.5.0.");
    expect(textoAlDia("v0.5.0", "0.5.0")).toBe("Ya tienes la 0.5.0.");
    expect(textoAlDia("0.5.0", "0.6.0")).toBe("Ya tienes la 0.5.0. La 0.6.0 aún se está preparando para este sistema: te avisaremos cuando esté lista.");
    expect(textoAlDia("mvq6sg7z-kt91hk", "0.6.0")).toBe("Ya tienes la última versión para este sistema.");
  });
});
