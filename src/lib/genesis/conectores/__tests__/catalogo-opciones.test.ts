import { describe, it, expect } from 'vitest';
import { fusionarCatalogos } from '../catalogo-opciones';
import { PROVEEDORES_CATALOGO } from '../../../../../src/lib/mando/proveedores-catalogo';
import { FREE_CATALOG } from '../../../../../src/ai/astraura/free-catalog';

describe('fusionarCatalogos', () => {
  it('should return an array', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should not have duplicate ids', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    const ids = result.map(item => item.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should set correct nombre for proveedores', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    for (const prov of PROVEEDORES_CATALOGO) {
      const opcion = result.find(o => o.id === prov.id);
      expect(opcion).toBeDefined();
      expect(opcion?.nombre).toBe(prov.nombre);
    }
  });

  it('should set correct nombre for free sources not in proveedores', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    const proveedorIds = new Set(PROVEEDORES_CATALOGO.map(p => p.id));
    for (const free of FREE_CATALOG) {
      if (proveedorIds.has(free.id)) {
        continue;
      }
      const opcion = result.find(o => o.id === free.id);
      expect(opcion).toBeDefined();
      expect(opcion?.nombre).toBe(free.label);
    }
  });

  it('should set gratis.nota from proveedores.gratis when available', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    for (const prov of PROVEEDORES_CATALOGO) {
      const opcion = result.find(o => o.id === prov.id);
      expect(opcion).toBeDefined();
      expect(opcion?.gratis?.nota).toBe(prov.gratis ?? null);
    }
  });

  it('should set gratis.nota from free.limits when not in proveedores', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    const proveedorIds = new Set(PROVEEDORES_CATALOGO.map(p => p.id));
    for (const free of FREE_CATALOG) {
      if (proveedorIds.has(free.id)) {
        continue;
      }
      const opcion = result.find(o => o.id === free.id);
      expect(opcion).toBeDefined();
      expect(opcion?.gratis?.nota).toBe(free.limits ?? null);
    }
  });

  it('should set requiereCuenta correctly for proveedores', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    for (const prov of PROVEEDORES_CATALOGO) {
      const opcion = result.find(o => o.id === prov.id);
      expect(opcion).toBeDefined();
      expect(opcion?.requiereCuenta).toBe(prov.requiereCuenta);
    }
  });

  it('should set requiereCuenta correctly for free sources', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    const proveedorIds = new Set(PROVEEDORES_CATALOGO.map(p => p.id));
    for (const free of FREE_CATALOG) {
      if (proveedorIds.has(free.id)) {
        continue;
      }
      const opcion = result.find(o => o.id === free.id);
      expect(opcion).toBeDefined();
      expect(opcion?.requiereCuenta).toBe(free.requiresKey);
    }
  });

  it('should set enlaceAlta from proveedores.panelClaves', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    for (const prov of PROVEEDORES_CATALOGO) {
      const opcion = result.find(o => o.id === prov.id);
      expect(opcion).toBeDefined();
      const expected = prov.panelClaves === '' ? null : prov.panelClaves;
      expect(opcion?.enlaceAlta).toBe(expected);
    }
  });

  it('should set enlaceClave from free.getKeyUrl', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    for (const free of FREE_CATALOG) {
      const opcion = result.find(o => o.id === free.id);
      expect(opcion).toBeDefined();
      expect(opcion?.enlaceClave).toBe(free.getKeyUrl);
    }
  });

  it('should set variables from proveedores.variables', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    for (const prov of PROVEEDORES_CATALOGO) {
      const opcion = result.find(o => o.id === prov.id);
      expect(opcion).toBeDefined();
      expect(opcion?.variables).toEqual(prov.variables);
    }
  });

  it('should set privacidad for free sources', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    const proveedorIds = new Set(PROVEEDORES_CATALOGO.map(p => p.id));
    for (const free of FREE_CATALOG) {
      if (proveedorIds.has(free.id)) {
        continue;
      }
      const opcion = result.find(o => o.id === free.id);
      expect(opcion).toBeDefined();
      let expected: 'local' | 'nube-sin-retencion' | 'nube-con-retencion' | 'desconocida';
      if (free.privacy === 'local') {
        expected = 'local';
      } else if (free.privacy === 'browser') {
        expected = 'nube-sin-retencion';
      } else if (free.privacy === 'cloud') {
        expected = 'nube-con-retencion';
      } else {
        expected = 'desconocida';
      }
      expect(opcion?.privacidad).toBe(expected);
    }
  });

  it('should set fuente correctamente', () => {
    const result = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    for (const prov of PROVEEDORES_CATALOGO) {
      const opcion = result.find(o => o.id === prov.id);
      expect(opcion).toBeDefined();
      expect(opcion?.fuente).toBe('proveedores-catalogo');
    }
    const proveedorIds = new Set(PROVEEDORES_CATALOGO.map(p => p.id));
    for (const free of FREE_CATALOG) {
      if (proveedorIds.has(free.id)) {
        continue;
      }
      const opcion = result.find(o => o.id === free.id);
      expect(opcion).toBeDefined();
      expect(opcion?.fuente).toBe('free-catalog');
    }
  });
});