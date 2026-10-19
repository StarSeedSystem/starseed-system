// Pruebas de los paquetes de voz en la Biblioteca (VST1018A · Ola 1018V).

import { describe, it, expect } from "vitest";
import { STARSEED_LABS_REPO } from "../packages";

describe("Paquetes de voz en el repositorio starseed-labs", () => {
  const voicePackages = STARSEED_LABS_REPO.packages.filter(
    (pkg) => pkg.kind === "repo" && pkg.payload.categoria === "voces"
  );

  describe("voces-voicestudio", () => {
    it("existe el paquete voz-voicestudio", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-voicestudio");
      expect(pkg).toBeDefined();
    });

    it("voz-voicestudio tiene githubRepo", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-voicestudio");
      expect(getGitHubRepo(pkg)).toBe("debpalash/VoiceStudio");
    });

    it("voz-voicestudio tiene claseLicencia libre", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-voicestudio");
      expect(getClaseLicencia(pkg)).toBe("libre");
    });
  });

  describe("voces-cosyvoice3", () => {
    it("existe el paquete voz-cosyvoice3", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-cosyvoice3");
      expect(pkg).toBeDefined();
    });

    it("voz-cosyvoice3 tiene githubRepo", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-cosyvoice3");
      expect(getGitHubRepo(pkg)).toBe("FunAudioLLM/CosyVoice");
    });

    it("voz-cosyvoice3 tiene claseLicencia libre", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-cosyvoice3");
      expect(getClaseLicencia(pkg)).toBe("libre");
    });
  });

  describe("voces-qwen3-tts", () => {
    it("existe el paquete voz-qwen3-tts", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-qwen3-tts");
      expect(pkg).toBeDefined();
    });

    it("voz-qwen3-tts tiene githubRepo", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-qwen3-tts");
      expect(getGitHubRepo(pkg)).toBe("QwenLM/Qwen3-TTS");
    });

    it("voz-qwen3-tts tiene claseLicencia libre", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-qwen3-tts");
      expect(getClaseLicencia(pkg)).toBe("libre");
    });
  });

  describe("voces-kittentts", () => {
    it("existe el paquete voz-kittentts", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-kittentts");
      expect(pkg).toBeDefined();
    });

    it("voz-kittentts tiene githubRepo", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-kittentts");
      expect(getGitHubRepo(pkg)).toBe("KittenML/KittenTTS");
    });

    it("voz-kittentts tiene claseLicencia libre", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-kittentts");
      expect(getClaseLicencia(pkg)).toBe("libre");
    });
  });

  describe("voces-moss-tts-nano", () => {
    it("existe el paquete voz-moss-tts-nano", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-moss-tts-nano");
      expect(pkg).toBeDefined();
    });

    it("voz-moss-tts-nano tiene githubRepo", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-moss-tts-nano");
      expect(getGitHubRepo(pkg)).toBe("OpenMOSS/MOSS-TTS");
    });

    it("voz-moss-tts-nano tiene claseLicencia libre", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-moss-tts-nano");
      expect(getClaseLicencia(pkg)).toBe("libre");
    });
  });

  describe("voces-dots-tts", () => {
    it("existe el paquete voz-dots-tts", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-dots-tts");
      expect(pkg).toBeDefined();
    });

    it("voz-dots-tts tiene githubRepo", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-dots-tts");
      expect(getGitHubRepo(pkg)).toBe("rednote-hilab/dots.tts");
    });

    it("voz-dots-tts tiene claseLicencia libre", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-dots-tts");
      expect(getClaseLicencia(pkg)).toBe("libre");
    });
  });

  describe("oido-moonshine", () => {
    it("existe el paquete oido-moonshine", () => {
      const pkg = voicePackages.find((p) => p.id === "oido-moonshine");
      expect(pkg).toBeDefined();
    });

    it("oido-moonshine tiene githubRepo", () => {
      const pkg = voicePackages.find((p) => p.id === "oido-moonshine");
      expect(getGitHubRepo(pkg)).toBe("moonshine-ai/moonshine");
    });

    it("oido-moonshine tiene claseLicencia libre", () => {
      const pkg = voicePackages.find((p) => p.id === "oido-moonshine");
      expect(getClaseLicencia(pkg)).toBe("libre");
    });
  });

  describe("voces-voicemorphic (actualizado)", () => {
    it("voz-voicemorphic tiene githubRepo", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-voicemorphic");
      expect(getGitHubRepo(pkg)).toBe("StarSeedSystem/starseed-system");
    });

    it("voz-voicemorphic tiene claseLicencia personal", () => {
      const pkg = voicePackages.find((p) => p.id === "voz-voicemorphic");
      expect(getClaseLicencia(pkg)).toBe("personal");
    });
  });

  describe("todos los paquetes de voz", () => {
    it("tienen ids únicos", () => {
      const ids = voicePackages.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("todos tienen githubRepo en payload", () => {
      voicePackages.forEach((pkg) => {
        expect(getGitHubRepo(pkg)).toBeDefined();
      });
    });

    it("voz-voicemorphic es la única con claseLicencia personal", () => {
      const personal = voicePackages.filter(
        (p) => getClaseLicencia(p) === "personal"
      );
      expect(personal).toHaveLength(1);
      expect(personal[0].id).toBe("voz-voicemorphic");
    });

    it("los demás tienen claseLicencia libre", () => {
      const libre = voicePackages.filter(
        (p) => getClaseLicencia(p) === "libre"
      );
      expect(libre).toHaveLength(voicePackages.length - 1); // excluding voicemorphic
    });
  });
});

// Funciones auxiliares para acceder de forma segura al payload
function getGitHubRepo(pkg: any): string | undefined {
  return pkg.payload.githubRepo;
}

function getClaseLicencia(pkg: any): string | undefined {
  return pkg.payload.claseLicencia;
}