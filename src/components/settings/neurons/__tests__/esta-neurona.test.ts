import { describe, expect, it } from "vitest";
import { filasEstaNeurona, textoResultado } from "../esta-neurona";
import type { Instalada, Medio } from "@/lib/actualizaciones/version-por-medio";
import type { ResultadoComprobar } from "@/lib/actualizaciones/comprobar";
import type { DecisionAviso } from "@/lib/actualizaciones/decision-aviso";

function crearInstalada(
  medio: Medio,
  version: string | null = "1.2.3",
  fuente: Instalada["fuente"] = "info_neurona",
  info: Instalada["info"] = {
    app_version: "1.2.3",
    app_nombre: "StarSeed OS",
    identificador: "os.starseed.app",
    escritorio: true,
    actualizador: true,
    sistema: "os",
    plataforma: "macos",
    so_version: "14.5",
    arquitectura: "arm64",
    modelo: "MacBook Pro",
    equipo: "MacBook Pro (M3, 2023)",
    tauri_version: "2.0.0",
  }
): Instalada {
  return { medio, version, fuente, info };
}

describe("NEU1126B-d4 · esta-neurona · funciones puras", () => {
  describe("filasEstaNeurona", () => {
    it("devuelve array vacío cuando no hay info instalada ni web", () => {
      const filas = filasEstaNeurona(null, null);
      expect(filas).toEqual([]);
    });

    it("incluye versión de la app nativa cuando existe", () => {
      const inst = crearInstalada("escritorio", "1.2.3");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Versión de la app" && f.valor === "1.2.3")).toBe(true);
    });

    it("incluye canal solo cuando es canal de pruebas", () => {
      const inst = crearInstalada("escritorio", "0.5.1-prueba.23");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Canal" && f.valor.includes("pruebas"))).toBe(true);
    });

    it("no incluye canal cuando es versión oficial", () => {
      const inst = crearInstalada("escritorio", "1.2.3");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Canal")).toBe(false);
    });

    it("incluye medio y app cuando hay instalada", () => {
      const inst = crearInstalada("escritorio");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Medio" && f.valor.includes("App de escritorio") && f.valor.includes("StarSeed OS"))).toBe(true);
    });

    it("incluye info web cuando existe build", () => {
      const inst = crearInstalada("web");
      const web = { build: "abc123", sha: "def456789", version: "1.2.3" };
      const filas = filasEstaNeurona(inst, web);
      expect(filas.some((f) => f.etiqueta === "Web" && f.valor.includes("build abc123") && f.valor.includes("def4567") && f.valor.includes("1.2.3"))).toBe(true);
    });

    it("incluye sistema operativo cuando hay info", () => {
      const inst = crearInstalada("escritorio");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Sistema operativo" && f.valor.includes("macOS 14.5"))).toBe(true);
    });

    it("incluye arquitectura cuando hay info", () => {
      const inst = crearInstalada("escritorio");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Arquitectura" && f.valor === "arm64")).toBe(true);
    });

    it("incluye modelo cuando hay info", () => {
      const inst = crearInstalada("escritorio");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Modelo" && f.valor === "MacBook Pro")).toBe(true);
    });

    it("incluye equipo cuando hay info", () => {
      const inst = crearInstalada("escritorio");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Equipo" && f.valor === "MacBook Pro (M3, 2023)")).toBe(true);
    });

    it("incluye Tauri cuando hay info", () => {
      const inst = crearInstalada("escritorio");
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Tauri" && f.valor === "2.0.0")).toBe(true);
    });

    it("funciona con medio android", () => {
      const inst = crearInstalada("android", "1.2.3", "info_neurona", {
        app_version: "1.2.3",
        app_nombre: "StarSeed OS",
        identificador: "os.starseed.app",
        escritorio: false,
        actualizador: false,
        sistema: "os",
        plataforma: "android",
        so_version: "14",
        arquitectura: "arm64",
        modelo: "Pixel 8",
        equipo: "Google Pixel 8",
        tauri_version: "2.0.0",
      });
      const filas = filasEstaNeurona(inst, null);
      expect(filas.some((f) => f.etiqueta === "Medio" && f.valor.includes("Android") && f.valor.includes("StarSeed OS"))).toBe(true);
      expect(filas.some((f) => f.etiqueta === "Sistema operativo" && f.valor.includes("Android 14"))).toBe(true);
    });

    it("funciona con medio web (sin info nativa)", () => {
      const inst: Instalada = { medio: "web", version: "build-123", fuente: "version.json", info: null };
      const web = { build: "build-123", sha: "sha123456", version: "1.2.3" };
      const filas = filasEstaNeurona(inst, web);
      expect(filas.some((f) => f.etiqueta === "Medio" && f.valor.includes("Navegador"))).toBe(true);
      expect(filas.some((f) => f.etiqueta === "Web")).toBe(true);
      expect(filas.some((f) => f.etiqueta === "Sistema operativo")).toBe(false);
    });
  });

  describe("textoResultado", () => {
    function crearResultado(decision: DecisionAviso, instalada: string = "1.2.3", canal?: "oficial" | "pruebas"): ResultadoComprobar {
      return {
        medio: "escritorio",
        instalada,
        publicada: decision.tipo === "ventana" ? decision.version : null,
        decision,
        fecha: "2026-11-27",
        notas: "Notas de la versión",
        canal,
      };
    }

    it("devuelve mensaje de versión lista para instalar (tipo ventana, canal oficial)", () => {
      const decision: DecisionAviso = { tipo: "ventana", version: "1.3.0", origen: "lista", apk: null };
      const resultado = crearResultado(decision);
      const texto = textoResultado(resultado);
      expect(texto).toBe("StarSeed OS 1.3.0 está lista para instalar (tienes la 1.2.3).");
    });

    it("incluye 'del canal de pruebas' cuando el canal es pruebas", () => {
      const decision: DecisionAviso = { tipo: "ventana", version: "0.5.1-prueba.24", origen: "lista", apk: null };
      const resultado = crearResultado(decision, "0.5.1-prueba.23", "pruebas");
      const texto = textoResultado(resultado);
      expect(texto).toBe("StarSeed OS 0.5.1-prueba.24 del canal de pruebas está lista para instalar (tienes la 0.5.1-prueba.23).");
    });

    it("devuelve el texto de la decisión cuando es tipo preparando", () => {
      const decision: DecisionAviso = { tipo: "preparando", version: "1.3.0", texto: "StarSeed OS 1.3.0 está publicada, pero aún se está preparando para este sistema." };
      const resultado = crearResultado(decision);
      const texto = textoResultado(resultado);
      expect(texto).toBe("StarSeed OS 1.3.0 está publicada, pero aún se está preparando para este sistema.");
    });

    it("devuelve el motivo cuando es tipo nada", () => {
      const decision: DecisionAviso = { tipo: "nada", motivo: "Al día: tienes la 1.2.3." };
      const resultado = crearResultado(decision);
      const texto = textoResultado(resultado);
      expect(texto).toBe("Al día: tienes la 1.2.3.");
    });
  });
});