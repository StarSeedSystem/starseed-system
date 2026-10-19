import { describe, it, expect } from "vitest";
import { corregirConGlosario } from "../glosario-oido";

describe("corregirConGlosario", () => {
  it('debe corregir "Star Sed" a "StarSeed"', () => {
    const result = corregirConGlosario('Star Sed', [], 'en');
    expect(result.texto).toBe('StarSeed');
    expect(result.cambios).toEqual(['Star Sed']);
  });

  it('debe corregir "StarSead" a "StarSeed"', () => {
    const result = corregirConGlosario('StarSead', [], 'en');
    expect(result.texto).toBe('StarSeed');
    expect(result.cambios).toEqual(['StarSead']);
  });

  it('debe corregir "Estora" a "Astraura"', () => {
    const result = corregirConGlosario('Estora', [], 'en');
    expect(result.texto).toBe('Astraura');
    expect(result.cambios).toEqual(['Estora']);
  });

  it('debe corregir "Star Said" a "StarSeed"', () => {
    const result = corregirConGlosario('Star Said', [], 'en');
    expect(result.texto).toBe('StarSeed');
    expect(result.cambios).toEqual(['Star Said']);
  });

  it('debe corregir "Astora" a "Astraura"', () => {
    const result = corregirConGlosario('Astora', [], 'en');
    expect(result.texto).toBe('Astraura');
    expect(result.cambios).toEqual(['Astora']);
  });

  it('no debe cambiar palabras comunes como "star"', () => {
    const result = corregirConGlosario('star', [], 'en');
    expect(result.texto).toBe('star');
    expect(result.cambios).toEqual([]);
  });

  it('no debe cambiar "said"', () => {
    const result = corregirConGlosario('said', [], 'en');
    expect(result.texto).toBe('said');
    expect(result.cambios).toEqual([]);
  });

  it('no debe cambiar "sed"', () => {
    const result = corregirConGlosario('sed', [], 'en');
    expect(result.texto).toBe('sed');
    expect(result.cambios).toEqual([]);
  });

  it('debe aceptar glosario adicional', () => {
    const result = corregirConGlosario('Hola Mundo', ['Mundo'], 'en');
    expect(result.texto).toBe('Hola Mundo'); // exact match, no change
    expect(result.cambios).toEqual([]);
  });

  it('debe corregir con glosario adicional cercano', () => {
    const result = corregirConGlosario('Mund', ['Mundo'], 'en');
    expect(result.texto).toBe('Mundo');
    expect(result.cambios).toEqual(['Mund']);
  });

  it('debe manejar múltiples reemplazos', () => {
    const result = corregirConGlosario('Star Sed Estora', [], 'en');
    expect(result.texto).toBe('StarSeed Astraura');
    expect(result.cambios).toEqual(['Star Sed', 'Estora']);
  });

  it('debe funcionar en español (sin palabras comunes definidas)', () => {
    const result = corregirConGlosario('Star Sed', [], 'es');
    expect(result.texto).toBe('StarSeed');
    expect(result.cambios).toEqual(['Star Sed']);
  });
});