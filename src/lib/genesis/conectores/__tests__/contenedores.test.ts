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
    // Orden original de las opciones gratis.
    expect(free.map((c) => c.id)).toEqual(['oracle-a1', 'github-actions', 'cloudroom']);

    // Extract the paid
    const paid = result.filter((c) => !c.aptoPrivado && c.requierePago);
    // De pago, en su orden: google-cloud (pide facturación) y huggingface-spaces (Docker pide PRO)
    expect(paid.map((c) => c.id)).toEqual(['google-cloud', 'huggingface-spaces', 'cloudflare-computer']);
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

  // OPF1024J · Cloud Run solo corre en un proyecto con facturación (método de pago), también en su
  // capa gratuita; la de la fundación está desactivada desde el 2026-09-25
  // (architecture/repos-libreria-1020d.md, architecture/genesis-conectores-abiertos.md).
  it('Google Cloud Run pide cuenta y facturación: no es un contenedor «sin pago»', () => {
    const gc = CONTENEDORES_OPCIONES.find((c) => c.id === 'google-cloud');
    expect(gc).toBeDefined();
    expect(gc?.requiereCuenta).toBe(true);
    expect(gc?.requierePago).toBe(true);
    expect(gc?.aptoPrivado).toBe(false);
  });

  it('should have correct values for Hugging Face Spaces', () => {
    const hf = CONTENEDORES_OPCIONES.find((c) => c.id === 'huggingface-spaces');
    expect(hf).toBeDefined();
    expect(hf?.requiereCuenta).toBe(true);
    expect(hf?.requierePago).toBe(true);
    expect(hf?.aptoPrivado).toBe(false);
  });

  it('Cloudflare Computer pide cuenta y pago, no es apto privado, y declara requisitos que mencionan Workers Paid y wrangler', () => {
    const cc = CONTENEDORES_OPCIONES.find((c) => c.id === 'cloudflare-computer');
    expect(cc).toBeDefined();
    expect(cc?.requiereCuenta).toBe(true);
    expect(cc?.requierePago).toBe(true);
    expect(cc?.aptoPrivado).toBe(false);
    expect(cc?.cupo).toContain('Sin cupo gratuito comprobado');
    expect(cc?.requisitos).toEqual(expect.arrayContaining([
      expect.stringContaining('Workers Paid'),
      expect.stringContaining('wrangler'),
    ]));
  });

  it('declara el cupo y los requisitos de Cloudroom sin marcarlo como de pago', () => {
    const cloudroom = CONTENEDORES_OPCIONES.find((c) => c.id === 'cloudroom');
    expect(cloudroom).toMatchObject({ requiereCuenta: true, requierePago: false, aptoPrivado: false,
      cupo: expect.stringContaining('100 agentes'), requisitos: expect.arrayContaining(['GitHub conectado', 'Agente de código conectado']) });
  });

  it('Cloudroom no pone cupo a los agentes locales', () => {
    const cloudroom = CONTENEDORES_OPCIONES.find((c) => c.id === 'cloudroom');
    expect(cloudroom?.cupo).toContain('locales sin cupo');
  });

  it('Cloudroom declara las plataformas de su app de escritorio', () => {
    const cloudroom = CONTENEDORES_OPCIONES.find((c) => c.id === 'cloudroom');
    const requisitos = cloudroom?.requisitos?.join(' ') ?? '';
    expect(requisitos).toContain('macOS 13+');
    expect(requisitos).toContain('Linux x64');
  });
});
