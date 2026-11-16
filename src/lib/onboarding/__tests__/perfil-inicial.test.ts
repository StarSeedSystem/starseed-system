/**
 * PERFIL INICIAL (Adenda 194) — la ventana de perfil inicial NO abre su propio
 * cliente Supabase: delega en la capa de datos. Aquí se cubre la costura PURA
 * (qué se guarda a partir del formulario) y se vigila que el cliente
 * duplicado no vuelva a colarse en el componente.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ERROR_HANDLE_INVALIDO,
  planearGuardadoPerfilInicial,
  type EstadoPerfilInicial,
} from "@/lib/onboarding/perfil-inicial";
import { MARCO_POR_DEFECTO } from "@/lib/profile/marco-foto";
import type { Avatar3D } from "@/components/profile/avatar-3d";

const VENTANA = path.join(
  __dirname, "..", "..", "..", "components", "onboarding", "ventana-perfil-inicial.tsx",
);

function estado(parcial: Partial<EstadoPerfilInicial> = {}): EstadoPerfilInicial {
  return {
    nombre: "Alex Bordón",
    handle: "alex",
    bio: "Construyendo una red.",
    avatar: "",
    portada: "",
    marco: MARCO_POR_DEFECTO,
    avatar3d: null,
    ...parcial,
  };
}

describe("planearGuardadoPerfilInicial · identidad", () => {
  it("reclama la identidad con el nombre y el @handle normalizados", () => {
    const plan = planearGuardadoPerfilInicial(estado({ handle: "  Alex_1  " }));
    expect(plan.accion).toBe("guardar");
    if (plan.accion !== "guardar") return;
    expect(plan.identidad).toEqual({ fullName: "Alex Bordón", handle: "alex_1" });
  });

  it("un @handle con formato inválido detiene el guardado con un aviso claro", () => {
    const plan = planearGuardadoPerfilInicial(estado({ handle: "ab" }));
    expect(plan).toEqual({ accion: "error", error: ERROR_HANDLE_INVALIDO });
  });

  it("sin @handle no se reclama identidad, pero los opcionales se guardan igual", () => {
    const plan = planearGuardadoPerfilInicial(estado({ handle: "", avatar: "https://x/a.png" }));
    expect(plan.accion).toBe("guardar");
    if (plan.accion !== "guardar") return;
    expect(plan.identidad).toBeNull();
    expect(plan.opcionales.avatar_url).toBe("https://x/a.png");
  });

  it("sin nombre no se reclama identidad: el @handle solo no basta", () => {
    const plan = planearGuardadoPerfilInicial(estado({ nombre: "   " }));
    expect(plan.accion).toBe("guardar");
    if (plan.accion !== "guardar") return;
    expect(plan.identidad).toBeNull();
  });
});

describe("planearGuardadoPerfilInicial · campos opcionales", () => {
  it("un campo vacío no se escribe: no borra lo que ya había", () => {
    const plan = planearGuardadoPerfilInicial(estado({ avatar: "", portada: "", bio: "  " }));
    if (plan.accion !== "guardar") throw new Error("el plan debe ser de guardado");
    expect(plan.opcionales).not.toHaveProperty("avatar_url");
    expect(plan.opcionales).not.toHaveProperty("cover_url");
    expect(plan.opcionales).not.toHaveProperty("bio");
  });

  it("el avatar 3D se guarda con su url y, sin ella, se limpia", () => {
    const conUrl = planearGuardadoPerfilInicial(
      estado({ avatar3d: { url: "https://x/modelo.glb" } as unknown as Avatar3D }),
    );
    if (conUrl.accion !== "guardar") throw new Error("el plan debe ser de guardado");
    expect(conUrl.opcionales.avatar_3d).toMatchObject({ url: "https://x/modelo.glb" });
    const sinUrl = planearGuardadoPerfilInicial(estado({ avatar3d: null }));
    if (sinUrl.accion !== "guardar") throw new Error("el plan debe ser de guardado");
    expect(sinUrl.opcionales.avatar_3d).toBeNull();
  });

  it("el marco se guarda como copia: el formulario no se toca", () => {
    const base = estado();
    const plan = planearGuardadoPerfilInicial(base);
    if (plan.accion !== "guardar") throw new Error("el plan debe ser de guardado");
    expect(plan.opcionales.avatar_marco).toEqual(MARCO_POR_DEFECTO);
    expect(plan.opcionales.avatar_marco).not.toBe(base.marco);
  });
});

describe("la ventana de perfil inicial no duplica el cliente Supabase", () => {
  const fuente = readFileSync(VENTANA, "utf8");

  it("el componente NO abre su propio cliente de Supabase", () => {
    expect(fuente).not.toContain("@/utils/supabase/client");
  });

  it("el componente delega en la capa de datos del perfil inicial", () => {
    expect(fuente).toContain("@/lib/onboarding/perfil-inicial");
  });
});
