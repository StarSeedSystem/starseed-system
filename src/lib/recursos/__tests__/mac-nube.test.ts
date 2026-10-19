import { describe, it, expect } from 'vitest';
import { planSparseBundle, planMoverDatos, planVolverAtras, PlanPaso, PlanSparseBundleResult, PlanMoverDatosResult, PlanVolverAtrasResult } from '../mac-nube';

describe('planSparseBundle', () => {
  it('should return a plan with three steps and the correct sparse bundle path', () => {
    // Mock process.env.HOME for the test
    process.env.HOME = '/home/user';
    const params = {
      carpetaDrive: '/home/user/Library/CloudStorage/GoogleDrive-user@example.com',
      nombre: 'MiApp',
      tamanoGB: 5,
    };
    const result = planSparseBundle(params);
    expect(result).toHaveProperty('pasos');
    expect(Array.isArray(result.pasos)).toBe(true);
    expect(result.pasos.length).toBe(3);
    expect(result.rutaSparseBundle).toBe('/home/user/Library/CloudStorage/GoogleDrive-user@example.com/MiApp.sparsebundle');
    // Verify step descriptions
    expect(result.pasos[0].descripcion).toContain('Verificar que la carpeta de Google Drive es válida');
    expect(result.pasos[1].descripcion).toContain('Crear sparse bundle');
    expect(result.pasos[2].descripcion).toContain('Adjuntar el sparse bundle');
  });

  it('should throw an error if HOME is not defined', () => {
    // Backup and delete HOME
    const backup = process.env.HOME;
    delete process.env.HOME;
    try {
      const params = {
        carpetaDrive: '/some/path',
        nombre: 'test',
        tamanoGB: 1,
      };
      expect(() => planSparseBundle(params)).toThrow('Variable de entorno HOME no definida');
    } finally {
      // Restore
      if (backup !== undefined) {
        process.env.HOME = backup;
      } else {
        delete process.env.HOME;
      }
    }
  });

  it('should include a verification step for Google Drive path', () => {
    process.env.HOME = '/home/user';
    const params = {
      carpetaDrive: '/home/user/Library/CloudStorage/GoogleDrive-user@example.com/MyFolder',
      nombre: 'Test',
      tamanoGB: 2,
    };
    const result = planSparseBundle(params);
    const verifyStep = result.pasos[0] as PlanPaso;
    expect(verifyStep.orden).toBe(1);
    expect(verifyStep.comando).toMatch(/if \[\[ ".*" == "\/home\/user\/Library\/CloudStorage\/GoogleDrive-"\* \]\]/);
    expect(verifyStep.verificacion).toContain('El comando debe salir con código 0');
  });
});

describe('planMoverDatos', () => {
  it('should return a plan with six steps and the correct backup path', () => {
    const params = {
      app: '/Applications/MyApp.app',
      origen: '/Applications/MyApp.app',
      destino: '/Volumes/MySparseBundle/MyApp.app',
    };
    const result = planMoverDatos(params);
    expect(result).toHaveProperty('pasos');
    expect(Array.isArray(result.pasos)).toBe(true);
    expect(result.pasos.length).toBe(6);
    expect(result.rutaRespaldo).toBe('/Applications/MyApp.app.respaldo-starseed');
    // Check step order and descriptions
    expect(result.pasos[0].descripcion).toContain('Verificar que la app MyApp no está en ejecución');
    expect(result.pasos[1].descripcion).toContain('Copiar la app desde');
    expect(result.pasos[2].descripcion).toContain('Verificar que los tamaños de origen y destino coincidan');
    expect(result.pasos[3].descripcion).toContain('Renombrar la app original a');
    expect(result.pasos[4].descripcion).toContain('Crear enlace simbólico desde');
    expect(result.pasos[5].descripcion).toContain('Probar que la app MyApp abre correctamente');
  });
});

describe('planVolverAtras', () => {
  it('should return a plan with three steps to restore the app from backup', () => {
    const params = {
      origen: '/Applications/MyApp.app',
      destino: '/Volumes/MySparseBundle/MyApp.app',
      respaldo: '/Applications/MyApp.app.respaldo-starseed',
    };
    const result = planVolverAtras(params);
    expect(result).toHaveProperty('pasos');
    expect(Array.isArray(result.pasos)).toBe(true);
    expect(result.pasos.length).toBe(3);
    expect(result.pasos[0].descripcion).toContain('Eliminar el enlace simbólico');
    expect(result.pasos[1].descripcion).toContain('Restaurar la app desde el respaldo');
    expect(result.pasos[2].descripcion).toContain('Verificar que');
  });

  it('should use default respaldo path when not provided', () => {
    const params = {
      origen: '/Applications/TestApp.app',
      destino: '/Volumes/MySparseBundle/TestApp.app',
    };
    const result = planVolverAtras(params);
    const pasoRestaurar = result.pasos[1] as PlanPaso;
    expect(pasoRestaurar.comando).toContain('mv "/Applications/TestApp.app.respaldo-starseed" "/Applications/TestApp.app"');
  });
});