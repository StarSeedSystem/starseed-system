import { describe, it, expect } from 'vitest';

import {
  politicaDeTransporte,
  aadDe,
  NFC_LIMITE_PUBLICO_BYTES,
} from '../politica';
import { CLASES_DATO, MEDIOS, type ClaseDato, type Dato, type Medio } from '../../tipos';

const DATO: Dato = {
  id: 'dato-1',
  clase: 'privado',
  tipo: 'mensaje',
  bytes: 64,
  prioridad: 1,
  origen: 'neurona-a',
  destino: 'neurona-b',
};

describe('politicaDeTransporte — tabla completa (3 clases x 9 medios)', () => {
  it('todo medio permitido para cualquier clase con dato pequeño', () => {
    for (const clase of CLASES_DATO) {
      for (const medio of MEDIOS) {
        const p = politicaDeTransporte(clase as ClaseDato, medio as Medio, 64);
        expect(p.permitido).toBe(true);
      }
    }
  });

  it('firma SIEMPRE, en las 27 combinaciones', () => {
    for (const clase of CLASES_DATO) {
      for (const medio of MEDIOS) {
        expect(politicaDeTransporte(clase, medio, 64).firma).toBe(true);
      }
    }
  });

  it("cifrado E2E obligatorio para 'interno' y 'privado' en todos los medios, incluido lora", () => {
    for (const clase of ['interno', 'privado'] as ClaseDato[]) {
      for (const medio of MEDIOS) {
        const p = politicaDeTransporte(clase, medio, 64);
        expect(p.cifradoE2E).toBe(true);
        expect(p.motivo).toContain('cifrado');
      }
    }
  });

  it("'publico' viaja sin cifrar pero firmado por todos los medios", () => {
    for (const medio of MEDIOS) {
      const p = politicaDeTransporte('publico', medio, 64);
      expect(p.cifradoE2E).toBe(false);
      expect(p.firma).toBe(true);
    }
  });

  it("unica prohibicion: 'nfc' para 'publico' mayor de 32 KB, con motivo", () => {
    const grande = NFC_LIMITE_PUBLICO_BYTES + 1;
    const no = politicaDeTransporte('publico', 'nfc', grande);
    expect(no.permitido).toBe(false);
    expect(no.motivo.length).toBeGreaterThan(0);
    expect(no.firma).toBe(true);

    expect(politicaDeTransporte('publico', 'nfc', NFC_LIMITE_PUBLICO_BYTES).permitido).toBe(true);
    // interno y privado cifrados SI caben aunque sean grandes (las tramas las corta el transporte)
    expect(politicaDeTransporte('interno', 'nfc', grande).permitido).toBe(true);
    expect(politicaDeTransporte('privado', 'nfc', grande).permitido).toBe(true);
    // el resto de medios nunca prohíben un publico por tamaño
    for (const medio of MEDIOS) {
      if (medio === 'nfc') continue;
      expect(politicaDeTransporte('publico', medio, grande).permitido).toBe(true);
    }
  });
});

describe('aadDe', () => {
  it('es el UTF-8 de `${id}|${clase}|${tipo}|${epoca}`', () => {
    const esperado = new TextEncoder().encode('dato-1|privado|mensaje|42');
    expect(aadDe(DATO, 42)).toEqual(esperado);
  });

  it('cambia con la epoca y con cada campo del dato', () => {
    const base = aadDe(DATO, 7);
    expect(aadDe(DATO, 8)).not.toEqual(base);
    expect(aadDe({ ...DATO, clase: 'interno' }, 7)).not.toEqual(base);
    expect(aadDe({ ...DATO, tipo: 'archivo' }, 7)).not.toEqual(base);
    expect(aadDe({ ...DATO, id: 'dato-2' }, 7)).not.toEqual(base);
  });
});
