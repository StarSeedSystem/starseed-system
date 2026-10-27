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

  it("voicestudio tiene licencia AGPL-3.0-only, flujo y atribucion", () => {
    const m = MOTORES_OIDO.find((x) => x.id === 'voicestudio');
    expect(m?.licencia).toBe('AGPL-3.0-only');
    expect(m?.flujo).toBe(true);
    expect(m?.atribucion).toBe(true);
  });

  it("moonshine tiene licencia MIT, flujo true, idiomas ['en','es'] y tamanoMB 60", () => {
    const m = MOTORES_OIDO.find((x) => x.id === 'moonshine');
    expect(m?.licencia).toBe('MIT');
    expect(m?.flujo).toBe(true);
    expect(m?.idiomas).toEqual(['en','es']);
    expect(m?.tamanoMB).toBe(60);
  });

  it("voicestudio es de tipo endpoint", () => {
    const m = MOTORES_OIDO.find((x) => x.id === 'voicestudio');
    expect(m?.tipo).toBe('endpoint');
  });

  it("moonshine es de tipo local", () => {
    const m = MOTORES_OIDO.find((x) => x.id === 'moonshine');
    expect(m?.tipo).toBe('local');
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

  // New tests for voicestudio and moonshine
  it("voicestudio se escoge en español final cuando parakeet-v3 no está disponible", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['voicestudio', 'whisper-web'],
      fase: 'final',
    });
    // Orden español: parakeet-v3 (ausente), voicestudio (presente) → voicestudio.
    expect(r.motor).toBe('voicestudio');
    expect(r.motivo).toContain('fase final: mayor precisión para es');
  });

  it("voicestudio se escoge en inglés final cuando phonon-2 y parakeet-v3 no están disponibles", () => {
    const r = elegirOido({
      idioma: 'en',
      disponibles: ['voicestudio', 'moonshine'],
      fase: 'final',
    });
    // Orden inglés: phonon-2 (ausente), voicestudio (presente), …, moonshine → voicestudio.
    expect(r.motor).toBe('voicestudio');
  });
  it("voicestudio se selecciona en fase parcial por menor latencia", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['voicestudio', 'navegador'],
      fase: 'parcial',
      medidas: { 'voicestudio': 50, 'navegador': 100 },
    });
    expect(r.motor).toBe('voicestudio');
    expect(r.motivo).toContain('parcial');
  });

  it("moonshine se selecciona en fase parcial por menor latencia", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['moonshine', 'navegador'],
      fase: 'parcial',
      medidas: { 'moonshine': 50, 'navegador': 100 },
    });
    expect(r.motor).toBe('moonshine');
    expect(r.motivo).toContain('parcial');
  });

  it("en español final, voicestudio se selecciona después de parakeet-v3 cuando ambos están disponibles", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['parakeet-v3', 'voicestudio', 'vibeasr-158'],
      fase: 'final',
    });
    // parakeet-v3 debe ser elegido antes que voicestudio
    expect(r.motor).toBe('parakeet-v3');
  });

  it("en inglés final, voicestudio se selecciona después de phonon-2 cuando ambos están disponibles", () => {
    const r = elegirOido({
      idioma: 'en',
      disponibles: ['phonon-2', 'voicestudio', 'parakeet-v3'],
      fase: 'final',
    });
    // phonon-2 debe ser elegido antes que voicestudio
    expect(r.motor).toBe('phonon-2');
  });

  it("en español final, moonshine se selecciona antes de whisper-web cuando ambos están disponibles", () => {
    const r = elegirOido({
      idioma: 'es',
      disponibles: ['moonshine', 'whisper-web', 'navegador'],
      fase: 'final',
    });
    // moonshine debe ser elegido antes que whisper-web
    expect(r.motor).toBe('moonshine');
  });
});
