import { describe, it, expect } from 'vitest';
import type { Grafo4D, Nodo } from '../modelo';
import type { Observador } from '../alcance';
import {
  estadoInicial,
  anadirRamaHija,
  vincularNodos,
  moverNodo,
  deshacer,
  puedeEditar,
  type ContextoEdicion,
  type DatosRama,
} from '../edicion';
import {
  planificarTransmutacion,
  transmutarNodo,
  type PuertoConversion,
  type ConsultaConversion,
} from '../transmutar';

function nodo(id: string, dueno = 'yo', alcance: Nodo['alcance'] = 'privado'): Nodo {
  return {
    id,
    tipo: 'archivo',
    titulo: `Nodo ${id}`,
    formato: 'texto',
    ref: `/${id}`,
    alcance,
    dueno,
    capas: [],
    t_creado: 1,
    t_actividad: 1,
    peso: 1,
    etiquetas: [],
  };
}

function grafo(...nodos: Nodo[]): Grafo4D {
  return { nodos: new Map(nodos.map((n) => [n.id, n])), aristas: [], ramas: new Map() };
}

function ctx(observador: Partial<Observador> = {}, permiso?: ContextoEdicion['permiso']): ContextoEdicion {
  return { observador: { id: 'yo', ...observador }, permiso, ahora: 100 };
}

const DATOS: DatosRama = {
  tipo: 'leccion',
  titulo: 'Lección de prueba',
  formato: 'presentacion',
  ref: '/lecciones/1',
};

describe('edicion · añadir rama de cualquier formato', () => {
  it('cuelga un hijo del padre, con arista contiene y en la rama', () => {
    const estado = estadoInicial(grafo(nodo('raiz')));
    const r = anadirRamaHija(estado, 'raiz', DATOS, ctx());
    expect(r.ok).toBe(true);
    expect(r.nodoId).toBeTruthy();
    const hijo = r.estado.grafo.nodos.get(r.nodoId as string);
    expect(hijo?.formato).toBe('presentacion');
    expect(hijo?.dueno).toBe('yo');
    expect(r.estado.grafo.ramas.get('raiz')).toContain(r.nodoId);
    expect(r.estado.grafo.aristas.some((a) => a.de === 'raiz' && a.a === r.nodoId && a.tipo === 'contiene')).toBe(true);
  });

  it('admite archivo, enlace, nota, publicación, app y lección', () => {
    const formatos = ['archivo', 'enlace', 'nota', 'publicacion', 'app', 'leccion'];
    let estado = estadoInicial(grafo(nodo('raiz')));
    formatos.forEach((tipo, i) => {
      const r = anadirRamaHija(estado, 'raiz', { ...DATOS, tipo, titulo: tipo, formato: tipo }, ctx());
      expect(r.ok).toBe(true);
      estado = r.estado;
    });
    expect(estado.grafo.ramas.get('raiz')).toHaveLength(formatos.length);
  });

  it('no muta el estado anterior', () => {
    const estado = estadoInicial(grafo(nodo('raiz')));
    const r = anadirRamaHija(estado, 'raiz', DATOS, ctx());
    expect(estado.grafo.nodos.size).toBe(1);
    expect(r.estado.grafo.nodos.size).toBe(2);
  });
});

describe('edicion · permisos', () => {
  it('el dueño edita lo suyo', () => {
    expect(puedeEditar(nodo('n', 'yo'), ctx())).toBe(true);
  });

  it('un extraño no edita lo privado ajeno', () => {
    const estado = estadoInicial(grafo(nodo('ajeno', 'otro')));
    const r = anadirRamaHija(estado, 'ajeno', DATOS, ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('permiso');
    expect(r.estado.grafo.nodos.size).toBe(1);
  });

  it('un miembro del grupo con permiso de edición sí edita', () => {
    const contexto = ctx({ grupos: ['grupo-a'] }, { grupos: ['grupo-a'] });
    expect(puedeEditar(nodo('n', 'grupo-a', 'grupo'), contexto)).toBe(true);
    const estado = estadoInicial(grafo(nodo('n', 'grupo-a', 'grupo')));
    expect(anadirRamaHija(estado, 'n', DATOS, contexto).ok).toBe(true);
  });

  it('un miembro sin permiso de edición no edita', () => {
    const contexto = ctx({ grupos: ['grupo-a'] });
    expect(puedeEditar(nodo('n', 'grupo-a', 'grupo'), contexto)).toBe(false);
  });
});

describe('edicion · vincular y mover', () => {
  it('vincula dos nodos propios con el tipo de arista elegido', () => {
    const estado = estadoInicial(grafo(nodo('a'), nodo('b')));
    const r = vincularNodos(estado, 'a', 'b', 'cita', ctx());
    expect(r.ok).toBe(true);
    expect(r.estado.grafo.aristas).toContainEqual(
      expect.objectContaining({ de: 'a', a: 'b', tipo: 'cita' })
    );
  });

  it('no vincula un nodo ajeno sin permiso', () => {
    const estado = estadoInicial(grafo(nodo('a'), nodo('b', 'otro')));
    const r = vincularNodos(estado, 'a', 'b', 'usa', ctx());
    expect(r.ok).toBe(false);
    expect(r.estado.grafo.aristas).toHaveLength(0);
  });

  it('mueve una rama a otro padre', () => {
    let estado = estadoInicial(grafo(nodo('raiz'), nodo('otro')));
    estado = anadirRamaHija(estado, 'raiz', DATOS, ctx()).estado;
    const hijoId = estado.grafo.ramas.get('raiz')?.[0] as string;
    const r = moverNodo(estado, hijoId, 'otro', ctx());
    expect(r.ok).toBe(true);
    expect(r.estado.grafo.ramas.get('raiz') ?? []).not.toContain(hijoId);
    expect(r.estado.grafo.ramas.get('otro')).toContain(hijoId);
  });

  it('impide mover un padre dentro de su propio descendiente', () => {
    let estado = estadoInicial(grafo(nodo('raiz')));
    estado = anadirRamaHija(estado, 'raiz', DATOS, ctx()).estado;
    const hijoId = estado.grafo.ramas.get('raiz')?.[0] as string;
    const r = moverNodo(estado, 'raiz', hijoId, ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('descendiente');
  });
});

describe('edicion · deshacer', () => {
  it('deshace la última edición y restaura el grafo', () => {
    const estado = estadoInicial(grafo(nodo('raiz')));
    const editado = anadirRamaHija(estado, 'raiz', DATOS, ctx());
    expect(editado.estado.grafo.nodos.size).toBe(2);
    const vuelta = deshacer(editado.estado);
    expect(vuelta.ok).toBe(true);
    expect(vuelta.estado.grafo.nodos.size).toBe(1);
    expect(vuelta.estado.grafo.ramas.get('raiz')).toBeUndefined();
  });

  it('sin historial avisa y no cambia nada', () => {
    const r = deshacer(estadoInicial(grafo(nodo('raiz'))));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('deshacer');
  });
});

function consulta(destinos: string[], conMotor: string[] = []): ConsultaConversion {
  return {
    disponible: true,
    destinos: { nombre: 'Markdown', ids: ['md'], destinos, conMotor },
  };
}

function puertoFalso(resultado: ConsultaConversion): PuertoConversion {
  return {
    consultarDestinos: async () => resultado,
    convertir: async () => ({ nombre: 'salida.png', formato: 'png' }),
  };
}

describe('transmutar · planificación honesta', () => {
  it('acepta un destino que Filee convierte de verdad', () => {
    const plan = planificarTransmutacion(consulta(['png', 'pdf']).destinos, 'png');
    expect(plan.ok).toBe(true);
    expect(plan.destino).toBe('png');
  });

  it('dice que hace falta un motor opcional y no inventa', () => {
    const plan = planificarTransmutacion(consulta(['png'], ['svg']).destinos, 'svg');
    expect(plan.ok).toBe(false);
    expect(plan.motivo).toContain('motor');
  });

  it('rechaza un destino imposible sin inventarlo', () => {
    const plan = planificarTransmutacion(consulta(['png']).destinos, 'docx');
    expect(plan.ok).toBe(false);
    expect(plan.motivo).toContain('No se puede convertir');
  });

  it('sin lista de destinos tampoco inventa', () => {
    const plan = planificarTransmutacion(null, 'png');
    expect(plan.ok).toBe(false);
    expect(plan.motivo).toBeTruthy();
  });
});

describe('transmutar · rama hermana simulada', () => {
  it('cuelga la nueva forma junto al origen con arista transmuta', async () => {
    let estado = estadoInicial(grafo(nodo('raiz')));
    estado = anadirRamaHija(estado, 'raiz', { ...DATOS, tipo: 'archivo', formato: 'texto' }, ctx()).estado;
    const origenId = estado.grafo.ramas.get('raiz')?.[0] as string;
    const r = await transmutarNodo(estado, {
      origenId,
      destino: 'png',
      archivo: new Blob(['hola']),
      nombre: 'nota.md',
      ctx: ctx(),
      puerto: puertoFalso(consulta(['png'])),
    });
    expect(r.ok).toBe(true);
    expect(r.estado.grafo.ramas.get('raiz')).toContain(r.nodoId);
    expect(r.estado.grafo.aristas.some((a) => a.de === origenId && a.a === r.nodoId && a.tipo === 'transmuta')).toBe(true);
    expect(r.estado.grafo.nodos.get(r.nodoId as string)?.formato).toBe('png');
  });

  it('si no se puede convertir, lo dice y no toca el grafo', async () => {
    const estado = estadoInicial(grafo(nodo('raiz')));
    const r = await transmutarNodo(estado, {
      origenId: 'raiz',
      destino: 'docx',
      archivo: new Blob(['hola']),
      nombre: 'nota.md',
      ctx: ctx(),
      puerto: puertoFalso(consulta(['png'])),
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('No se puede convertir');
    expect(r.estado.grafo.nodos.size).toBe(1);
  });

  it('no transmuta un nodo ajeno sin permiso', async () => {
    const estado = estadoInicial(grafo(nodo('ajeno', 'otro')));
    const r = await transmutarNodo(estado, {
      origenId: 'ajeno',
      destino: 'png',
      archivo: new Blob(['hola']),
      nombre: 'nota.md',
      ctx: ctx(),
      puerto: puertoFalso(consulta(['png'])),
    });
    expect(r.ok).toBe(false);
    expect(r.estado.grafo.nodos.size).toBe(1);
  });
});
