import { describe, it, expect } from 'vitest';
import { planSparseBundle2_4 } from '../sparse-2-4';

describe('planSparseBundle2_4', () => {
  it('should return a plan with two steps and the correct sparse bundle path', () => {
    const params = {
      carpetaDrive: '/home/user/Library/CloudStorage/GoogleDrive-user@example.com',
      nombre: 'ModelosEsparse2_4',
      tamanoGB: 10,
    };
    const result = planSparseBundle2_4(params);
    expect(result).toHaveProperty('pasos');
    expect(Array.isArray(result.pasos)).toBe(true);
    expect(result.pasos.length).toBe(2);
    expect(result.rutaSparseBundle).toBe('/home/user/Library/CloudStorage/GoogleDrive-user@example.com/ModelosEsparse2_4.sparsebundle');
    expect(result.pasos[0].descripcion).toContain('Verificar que el modelo tiene un formato de 2:4');
    expect(result.pasos[1].descripcion).toContain('Convertir modelo al formato disperso 2:4');
  });
});
