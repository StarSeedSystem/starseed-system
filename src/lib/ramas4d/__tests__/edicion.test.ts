import { describe, it, expect } from 'vitest';
import { crearGrafo, type Grafo4D, type Nodo } from '../modelo';
import {
  crearEstadoEdicion,
  anadirRamaHija,
  vincular,
  moverRama,
  deshacer,
  puedeDeshacer,
  puedeEditarNodo,
  type ContextoEdicion,
  type NuevaRama,
} from '../edicion';
import { transmutar, destinosDisponibles, sePuedeTransmutar } from '../transmutar';
import type { DestinosFormato } from '@/lib/conversion/formatos';

function nodo(id: string, extra: Partial<Nodo> = {}): Nodo {
  return {
    id,
    tipo: 'archivo',
    titulo: id,
    formato: 'texto',
    ref: `/${id}`,
    alcance: 'privado',
    dueno: 'ana',
    capas: [],
    t_creado: 1,
    t_actividad: 1,
    peso: 1,
    etiquetas: [],
    ...extra,
  };
}

function grafoCon(...nodos: Nodo[]): Grafo4D {
  const grafo = crearGrafo();
  for (const n of nodos) grafo.nodos.set(n.id, n);
  return grafo;
}

const ana: ContextoEdicion = { usuarioId: 'ana', ahora: 100 };
const rama = (id: string, formato: NuevaRama['formato'] = 'texto'): NuevaRama => ({
  id,
  titulo: id,
  formato,
  ref: `/${id}`,
});

describe('permisos de edición', () => {
  it('el dueño puede editar lo suyo', () => {
    expect(puedeEditarNodo(nodo('mia'), ana)).toBe(true);
  });

  it('nadie más edita lo privado ajeno', () => {
    expect(puedeEditarNodo(nodo('mia'), { usuarioId: 'bob' })).toBe(false);
  });

  it('un grupo con permiso de edición sí puede', () => {
    const delGrupo = nodo('plan', { dueno: 'grupo-x', alcance: 'grupo' });
    expect(puedeEditarNodo(delGrupo, { usuarioId: 'bob', gruposConEdicion: ['grupo-x'] })).toBe(true);
    expect(puedeEditarNodo(delGrupo, { usuarioId: 'carol' })).toBe(false);
  });

  it('añadir a un grupo hereda dueño y alcance del grupo', () => {
    const estado = crearEstadoEdicion(grafoCon(nodo('plan', { dueno: 'grupo-x', alcance: 'grupo' })));
    const r = anadirRamaHija(estado, 'plan', rama('acta'), {
      usuarioId: 'bob',
      gruposConEdicion: ['grupo-x'],
      ahora: 50,
    });
    expect(r.ok).toBe(true);
    const creada = r.estado.grafo.nodos.get('acta')!;
    expect(creada.dueno).toBe('grupo-x');
    expect(creada.alcance).toBe('grupo');
  });

  it('no se añade a lo ajeno sin permiso', () => {
    const estado = crearEstadoEdicion(grafoCon(nodo('mia')));
    const r = anadirRamaHija(estado, 'mia', rama('intrusa'), { usuarioId: 'bob' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('permiso');
  });
});

describe('añadir rama hija de cualquier formato', () => {
  it('cuelga un enlace con arista contiene y actualiza la rama', () => {
    const estado = crearEstadoEdicion(grafoCon(nodo('curso', { tipo: 'carpeta' })));
    const r = anadirRamaHija(estado, 'curso', { ...rama('web', 'enlace'), ref: 'https://x.dev' }, ana);
    expect(r.ok).toBe(true);
    expect(r.estado.grafo.nodos.get('web')?.formato).toBe('enlace');
    expect(r.estado.grafo.aristas).toContainEqual(
      expect.objectContaining({ de: 'curso', a: 'web', tipo: 'contiene' }),
    );
    expect(r.estado.grafo.ramas.get('curso')).toEqual(['web']);
  });

  it('acepta formatos abiertos como app, pizarra o lección', () => {
    const estado = crearEstadoEdicion(grafoCon(nodo('curso', { tipo: 'carpeta' })));
    expect(anadirRamaHija(estado, 'curso', rama('app1', 'app'), ana).ok).toBe(true);
    expect(anadirRamaHija(estado, 'curso', rama('tablero', 'pizarra'), ana).ok).toBe(true);
    const leccion = anadirRamaHija(estado, 'curso', rama('lecc', 'leccion'), ana);
    expect(leccion.estado.grafo.nodos.get('lecc')?.tipo).toBe('leccion');
  });

  it('rechaza id repetido y contenido privado', () => {
    const estado = crearEstadoEdicion(grafoCon(nodo('curso', { tipo: 'carpeta' }), nodo('repe')));
    expect(anadirRamaHija(estado, 'curso', rama('repe'), ana).ok).toBe(false);
    const conContenido = { ...rama('secreta'), contenido: 'no debe ir al grafo' } as unknown as NuevaRama;
    const r = anadirRamaHija(estado, 'curso', conContenido, ana);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('contenido privado');
  });
});

describe('vincular dos nodos', () => {
  it('crea la arista con su tipo', () => {
    const estado = crearEstadoEdicion(grafoCon(nodo('a'), nodo('b')));
    const r = vincular(estado, 'a', 'b', 'usa', ana);
    expect(r.ok).toBe(true);
    expect(r.estado.grafo.aristas).toContainEqual(
      expect.objectContaining({ de: 'a', a: 'b', tipo: 'usa' }),
    );
  });

  it('rechaza duplicados y falta de permiso en el destino', () => {
    const estado = crearEstadoEdicion(grafoCon(nodo('a'), nodo('b'), nodo('ajeno', { dueno: 'bob' })));
    const primera = vincular(estado, 'a', 'b', 'usa', ana);
    expect(primera.ok).toBe(true);
    expect(vincular(primera.estado, 'a', 'b', 'usa', ana).ok).toBe(false);
    expect(vincular(estado, 'a', 'ajeno', 'cita', ana).ok).toBe(false);
  });
});

describe('mover una rama', () => {
  it('la cambia de padre y deja la arista contiene', () => {
    const grafo = grafoCon(nodo('a', { tipo: 'carpeta' }), nodo('b'), nodo('c', { tipo: 'carpeta' }));
    grafo.ramas.set('a', ['b']);
    const r = moverRama(crearEstadoEdicion(grafo), 'b', 'c', ana);
    expect(r.ok).toBe(true);
    expect(r.estado.grafo.ramas.get('a')).toEqual([]);
    expect(r.estado.grafo.ramas.get('c')).toEqual(['b']);
    expect(r.estado.grafo.aristas).toContainEqual(
      expect.objectContaining({ de: 'c', a: 'b', tipo: 'contiene' }),
    );
  });

  it('no deja mover una rama dentro de sí misma', () => {
    const grafo = grafoCon(nodo('a', { tipo: 'carpeta' }), nodo('b', { tipo: 'carpeta' }));
    grafo.ramas.set('a', ['b']);
    const r = moverRama(crearEstadoEdicion(grafo), 'a', 'b', ana);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('sí misma');
  });
});

describe('deshacer', () => {
  it('vuelve al estado anterior y se puede encadenar', () => {
    const estado = crearEstadoEdicion(grafoCon(nodo('curso', { tipo: 'carpeta' })));
    const uno = anadirRamaHija(estado, 'curso', rama('n1'), ana);
    const dos = anadirRamaHija(uno.estado, 'curso', rama('n2'), ana);
    expect(dos.estado.grafo.nodos.size).toBe(3);
    expect(puedeDeshacer(dos.estado)).toBe(true);
    const atras = deshacer(dos.estado);
    expect(atras.grafo.nodos.has('n2')).toBe(false);
    expect(atras.grafo.nodos.has('n1')).toBe(true);
    const cero = deshacer(atras);
    expect(cero.grafo.nodos.size).toBe(1);
    expect(deshacer(cero).grafo.nodos.size).toBe(1);
  });
});

const DESTINOS: DestinosFormato = {
  nombre: 'Markdown',
  ids: ['md'],
  destinos: ['pdf', 'docx', 'pptx'],
  conMotor: ['svg'],
};

describe('transmutar a otra forma', () => {
  const conNota = () => {
    const grafo = grafoCon(nodo('curso', { tipo: 'carpeta' }), nodo('nota', { formato: 'md' }));
    grafo.ramas.set('curso', ['nota']);
    return grafo;
  };

  it('ordena los destinos y dice si se puede', () => {
    expect(destinosDisponibles('md', DESTINOS)).toEqual(['pdf', 'docx', 'pptx']);
    expect(sePuedeTransmutar('md', 'pptx', DESTINOS)).toBe(true);
    expect(sePuedeTransmutar('md', 'svg', DESTINOS)).toBe(false);
  });

  it('cuelga la variante como hermana con arista transmuta', () => {
    const r = transmutar(conNota(), 'nota', 'pptx', DESTINOS, { ahora: 200 });
    expect(r.ok).toBe(true);
    expect(r.nodoId).toBe('nota--pptx');
    expect(r.grafo.nodos.get('nota--pptx')?.formato).toBe('pptx');
    expect(r.grafo.aristas).toContainEqual(
      expect.objectContaining({ de: 'nota', a: 'nota--pptx', tipo: 'transmuta' }),
    );
    expect(r.grafo.ramas.get('curso')).toEqual(['nota', 'nota--pptx']);
  });

  it('si no se puede convertir lo dice y no inventa', () => {
    const grafo = conNota();
    const r = transmutar(grafo, 'nota', 'mp4', DESTINOS);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('no me lo invento');
    expect(r.grafo.nodos.size).toBe(2);
    const sinDatos = transmutar(grafo, 'nota', 'pdf', null);
    expect(sinDatos.ok).toBe(false);
    expect(sinDatos.motivo).toContain('No sé');
  });

  it('usa la salida simulada de la conversión como referencia', () => {
    const r = transmutar(conNota(), 'nota', 'pdf', DESTINOS, {
      idNuevo: 'nota-pdf',
      refSalida: '/convertido/nota.pdf',
    });
    expect(r.ok).toBe(true);
    expect(r.grafo.nodos.get('nota-pdf')?.ref).toBe('/convertido/nota.pdf');
  });
});
