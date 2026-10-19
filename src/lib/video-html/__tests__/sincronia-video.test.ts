import { describe, it, expect } from 'vitest';
import { elementosDeParches, parchesDeEstado, type Parche } from '../sincronia-video';
import { fusionarEstados, type EstadoSala } from '@/lib/salas/sincronia-sala';

describe('sincronia-video', () => {
  describe('elementosDeParches', () => {
    it('should convert add patch to ElementoSala', () => {
      const parches: Parche[] = [
        { op: 'add', path: '/titulo/texto', value: 'Hola mundo' }
      ];
      const autor = 'device1';
      const t = 1000;
      const elementos = elementosDeParches(parches, autor, t);
      expect(elementos).toHaveLength(1);
      const el = elementos[0];
      expect(el.id).toBe('titulo::texto');
      expect(el.tipo).toBe('titulo');
      expect(el.datos).toEqual({ texto: 'Hola mundo' });
      expect(el.actualizadoEn).toBe(t);
      expect(el.porDispositivo).toBe(autor);
      expect(el.borrado).toBeFalsy();
    });

    it('should convert replace patch to ElementoSala', () => {
      const parches: Parche[] = [
        { op: 'replace', path: '/titulo/texto', value: 'Otro texto' }
      ];
      const autor = 'device2';
      const t = 2000;
      const elementos = elementosDeParches(parches, autor, t);
      expect(elementos).toHaveLength(1);
      const el = elementos[0];
      expect(el.id).toBe('titulo::texto');
      expect(el.tipo).toBe('titulo');
      expect(el.datos).toEqual({ texto: 'Otro texto' });
      expect(el.actualizadoEn).toBe(t);
      expect(el.porDispositivo).toBe(autor);
      expect(el.borrado).toBeFalsy();
    });

    it('should convert remove patch to ElementoSala with borrado true', () => {
      const parches: Parche[] = [
        { op: 'remove', path: '/titulo/texto' }
      ];
      const autor = 'device3';
      const t = 3000;
      const elementos = elementosDeParches(parches, autor, t);
      expect(elementos).toHaveLength(1);
      const el = elementos[0];
      expect(el.id).toBe('titulo::texto');
      expect(el.tipo).toBe('titulo');
      expect(el.datos).toEqual({});
      expect(el.actualizadoEn).toBe(t);
      expect(el.porDispositivo).toBe(autor);
      expect(el.borrado).toBeTruthy();
    });

    it('should ignore malformed paths', () => {
      const parches: Parche[] = [
        { op: 'add', path: '/titulo', value: 'test' }, // missing property
        { op: 'add', path: '', value: 'test' },
        { op: 'add', path: '/titulo/texto/extra', value: 'test' }, // too many segments
      ];
      const autor = 'device1';
      const t = 1000;
      const elementos = elementosDeParches(parches, autor, t);
      expect(elementos).toHaveLength(0);
    });

    it('should handle multiple patches', () => {
      const parches: Parche[] = [
        { op: 'add', path: '/titulo/texto', value: 'Título' },
        { op: 'add', path: '/descripcion/texto', value: 'Descripción' },
        { op: 'remove', path: '/titulo/texto' }
      ];
      const autor = 'device1';
      const t = 1000;
      const elementos = elementosDeParches(parches, autor, t);
      expect(elementos).toHaveLength(3);
      // Check each element
      const tituloAdd = elementos.find(e => e.id === 'titulo::texto' && !e.borrado);
      expect(tituloAdd).toBeDefined();
      expect(tituloAdd?.datos).toEqual({ texto: 'Título' });
      const descAdd = elementos.find(e => e.id === 'descripcion::texto' && !e.borrado);
      expect(descAdd).toBeDefined();
      expect(descAdd?.datos).toEqual({ texto: 'Descripción' });
       const tituloRemove = elementos.find(e => e.id === 'titulo::texto' && e.borrado);
       expect(tituloRemove).toBeDefined();
       expect(tituloRemove!.datos).toEqual({});
    });
  });

  describe('parchesDeEstado', () => {
    it('should convert non-borrado elements to replace patches', () => {
      const estado: EstadoSala = {
        salaId: 'sala1',
        elementos: {
          'titulo::texto': {
            id: 'titulo::texto',
            tipo: 'titulo',
            datos: { texto: 'Hola' },
            actualizadoEn: 1000,
            porDispositivo: 'device1',
            borrado: false
          }
        },
        reloj: 1000
      };
      const origen = '@hyperframes/sdk:applyPatches';
      const parches = parchesDeEstado(estado, origen);
      expect(parches).toHaveLength(1);
      const p = parches[0];
      expect(p.op).toBe('replace');
      expect(p.path).toBe('/titulo/texto');
      expect(p.value).toBe('Hola');
    });

    it('should convert borrado elements to remove patches', () => {
      const estado: EstadoSala = {
        salaId: 'sala1',
        elementos: {
          'titulo::texto': {
            id: 'titulo::texto',
            tipo: 'titulo',
            datos: {},
            actualizadoEn: 1000,
            porDispositivo: 'device1',
            borrado: true
          }
        },
        reloj: 1000
      };
      const origen = '@hyperframes/sdk:applyPatches';
      const parches = parchesDeEstado(estado, origen);
      expect(parches).toHaveLength(1);
      const p = parches[0];
      expect(p.op).toBe('remove');
      expect(p.path).toBe('/titulo/texto');
      expect(p.value).toBeUndefined();
    });

    it('should ignore malformed ids', () => {
      const estado: EstadoSala = {
        salaId: 'sala1',
        elementos: {
          'titulo': { // missing ::
            id: 'titulo',
            tipo: 'titulo',
            datos: { texto: 'Hola' },
            actualizadoEn: 1000,
            porDispositivo: 'device1',
            borrado: false
          },
          '::texto': {
            id: '::texto',
            tipo: '',
            datos: { texto: 'Hola' },
            actualizadoEn: 1000,
            porDispositivo: 'device1',
            borrado: false
          }
        },
        reloj: 1000
      };
      const origen = '@hyperframes/sdk:applyPatches';
      const parches = parchesDeEstado(estado, origen);
      expect(parches).toHaveLength(0);
    });

    it('should handle multiple elements', () => {
      const estado: EstadoSala = {
        salaId: 'sala1',
        elementos: {
          'titulo::texto': {
            id: 'titulo::texto',
            tipo: 'titulo',
            datos: { texto: 'Título' },
            actualizadoEn: 1000,
            porDispositivo: 'device1',
            borrado: false
          },
          'descripcion::texto': {
            id: 'descripcion::texto',
            tipo: 'descripcion',
            datos: { texto: 'Descripción' },
            actualizadoEn: 1000,
            porDispositivo: 'device1',
            borrado: false
          },
          'titulo::color': {
            id: 'titulo::color',
            tipo: 'titulo',
            datos: { color: '#ff0000' },
            actualizadoEn: 1000,
            porDispositivo: 'device1',
            borrado: true
          }
        },
        reloj: 1000
      };
      const origen = '@hyperframes/sdk:applyPatches';
      const parches = parchesDeEstado(estado, origen);
      expect(parches).toHaveLength(3);
      // Check we have the expected patches
      const replaceTituloTexto = parches.find(p => p.op === 'replace' && p.path === '/titulo/texto' && p.value === 'Título');
      expect(replaceTituloTexto).toBeDefined();
      const replaceDescripcionTexto = parches.find(p => p.op === 'replace' && p.path === '/descripcion/texto' && p.value === 'Descripción');
      expect(replaceDescripcionTexto).toBeDefined();
      const removeTituloColor = parches.find(p => p.op === 'remove' && p.path === '/titulo/color');
      expect(removeTituloColor).toBeDefined();
    });
  });

  describe('integration with fusionarEstados', () => {
    it('should correctly convert patches to elements, fuse them, and convert back to patches', () => {
      // Simulate two devices making concurrent changes
      const autor1 = 'device1';
      const autor2 = 'device2';
      const t1 = 1000;
      const t2 = 1000; // same time, so device id will break tie

      // Device 1 adds titulo/texto
      const parches1: Parche[] = [
        { op: 'add', path: '/titulo/texto', value: 'Título inicial' }
      ];
      const elementos1 = elementosDeParches(parches1, autor1, t1);

      // Device 2 removes titulo/texto
      const parches2: Parche[] = [
        { op: 'remove', path: '/titulo/texto' }
      ];
      const elementos2 = elementosDeParches(parches2, autor2, t2);

      // Initial state (empty)
      let estado: EstadoSala = {
        salaId: 'sala1',
        elementos: {},
        reloj: 0
      };

      // Fuse elements from device 1
      const resultado1 = fusionarEstados(estado, {
        salaId: 'sala1',
        elementos: Object.fromEntries(elementos1.map(e => [e.id, e])),
        reloj: t1
      }, 'server'); // miDispositivo is server (not one of the devices)
      estado = resultado1.resultado;

      // Fuse elements from device 2
      const resultado2 = fusionarEstados(estado, {
        salaId: 'sala1',
        elementos: Object.fromEntries(elementos2.map(e => [e.id, e])),
        reloj: t2
      }, 'server');
      estado = resultado2.resultado;

      // After fusion, since times are equal and device1 < device2 alphabetically, device1 wins.
      // Therefore, the add (from device1) wins over the remove (from device2).
      // So the element should not be borrado.
      const tituloElement = estado.elementos['titulo::texto'];
      expect(tituloElement).toBeDefined();
      expect(tituloElement?.borrado).toBeFalsy(); // Expect not borrado

      // Now convert the fused state back to patches
      const origen = '@hyperframes/sdk:applyPatches';
      const parches = parchesDeEstado(estado, origen);
      expect(parches).toHaveLength(1);
      const p = parches[0];
      expect(p.op).toBe('replace'); // Because it's not borrado, we generate a replace
      expect(p.path).toBe('/titulo/texto');
      expect(p.value).toBe('Título inicial');
    });
  });
});