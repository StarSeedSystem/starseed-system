// Pruebas del módulo puro de paquetes de voz (VST1018A · Ola 1018V).

import { describe, it, expect } from "vitest";
import { STARSEED_LABS_REPO } from "../packages";

describe("Paquetes de voz modificados/añadidos", () => {
  // Definir los paquetes que fueron modificados o añadidos en esta tarea
  const paquetesTarea = [
    "voz-voicemorphic",      // modificada: añadida claseLicencia
    "voz-voicestudio",       // añadida
    "voz-cosyvoice3",        // añadida
    "voz-qwen3-tts",         // añadida
    "voz-kittentts",         // añadida
    "voz-moss-tts-nano",     // añadida
    "voz-dots-tts",          // añadida
    "oido-moonshine",        // añadida
  ];

  const paquetesEncontrados = paquetesTarea.map(
    id => STARSEED_LABS_REPO.packages.find(pkg => pkg.id === id)
  ).filter((pkg): pkg is NonNullable<typeof pkg> => pkg !== undefined);

  describe("ids únicos", () => {
    it("los paquetes de la tarea tienen ids únicos", () => {
      const ids = paquetesEncontrados.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("githubRepo presente", () => {
    it("todos los paquetes de la tarea tienen githubRepo", () => {
      for (const pkg of paquetesEncontrados) {
        const githubRepo = (pkg.payload as any).githubRepo;
        expect(githubRepo, `githubRepo faltante en ${pkg.id}`).toBeDefined();
        expect(typeof githubRepo).toBe("string");
        expect(githubRepo.length).toBeGreaterThan(0);
      }
    });
  });

  describe("claseLicencia válida", () => {
    it("el paquete voz-voicemorphic tiene claseLicencia: personal", () => {
      const voicemorphic = paquetesEncontrados.find(p => p.id === "voz-voicemorphic");
      expect(voicemorphic).toBeDefined();
      expect((voicemorphic?.payload as any).claseLicencia).toBe("personal");
    });

    it("los paquetes añadidos tienen claseLicencia: libre", () => {
      const paquetesAdded = paquetesEncontrados.filter(p => p.id !== "voz-voicemorphic");
      for (const pkg of paquetesAdded) {
        const claseLicencia = (pkg.payload as any).claseLicencia;
        expect(claseLicencia, `claseLicencia faltante o inválida en ${pkg.id}`).toBeDefined();
        expect(claseLicencia).toBe("libre");
      }
    });
  });
});