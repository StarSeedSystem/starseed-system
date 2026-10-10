import { describe, it, expect } from 'vitest';
import { crearMotor, evento, EstadoMotor } from '../mundo-motor';

describe('mundo-motor', () => {
  it('crea estado inicial', () => {
    const estado = crearMotor({});
    expect(estado.disparadas).toEqual([]);
    expect(estado.mensajes).toEqual([]);
  });
});
