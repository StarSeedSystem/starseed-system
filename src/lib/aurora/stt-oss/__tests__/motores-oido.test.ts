import { describe, it, expect } from "vitest";
import { MOTORES_OIDO, elegirOido } from "../motores-oido";

describe("catálogo MOTORES_OIDO", () => {
  it("tiene 6 motores registrados", () => {
    expect(MOTORES_OIDO.length).toBe(6);
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
});
