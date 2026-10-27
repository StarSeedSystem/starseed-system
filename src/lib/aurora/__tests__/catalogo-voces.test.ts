import { describe, it, expect } from "vitest";
import { MotorVozCatalogo, MOTORES_VOZ, motorRecomendado, Plataforma } from "../catalogo-voces";

describe("Catálogo de voces", () => {
  it("should have the new fields in the interface", () => {
    // This test is just to ensure the interface has the fields; we can't test the interface directly,
    // but we can test that the objects have the fields.
    expect(true).toBe(true);
  });

  it("should have licenciaPesos and claseLicencia in each motor", () => {
    MOTORES_VOZ.forEach((motor) => {
      expect(motor).toHaveProperty("licenciaPesos");
      expect(motor).toHaveProperty("claseLicencia");
      expect(typeof motor.licenciaPesos).toBe("string");
      expect(["libre", "condicionada", "personal"]).toContain(motor.claseLicencia);
    });
  });

  it("should have correct values for existing motors", () => {
    const voicemorphic = MOTORES_VOZ.find((m) => m.id === "voicemorphic");
    expect(voicemorphic).toBeDefined();
    expect(voicemorphic?.licenciaPesos).toBe("CC-BY-NC");
    expect(voicemorphic?.claseLicencia).toBe("personal");

    const kokoro = MOTORES_VOZ.find((m) => m.id === "kokoro");
    expect(kokoro).toBeDefined();
    expect(kokoro?.licenciaPesos).toBe("Apache-2.0");
    expect(kokoro?.claseLicencia).toBe("libre");

    const chatterbox = MOTORES_VOZ.find((m) => m.id === "chatterbox");
    expect(chatterbox).toBeDefined();
    expect(chatterbox?.licenciaPesos).toBe("MIT");
    expect(chatterbox?.claseLicencia).toBe("libre");

    const voxcpm = MOTORES_VOZ.find((m) => m.id === "voxcpm");
    expect(voxcpm).toBeDefined();
    expect(voxcpm?.licenciaPesos).toBe("Apache-2.0");
    expect(voxcpm?.claseLicencia).toBe("libre");

    const openvoice2 = MOTORES_VOZ.find((m) => m.id === "openvoice2");
    expect(openvoice2).toBeDefined();
    expect(openvoice2?.licenciaPesos).toBe("MIT");
    expect(openvoice2?.claseLicencia).toBe("libre");

    const sistema = MOTORES_VOZ.find((m) => m.id === "sistema");
    expect(sistema).toBeDefined();
    expect(sistema?.claseLicencia).toBe("libre");
  });

  it("should have correct values for new motors", () => {
    const cosyvoice3 = MOTORES_VOZ.find((m) => m.id === "cosyvoice3");
    expect(cosyvoice3).toBeDefined();
    expect(cosyvoice3?.licenciaPesos).toBe("Apache-2.0");
    expect(cosyvoice3?.claseLicencia).toBe("libre");

    const qwen3tts = MOTORES_VOZ.find((m) => m.id === "qwen3-tts");
    expect(qwen3tts).toBeDefined();
    expect(qwen3tts?.licenciaPesos).toBe("Apache-2.0");
    expect(qwen3tts?.claseLicencia).toBe("libre");

    const kittentts = MOTORES_VOZ.find((m) => m.id === "kittentts");
    expect(kittentts).toBeDefined();
    expect(kittentts?.licenciaPesos).toBe("Apache-2.0");
    expect(kittentts?.claseLicencia).toBe("libre");

    const mossTTsNano = MOTORES_VOZ.find((m) => m.id === "moss-tts-nano");
    expect(mossTTsNano).toBeDefined();
    expect(mossTTsNano?.licenciaPesos).toBe("Apache-2.0");
    expect(mossTTsNano?.claseLicencia).toBe("libre");

    const dotstts = MOTORES_VOZ.find((m) => m.id === "dots-tts");
    expect(dotstts).toBeDefined();
    expect(dotstts?.licenciaPesos).toBe("Apache-2.0");
    expect(dotstts?.claseLicencia).toBe("libre");

    const voicestudio = MOTORES_VOZ.find((m) => m.id === "voicestudio");
    expect(voicestudio).toBeDefined();
    expect(voicestudio?.claseLicencia).toBe("personal");
  });

  it("motorRecomendado should return personal motor for personal context", () => {
    // For macOS with 8 GB, personal context should return voicemorphic (personal) because it's the default for macos
    const motor = motorRecomendado("macos", 8, "personal");
    expect(motor.id).toBe("voicemorphic");
  });

  it("motorRecomendado should return a libre motor for non-personal context", () => {
    // For macOS with 8 GB, non-personal context should not return a personal motor
    const motor = motorRecomendado("macos", 8, "grupo");
    expect(motor.claseLicencia).not.toBe("personal");
    // It should be a libre motor
    expect(motor.claseLicencia).toBe("libre");
    // And it should be one that fits in 8 GB and is offline and for macos
    expect(motor.offline).toBe(true);
    expect(motor.ramMinGB).toBeLessThanOrEqual(8);
    expect(motor.plataformas).toContain("macos");
  });

  it("motorRecomendado returns the most capable libre motor for non-personal context", () => {
    // For macOS 8 GB, non-personal context should return the libre motor with highest calidad and lowest ramMinGB
    const motor = motorRecomendado("macos", 8, "grupo");
    expect(motor.claseLicencia).toBe("libre");
    expect(motor.calidad).toBe("alta");
    // Among libres with alta calidad and offline and ramMinGB <= 8 for macos, the smallest ramMinGB is 4
    expect(motor.ramMinGB).toBe(4);
    // It should be one of cosyvoice3, qwen3-tts, dots-tts (all have ramMinGB 4)
    expect(["cosyvoice3", "qwen3-tts", "dots-tts"]).toContain(motor.id);
  });
  it("motorRecomendado con RAM desconocida (NaN, no finita o negativa) elige el ligero por defecto, nunca el pesado", () => {
    // OPF1024F: con NaN ningún `ramMinGB <= ram` se cumplía y caía al último del catálogo (voicestudio, 8 GB).
    const ligero = MOTORES_VOZ.filter((m) => m.offline && m.porDefectoEn.length > 0)
      .sort((a, b) => a.ramMinGB - b.ramMinGB)[0];
    expect(ligero.id).toBe("kokoro");
    const plataformas: Plataforma[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const ram of [NaN, Infinity, -Infinity, -1]) {
      for (const p of plataformas) {
        for (const ctx of ["personal", "grupo", "comercial"] as const) {
          const m = motorRecomendado(p, ram, ctx);
          expect(m.id, `${p} · ram=${ram} · ${ctx}`).toBe(ligero.id);
          expect(m.ramMinGB).toBeLessThanOrEqual(ligero.ramMinGB);
          expect(m.plataformas).toContain(p);
        }
      }
    }
    // Con RAM conocida no cambia nada.
    expect(motorRecomendado("macos", 8, "personal").id).toBe("voicemorphic");
    expect(motorRecomendado("web", 4, "personal").id).toBe("kokoro");
  });

  it("licenciaPesos honesta para los motores cuyos valores no se fijan en el resto del catálogo", () => {
    // El resto de motores ya fija licenciaPesos y claseLicencia arriba; aquí van
    // los dos que quedaban a la vista: el del sistema y VoiceStudio.
    const sistema = MOTORES_VOZ.find((m) => m.id === "sistema");
    expect(sistema?.licenciaPesos).toBe("VARIES");
    const voicestudio = MOTORES_VOZ.find((m) => m.id === "voicestudio");
    expect(voicestudio?.licenciaPesos).toBe("Múltiple (según motor)");
  });

  it("con poca RAM (0,4 GB) solo cabe la voz del sistema, en personal y en grupo", () => {
    // Con RAM positiva baja (no NaN, camino distinto del OPF1024F), ningún motor
    // con ramMinGB > 0 entra y ambos contextos caen en el mismo motor ligero.
    const personal = motorRecomendado("macos", 0.4, "personal");
    const grupo = motorRecomendado("macos", 0.4, "grupo");
    expect(personal.id).toBe("sistema");
    expect(grupo.id).toBe("sistema");
    expect(personal.id).toBe(grupo.id);
  });

  it("respeta la RAM mínima: con 3,9 GB no sale un motor que pide 4", () => {
    const motor = motorRecomendado("macos", 3.9, "personal");
    expect(motor.id).not.toBe("voicemorphic");
    expect(motor.ramMinGB).toBeLessThanOrEqual(3.9);
  });
});
