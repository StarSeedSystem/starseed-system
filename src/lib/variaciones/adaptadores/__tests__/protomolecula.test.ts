// Pruebas del adaptador de la Protomolécula para «Variaciones públicas».
// Sin red: el almacén, el reloj y los ids se inyectan (contrato §5).
import { describe, it, expect, beforeEach } from 'vitest';
import { __resetRegistros, familiasRegistradas } from '../../familias';
import {
  crearAdaptadorProtomolecula,
  motivosDeContenidoPrivado,
  registrarAdaptadoresProtomolecula,
  validarPayloadProtomolecula,
  type DepsProtomolecula,
} from '../protomolecula';
import {
  cargarMolecula,
  guardarMolecula,
  type AlmacenLocal,
  type MoleculaGuardada,
} from '@/lib/protomolecula/almacen-moleculas';
import { limpiarRegistro, registrarAtomo } from '@/lib/protomolecula/registro-atomos';

function almacenDePrueba(): AlmacenLocal {
  const datos = new Map<string, string>();
  return {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => { datos.set(k, v); },
    removeItem: (k) => { datos.delete(k); },
  };
}

function moleculaDePrueba(): MoleculaGuardada {
  return {
    id: 'mol-1',
    titulo: 'Mezcla',
    ambito: 'personal',
    capas: [],
    atomos: [{ id: 'a1', herramientaId: 'photocraft', estado: 'activo' }],
    valores: { 'a1::brillo': 0.5 },
    version: 1,
    creadaEn: 10,
    actualizadaEn: 20,
  };
}

function depsDePrueba(almacen: AlmacenLocal): DepsProtomolecula {
  let n = 0;
  return { almacen, ahora: () => 1000, nuevoId: () => `nuevo-${++n}` };
}

describe('adaptador de la Protomolécula', () => {
  beforeEach(() => {
    __resetRegistros();
    limpiarRegistro();
    registrarAtomo({
      herramientaId: 'photocraft',
      nombre: 'PhotoCraft',
      categoria: 'codigo',
      integracion: 'iframe-aislado',
      control: 'ventana',
      parametros: [],
      entradas: [],
      salidas: [],
    });
  });

  it('acepta ids del catálogo y del registro de átomos', () => {
    expect(validarPayloadProtomolecula({ tipo: 'herramienta', herramientaId: 'photocraft' }).ok).toBe(true);
    expect(validarPayloadProtomolecula({ tipo: 'atomo', atomoId: 'photocraft' }).ok).toBe(true);
  });

  it('rechaza ids desconocidos y contenido privado del lienzo', () => {
    expect(validarPayloadProtomolecula({ tipo: 'herramienta', herramientaId: 'inventada' }).ok).toBe(false);
    expect(validarPayloadProtomolecula({ tipo: 'atomo', atomoId: 'no-existe' }).ok).toBe(false);
    const privado = { tipo: 'molecula', molecula: moleculaDePrueba(), contenido: 'lienzo secreto' };
    expect(validarPayloadProtomolecula(privado).ok).toBe(false);
    expect(motivosDeContenidoPrivado({ capas: [{ archivos: ['x'] }] })).toHaveLength(1);
  });

  it('captura la configuración guardada, no el contenido del lienzo', () => {
    const almacen = almacenDePrueba();
    const molecula = moleculaDePrueba();
    expect(guardarMolecula(almacen, molecula)).toBe(true);
    const adaptador = crearAdaptadorProtomolecula(depsDePrueba(almacen))
      .find((a) => a.familia === 'molecula');
    const capturado = adaptador?.capturar('molecula:mol-1#lienzo');
    expect(capturado).toEqual({ tipo: 'molecula', molecula });
    expect(adaptador?.capturar('molecula:no-existe')).toBeNull();
  });

  it('aplicar crea una copia nueva en el lienzo y deshacer la retira', () => {
    const almacen = almacenDePrueba();
    const adaptador = crearAdaptadorProtomolecula(depsDePrueba(almacen))
      .find((a) => a.familia === 'herramienta');
    const validado = adaptador?.validar({
      tipo: 'herramienta', herramientaId: 'photocraft', valores: { fuerza: 0.8 },
    });
    if (!adaptador || !validado?.ok) throw new Error('el payload de prueba debería validar');
    const { deshacer } = adaptador.aplicar('herramienta:photocraft', validado.payload);
    const copia = cargarMolecula(almacen, 'nuevo-2');
    const atomo = copia?.atomos[0];
    expect(atomo && 'herramientaId' in atomo ? atomo.herramientaId : null).toBe('photocraft');
    expect(copia?.valores['nuevo-1::fuerza']).toBe(0.8);
    deshacer();
    expect(cargarMolecula(almacen, 'nuevo-2')).toBeNull();
  });

  it('registra las tres familias en el registro común', () => {
    registrarAdaptadoresProtomolecula(depsDePrueba(almacenDePrueba()));
    expect(familiasRegistradas()).toEqual(expect.arrayContaining(['herramienta', 'atomo', 'molecula']));
  });
});
