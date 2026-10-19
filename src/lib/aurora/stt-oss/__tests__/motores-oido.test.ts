import { describe, it, expect } from "vitest";
import { MOTORES_OIDO, elegirOido } from "../motores-oido";

describe("catálogo MOTORES_OIDO", () => {
  it("tiene 8 motores registrados", () => {
    expect(MOTORES_OIDO.length).toBe(8);
  });

  it("phonon-2 tiene licencia CC-BY-4.0, flujo y 164 MB", () => {
    const m = MOTORES_OIDO.find((x) => x.id === 'phonon-2');
    expect(m?.licencia).toBe('CC-BY-4.0');
    expect(m?.flujo).toBe(true);
    expect(m?.tamanoMB).toBe(164);
  });

  it("parakeet-v3 cubre todos los idiomas con '*', tipo local", () => {
    const m = MOTORES_OIDO.find((x) => x.id === 'parakeet-v3');
    expect(m?.idiomas).toContain('*');
    expect(m?.tipo).toBe('local');
  });

  it("voicestudio tiene licencia AGPL-3.0-only, tipo endpoint y flujo true", () => {
    const m = MOTORES_OIDO.find((x) => x.id === 'voicestudio');
    expect(m?.licencia).toBe('AGPL-3.0-only');
    expect(m?.tipo).toBe('endpoint');
    expect(m?.flujo).toBe(true);
  });

  it("moonshine tiene licencia MIT, tipo local, flujo true y 60 MB", () => {
    const m = MOTORES_OIDO.find((x) => x.id === 'moonshine');
    expect(m?.licencia).toBe('MIT');
    expect(m?.tipo).toBe('local');
    expect(m?.flujo).toBe(true);
    expect(m?.tamanoMB).toBe(60);
  });
});

describe("elegirOido", () => {
  it("preferido disponible manda", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['parakeet-v3', 'phonon-2'],
      fase: 'final',
      preferido: 'phonon-2',
    });
    expect(r.motor).toBe('phonon-2');
    expect(r.motivo).toContain('preferido');
  });

  it("español con todos disponibles elige parakeet-v3 en final", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['phonon-2', 'parakeet-v3', 'vibeasr-158', 'whisper-web', 'navegador'],
      fase: 'final',
    });
    expect(r.motor).toBe('parakeet-v3');
  });

  it("inglés sin medidas usa phonon-2 por defecto", () => {
    const r = elegirOido({
      idioma: 'en',
      disponibles: ['phonon-2', 'parakeet-v3'],
      fase: 'final',
    });
    expect(r.motor).toBe('phonon-2');
  });

  it("fase parcial elige el de menor latencia con flujo", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['phonon-2', 'navegador'],
      fase: 'parcial',
      medidas: { 'phonon-2': 120, 'navegador': 30 },
    });
    expect(r.motor).toBe('navegador');
    expect(r.motivo).toContain('parcial');
  });

  it("suelo: sin ninguno disponible devuelve navegador", () => {
    const r = elegirOido({
      idioma: 'ca',
      disponibles: [],
      fase: 'final',
    });
    expect(r.motor).toBe('navegador');
    expect(r.motivo).toContain('suelo');
  });

  // New tests for the added motors
  it("voicestudio se considera en final para español cuando está disponible", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['parakeet-v3', 'voicestudio'],
      fase: 'final',
    });
    // In Spanish final, parakeet-v3 is first, then voicestudio. Since parakeet-v3 is available, it should be chosen.
    expect(r.motor).toBe('parakeet-v3');
  });

  it("voicestudio se considera en final para español cuando parakeet-v3 no está disponible", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['voicestudio', 'whisper-web'],
      fase: 'final',
    });
    // Order: parakeet-v3 (not available), voicestudio (available) -> should pick voicestudio
    expect(r.motor).toBe('voicestudio');
    expect(r.motivo).toContain('fase final: mayor precisión para es');
  });

  it("moonshine se considera en final para español y está antes de whisper-web", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['moonshine', 'whisper-web'],
      fase: 'final',
    });
    // Order: parakeet-v3, voicestudio, vibeasr-158, phonon-2, moonshine, whisper-web, ...
    // moonshine is before whisper-web, so it should be chosen.
    expect(r.motor).toBe('moonshine');
  });

  it("voicestudio se considera en final para inglés", () => {
    const r = elegirOido({
      idioma: 'en',
      disponibles: ['phonon-2', 'voicestudio'],
      fase: 'final',
    });
    // English order: phonon-2, parakeet-v3, vibeasr-158, whisper-web, navegador, malla, voicestudio, moonshine
    // phonon-2 is available, so it should be chosen.
    expect(r.motor).toBe('phonon-2');
  });

  it("voicestudio se considera en final para inglés cuando phonon-2 y parakeet-v3 no están disponibles", () => {
    const r = elegirOido({
      idioma: 'en',
      disponibles: ['voicestudio', 'moonshine'],
      fase: 'final',
    });
    // English order: ... malla, voicestudio, moonshine
    // voicestudio comes before moonshine, so it should be chosen.
    expect(r.motor).toBe('voicestudio');
  });
});