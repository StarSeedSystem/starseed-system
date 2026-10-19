import { describe, it, expect } from 'vitest';
import { contenedoresPara, ContenedorOpcion, CONTENEDORES_OPCIONES } from '../contenedores';

describe('contenedoresPara', () => {
  it('should return all containers when privado is false or undefined', () => {
    const result = contenedoresPara('personal', { privado: false });
    expect(result).toEqual(CONTENEDORES_OPCIONES);

    const result2 = contenedoresPara('personal', {});
    expect(result2).toEqual(CONTENEDORES_OPCIONES);
  });

  it('should return only private containers when privado is true', () => {
    const result = contenedoresPara('personal', { privado: true });
    const expected = CONTENEDORES_OPCIONES.filter((c) => c.aptoPrivado);
    expect(result).toEqual(expected);
  });

  it('should sort containers with privados first, then free, then paid', () => {
    const result = contenedoresPara('personal', { privado: false });

    // Find indices of each type in the result
    const privadoIndex = result.findIndex((c) => c.aptoPrivado);
    const freeIndex = result.findIndex((c) => !c.aptoPrivado && !c.requierePago);
    const paidIndex = result.findIndex((c) => !c.aptoPrivado && c.requierePago);

    // Expect privados to come first
    expect(privadoIndex).toBe(0);
    // Expect free to come after privados and before paid
    expect(freeIndex).toBeGreaterThan(privadoIndex);
    expect(paidIndex).toBeGreaterThan(freeIndex);
  });

  it('should maintain original order within each group', () => {
    const result = contenedoresPara('personal', { privado: false });

    // Extract the privados in the order they appear
    const privados = result.filter((c) => c.aptoPrivado);
    // The original order of privados in CONTENEDORES_OPCIONES is: servidor-propio, neurona-contenedor
    expect(privados[0].id).toBe('servidor-propio');
    expect(privados[1].id).toBe('neurona-contenedor');

    // Extract the free (non-privado, !requierePago)
    const free = result.filter((c) => !c.aptoPrivado && !c.requierePago);
    // Original order of free: oracle-a1, github-actions, google-cloud
    expect(free[0].id).toBe('oracle-a1');
    expect(free[1].id).toBe('github-actions');
    expect(free[2].id).toBe('google-cloud');

    // Extract the paid
    const paid = result.filter((c) => !c.aptoPrivado && c.requierePago);
    // Only one paid: huggingface-spaces
    expect(paid[0].id).toBe('huggingface-spaces');
  });
});

describe('CONTENEDORES_OPCIONES', () => {
  it('should have the correct structure for each container option', () => {
    CONTENEDORES_OPCIONES.forEach((opcion) => {
      expect(opcion).toHaveProperty('id');
      expect(opcion).toHaveProperty('nombre');
      expect(opcion).toHaveProperty('enlaceAlta');
      expect(opcion).toHaveProperty('guia');
      expect(opcion).toHaveProperty('requiereCuenta');
      expect(opcion).toHaveProperty('requierePago');
      expect(opcion).toHaveProperty('aptoPrivado');
      expect(opcion).toHaveProperty('verificado');
    });
  });

  it('should have correct values for privado containers', () => {
    const privadoOptions = CONTENEDORES_OPCIONES.filter((c) => c.aptoPrivado);
    expect(privadoOptions).toHaveLength(2);
    privadoOptions.forEach((opcion) => {
      expect(opcion.aptoPrivado).toBe(true);
      expect(opcion.requiereCuenta).toBe(false);
      expect(opcion.requierePago).toBe(false);
    });
  });

  it('should have correct values for Oracle Always Free', () => {
    const oracle = CONTENEDORES_OPCIONES.find((c) => c.id === 'oracle-a1');
    expect(oracle).toBeDefined();
    expect(oracle?.requiereCuenta).toBe(true);
    expect(oracle?.requierePago).toBe(false);
    expect(oracle?.aptoPrivado).toBe(false);
  });

  it('should have correct values for GitHub Actions', () => {
    const gh = CONTENEDORES_OPCIONES.find((c) => c.id === 'github-actions');
    expect(gh).toBeDefined();
    expect(gh?.requiereCuenta).toBe(true);
    expect(gh?.requierePago).toBe(false);
    expect(gh?.aptoPrivado).toBe(false);
  });

  it('should have correct values for Hugging Face Spaces', () => {
    const hf = CONTENEDORES_OPCIONES.find((c) => c.id === 'huggingface-spaces');
    expect(hf).toBeDefined();
    expect(hf?.requiereCuenta).toBe(true);
    expect(hf?.requierePago).toBe(true);
    expect(hf?.aptoPrivado).toBe(false);
  });
});