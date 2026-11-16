import { describe, it, expect, vi, afterEach } from "vitest";
import {
  conTope,
  normalizarPerfil,
  clasificarCarga,
  TOPE_CARGA_PERFIL_MS,
} from "../carga-perfil";

describe("conTope", () => {
  afterEach(() => vi.useRealTimers());

  it("resuelve el valor de la promesa si llega a tiempo", async () => {
    await expect(conTope(Promise.resolve("listo"), 100)).resolves.toBe("listo");
  });

  it("devuelve null si la promesa no responde antes del tope", async () => {
    vi.useFakeTimers();
    const colgada = new Promise<string>(() => undefined);
    const resultado = conTope(colgada, TOPE_CARGA_PERFIL_MS);
    vi.advanceTimersByTime(TOPE_CARGA_PERFIL_MS);
    await expect(resultado).resolves.toBeNull();
  });

  it("devuelve null si la promesa rechaza (no propaga el error)", async () => {
    await expect(
      conTope(Promise.reject(new Error("boom")), 100),
    ).resolves.toBeNull();
  });
});

describe("normalizarPerfil", () => {
  it("mapea una fila de profiles a los campos del formulario", () => {
    const perfil = normalizarPerfil({
      display_name: "Aria",
      handle: "aria",
      bio: "Semilla",
      avatar_url: "u.png",
      cover_url: "c.png",
      avatar_marco: { forma: "estrella" },
      avatar_3d: { url: "g.glb" },
    });
    expect(perfil).toEqual({
      nombre: "Aria",
      handle: "aria",
      bio: "Semilla",
      avatar: "u.png",
      portada: "c.png",
      marco: { forma: "estrella" },
      avatar3d: { url: "g.glb" },
    });
  });

  it("deja vacíos los campos ausentes o no textuales", () => {
    const perfil = normalizarPerfil({ display_name: 42, handle: null });
    expect(perfil).toEqual({
      nombre: "",
      handle: "",
      bio: "",
      avatar: "",
      portada: "",
      marco: null,
      avatar3d: null,
    });
  });

  it("sobre null o basura devuelve un perfil vacío (sin lanzar)", () => {
    expect(normalizarPerfil(null).nombre).toBe("");
    expect(normalizarPerfil(undefined).handle).toBe("");
    expect(normalizarPerfil("basura").bio).toBe("");
  });

  it("solo acepta el avatar 3D cuando trae url", () => {
    expect(normalizarPerfil({ avatar_3d: { forma: "orbe" } }).avatar3d).toBeNull();
    expect(normalizarPerfil({ avatar_3d: { url: "x.glb" } }).avatar3d).toEqual({ url: "x.glb" });
  });
});

describe("clasificarCarga", () => {
  it("con error de la consulta devuelve error y no lanza", () => {
    const r = clasificarCarga(null, { message: "RLS" });
    expect(r.estado).toBe("error");
  });

  it("sin fila devuelve vacío (perfil nuevo, se edita desde cero)", () => {
    expect(clasificarCarga(null, null).estado).toBe("vacio");
  });

  it("con fila devuelve cargado con el perfil normalizado", () => {
    const r = clasificarCarga({ handle: "sol", display_name: "Sol" }, null);
    expect(r.estado).toBe("cargado");
    if (r.estado === "cargado") expect(r.perfil.handle).toBe("sol");
  });
});
