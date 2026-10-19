import { describe, it, expect } from "vitest";
import { planLayaLocal } from "../laya-navegador";
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

// Helper to create a base PerfilMedio with default values
function basePerfilMedio(): PerfilMedio {
  return {
    // base: PerfilHardware
    base: {
      nivel: "pleno",
      nucleos: 4,
      ramGb: 8, // 8 GB RAM
      arq: "x86_64",
      plataforma: "web", // will be overridden
      bateria: false,
      conexion: "rapida",
    },
    plataforma: "web",
    webgpu: { disponible: false, maxBufferMb: null },
    wasm: { disponible: false, simd: false, hilos: false },
    almacenamiento: {
      cuotaMb: null,
      usoMb: null,
      libreMb: null,
      persistente: false,
    },
    bateria: { nivel: null, cargando: null, baja: false },
    ramLibreMb: null,
    saveData: false,
    tipoConexion: null,
    visible: true,
  };
}

describe("planLayaLocal", () => {
  it("devuelve cargar false para visita web", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "web";
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(false);
    expect(resultado.modelo).toBeNull();
    expect(resultado.motivo).toContain("visita web");
  });

  it("devuelve cargar false por batería < 20% y no cargando", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "pwa"; // any platform except web
    perfil.bateria = { nivel: 0.1, cargando: false, baja: true };
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(false);
    expect(resultado.modelo).toBeNull();
    expect(resultado.motivo).toContain("2.º plano");
    expect(resultado.motivo).toContain("batería < 20 %");
  });

  it("devuelve cargar false por pestaña oculta", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "pwa";
    perfil.visible = false;
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(false);
    expect(resultado.modelo).toBeNull();
    expect(resultado.motivo).toContain("2.º plano");
    expect(resultado.motivo).toContain("pestaña oculta");
  });

  it("devuelve cargar false por saveData activo", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "pwa";
    perfil.saveData = true;
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(false);
    expect(resultado.modelo).toBeNull();
    expect(resultado.motivo).toContain("2.º plano");
    expect(resultado.motivo).toContain("saveData activo");
  });

  it("devuelve cargar true para PWA con WebGPU, almacenamiento y memoria suficientes", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "pwa";
    perfil.webgpu = { disponible: true, maxBufferMb: 100 }; // any positive
    perfil.almacenamiento = {
      cuotaMb: 4096, // 4 GB quota
      usoMb: 0,
      libreMb: 2048, // exactly 2 GB free
      persistente: true,
    };
    perfil.base.ramGb = 4; // 4 GB RAM
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(true);
    expect(resultado.modelo).toBe("multilingual-int8");
    expect(resultado.motivo).toContain("PWA cumple requisitos");
  });

  it("devuelve cargar false para PWA sin WebGPU", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "pwa";
    perfil.webgpu = { disponible: false, maxBufferMb: null };
    perfil.almacenamiento = {
      cuotaMb: 4096,
      usoMb: 0,
      libreMb: 2048,
      persistente: true,
    };
    perfil.base.ramGb = 4;
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(false);
    expect(resultado.modelo).toBeNull();
    expect(resultado.motivo).toContain("PWA no cumple requisitos");
  });

  it("devuelve cargar false para PWA con almacenamiento insuficiente", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "pwa";
    perfil.webgpu = { disponible: true, maxBufferMb: 100 };
    perfil.almacenamiento = {
      cuotaMb: 4096,
      usoMb: 0,
      libreMb: 1024, // only 1 GB free
      persistente: true,
    };
    perfil.base.ramGb = 4;
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(false);
    expect(resultado.modelo).toBeNull();
    expect(resultado.motivo).toContain("PWA no cumple requisitos");
  });

  it("devuelve cargar false para PWA con memoria insuficiente", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "pwa";
    perfil.webgpu = { disponible: true, maxBufferMb: 100 };
    perfil.almacenamiento = {
      cuotaMb: 4096,
      usoMb: 0,
      libreMb: 2048,
      persistente: true,
    };
    perfil.base.ramGb = 2; // only 2 GB RAM
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(false);
    expect(resultado.modelo).toBeNull();
    expect(resultado.motivo).toContain("PWA no cumple requisitos");
  });

  it("devuelve cargar true para app nativa Tauri", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "tauri";
    // Ensure not in second plano
    perfil.bateria = { nivel: 0.5, cargando: false, baja: false };
    perfil.visible = true;
    perfil.saveData = false;
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(true);
    expect(resultado.modelo).toBe("multilingual-int8");
    expect(resultado.motivo).toContain("app nativa");
  });

  it("devuelve cargar true para app nativa Android", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "android";
    perfil.bateria = { nivel: 0.5, cargando: false, baja: false };
    perfil.visible = true;
    perfil.saveData = false;
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(true);
    expect(resultado.modelo).toBe("multilingual-int8");
    expect(resultado.motivo).toContain("app nativa");
  });

  it("devuelve cargar true para app nativa iOS", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "ios";
    perfil.bateria = { nivel: 0.5, cargando: false, baja: false };
    perfil.visible = true;
    perfil.saveData = false;
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(true);
    expect(resultado.modelo).toBe("multilingual-int8");
    expect(resultado.motivo).toContain("app nativa");
  });

  it("devuelve cargar false para servidor", () => {
    const perfil = basePerfilMedio();
    perfil.plataforma = "servidor";
    const resultado = planLayaLocal(perfil);
    expect(resultado.cargar).toBe(false);
    expect(resultado.modelo).toBeNull();
    expect(resultado.motivo).toContain("plataforma no soportada");
  });
});