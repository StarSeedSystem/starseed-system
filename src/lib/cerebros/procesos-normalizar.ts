import { ProcesoActivo, TipoProceso, EstadoProceso } from './procesos';

export function desdeAgentesMac(r: unknown): ProcesoActivo[] {
  if (r === null || typeof r !== 'object') return [];
  const o = r as { sesiones: unknown; procesos: unknown; generadoEn?: string };
  if (!Array.isArray(o.sesiones) || !Array.isArray(o.procesos)) return [];

  const result: ProcesoActivo[] = [];

  // Procesar sesiones activas
  for (const ses of o.sesiones) {
    if (ses && typeof ses === 'object') {
      const s = ses as { 
        id?: string; 
        titulo?: string; 
        activa?: boolean; 
        carpeta?: string; 
        enlace?: string; 
        inicio?: string; 
        modelo?: string; 
        medio?: string;
      };
      if (s.activa) {
        const inicioSegundos = s.inicio ? Date.parse(s.inicio) / 1000 : null;
        const proceso: ProcesoActivo = {
          id: s.id ?? '',
          tipo: 'genesis',
          nombre: s.titulo ?? '',
          estado: 'en-marcha',
          progreso: null,
          donde: s.carpeta ?? s.enlace ?? '',
          desde: inicioSegundos === null || Number.isNaN(inicioSegundos) ? null : inicioSegundos,
          detalle: s.modelo ?? s.medio ?? undefined,
          fuente: 'mando/agentes/sesion',
        };
        result.push(proceso);
      }
    }
  }

  // Procesar procesos de tipo agente o orquestador
  for (const proc of o.procesos) {
    if (proc && typeof proc === 'object') {
      const p = proc as { 
        pid?: number; 
        tipo?: 'orquestador' | 'agente' | 'servidor'; 
        detalle?: string; 
        desde?: string; 
      };
      if (p.tipo === 'agente' || p.tipo === 'orquestador') {
        const proceso: ProcesoActivo = {
          id: `proc-${p.pid ?? ''}`,
          tipo: 'genesis',
          nombre: p.detalle ?? '',
          estado: 'en-marcha',
          progreso: null,
          donde: '',
          desde: null,
          detalle: `${p.tipo}: ${p.detalle ?? ''}`,
          fuente: 'mando/agentes/proceso',
        };
        result.push(proceso);
      }
    }
  }

  return result;
}

export function desdeLatidos(r: unknown): ProcesoActivo[] {
  if (!Array.isArray(r)) return [];
  const result: ProcesoActivo[] = [];
  for (const item of r) {
    if (item && typeof item === 'object') {
      const l = item as { 
        tarea?: string; 
        titulo?: string; 
        fase?: string; 
        modelo?: string; 
        minutos?: number; 
        donde?: string; 
      };
      const id = l.tarea ?? '';
      if (!id) continue;
      // Determinar estado basado en fase
      let estado: EstadoProceso = 'en-marcha';
      const fase = l.fase?.toLowerCase() ?? '';
      if (fase.includes('esperando')) estado = 'esperando';
      else if (fase.includes('pausado')) estado = 'pausado';
      else if (fase.includes('fallando')) estado = 'fallando';
      const proceso: ProcesoActivo = {
        id,
        tipo: 'genesis',
        nombre: l.titulo ?? l.tarea ?? '',
        estado,
        progreso: null,
        donde: l.donde ?? '',
        desde: null,
        detalle: l.fase ?? l.modelo ?? undefined,
        fuente: 'mando/medidores',
      };
      result.push(proceso);
    }
  }
  return result;
}

export function desdeNodos(r: unknown): ProcesoActivo[] {
  // r is expected to be the result of leerEstadoAutonomo()
  if (r === null || typeof r !== 'object') return [];
  const lect = r as { ok?: boolean; estado?: unknown; motivo?: string };
  if (!lect.ok || !lect.estado) return [];
  const estado = lect.estado as { nodos: unknown; lider?: string; termino?: number; autonomia?: boolean | null; medidores?: unknown; decisiones?: unknown; ordenes?: unknown; fotoHaceMs?: number | null; liderSeco?: boolean };
  if (!Array.isArray(estado.nodos)) return [];
  const result: ProcesoActivo[] = [];
  for (const nodo of estado.nodos) {
    if (nodo && typeof nodo === 'object') {
      const n = nodo as { 
        nodo?: string; 
        medio?: string; 
        etiqueta?: string; 
        modo?: string; 
        vivo?: boolean; 
        lider?: boolean; 
        hace_ms?: number | null; 
        puntos?: number | null; 
        orquestadores?: unknown; 
        caidos?: unknown; 
        disco_gb?: number | null; 
        ram_libre_mb?: number | null; 
        trabajo?: unknown; 
        enCurso?: unknown; 
        contenedor?: unknown; 
      };
      if (n.vivo && Array.isArray(n.orquestadores)) {
        for (const orquesta of n.orquestadores) {
          if (typeof orquesta === 'string' && orquesta.length > 0) {
            const proceso: ProcesoActivo = {
              id: `${n.nodo ?? ''}-${orquesta}`,
              tipo: 'genesis',
              nombre: orquesta,
              estado: 'en-marcha',
              progreso: null,
              donde: n.nodo ?? '',
              desde: null,
              detalle: `${n.medio ?? ''} ${n.etiqueta ?? ''}`.trim() || undefined,
              fuente: 'metagenesis/nodos',
            };
            result.push(proceso);
          }
        }
      }
    }
  }
  return result;
}

export function desdePoligenesis(r: unknown): ProcesoActivo[] {
  // r is expected to be the result of leerHistorial()
  if (r === null || typeof r !== 'object') return [];
  const hist = r as { entradas: unknown; donde?: string };
  if (!Array.isArray(hist.entradas)) return [];
  const result: ProcesoActivo[] = [];
  for (const entrada of hist.entradas) {
    if (entrada && typeof entrada === 'object') {
      const e = entrada as { 
        id?: string; 
        titulo?: string; 
        estado?: string; 
        at?: number; 
        ambito?: unknown; 
        operacion?: unknown; 
        resultado?: string; 
        propuestaId?: string; 
        deshechaEn?: number; 
        inverso?: unknown; 
      };
      if (e.estado === 'propuesta') {
        // Determinar donde basado en ambito
        let donde = '';
        if (e.ambito && typeof e.ambito === 'object') {
          const a = e.ambito as { tipo?: string; entidad?: { slug?: string }; };
          if (a.tipo === 'persona') {
            donde = 'persona';
          } else if (a.tipo === 'entidad' && a.entidad?.slug) {
            donde = a.entidad.slug;
          }
        }
        const proceso: ProcesoActivo = {
          id: e.id ?? '',
          tipo: 'poligenesis',
          nombre: e.titulo ?? '',
          estado: 'en-marcha',
          progreso: null,
          donde,
          desde: e.at ? e.at / 1000 : null, // convert ms to seconds
          detalle: e.resultado ?? undefined,
          fuente: 'genesis/historial',
        };
        result.push(proceso);
      }
    }
  }
  return result;
}

export function desdeSuenos(r: unknown): ProcesoActivo[] {
  if (r === null || typeof r !== 'object') return [];
  const datos = r as { sesiones?: string[]; sesion?: unknown; areas?: unknown; lentes?: unknown };
  const sesion = datos.sesion;
  if (!sesion || typeof sesion !== 'object') return [];
  const s = sesion as { filas: unknown; tokens?: number; completa?: boolean; orquestadorVivo?: boolean; informeFinal?: boolean; informeMd?: string | null; propuesta?: { nombre: string; tareas: number } | null; consolidado?: unknown; ultimoLanzamiento?: unknown };
  if (!Array.isArray(s.filas)) return [];
  const result: ProcesoActivo[] = [];
  for (const fila of s.filas) {
    if (fila && typeof fila === 'object') {
      const f = fila as { 
        id?: string; 
        area?: string; 
        lente?: string; 
        estado?: string; 
        privado?: boolean; 
        modelo?: string; 
        proveedor?: string; 
        subfase?: string; 
        tokens?: number; 
        llamadas?: number; 
        segundos?: number; 
        hallazgos?: number; 
        por?: string; 
        nota?: string; 
      };
      const estado = f.estado ?? '';
      if (estado === 'analizando' || estado === 'verificado' || estado === 'ajustado') {
        const proceso: ProcesoActivo = {
          id: f.id ?? '',
          tipo: 'sueno',
          nombre: `${f.area ?? ''} -- ${f.lente ?? ''}`.trim() || '',
          estado: 'en-marcha',
          progreso: null,
          donde: `${f.area ?? ''} ${f.lente ?? ''}`.trim(),
          desde: null,
          detalle: f.subfase ?? undefined,
          fuente: 'mando/suenos',
        };
        result.push(proceso);
      }
    }
  }
  return result;
}

export function desdeImaginacion(r: unknown): ProcesoActivo[] {
  // We expect r to be an object with the imagination status and the runs
  if (r === null || typeof r !== 'object') return [];
  const data = r as { 
    imaginationStatus?: unknown; 
    runs?: unknown; 
  };
  if (!Array.isArray(data.runs)) return [];
  const runs = data.runs as unknown[];
  const result: ProcesoActivo[] = [];
  for (const run of runs) {
    if (run && typeof run === 'object') {
      const r = run as { 
        id?: string; 
        title?: string; 
        status?: string; 
        created_at?: string; 
        server?: string; 
        mode?: string; 
      };
      if (r.status === 'running') {
        const creadoEnSegundos = r.created_at ? Date.parse(r.created_at) / 1000 : null;
        const proceso: ProcesoActivo = {
          id: r.id ?? '',
          tipo: 'imaginacion',
          nombre: r.title ?? '',
          estado: 'en-marcha',
          progreso: null,
          donde: r.server ?? '',
          desde: creadoEnSegundos === null || Number.isNaN(creadoEnSegundos) ? null : creadoEnSegundos,
          detalle: `${r.mode ?? ''} ${r.server ?? ''}`.trim() || undefined,
          fuente: 'aurora/imagine_runs',
        };
        result.push(proceso);
      }
    }
  }
  return result;
}

export function desdeInstalaciones(r: unknown): ProcesoActivo[] {
  if (!Array.isArray(r)) return [];
  const result: ProcesoActivo[] = [];
  for (const item of r) {
    if (item && typeof item === 'object') {
      const d = item as { 
        id?: string; 
        appNombre?: string; 
        estado?: string; 
        creada?: number; 
        carpeta?: string; 
        medio?: string; 
      };
      let tipoProceso: TipoProceso | null = null;
      if (d.estado === 'pedida') {
        tipoProceso = 'descarga';
      } else if (d.estado === 'descargada') {
        tipoProceso = 'instalacion';
      }
      if (tipoProceso) {
        const creadoSegundos = d.creada ? d.creada / 1000 : null;
        const proceso: ProcesoActivo = {
          id: d.id ?? '',
          tipo: tipoProceso,
          nombre: d.appNombre ?? '',
          estado: 'en-marcha',
          progreso: null,
          donde: d.carpeta ?? '',
          desde: creadoSegundos === null || Number.isNaN(creadoSegundos) ? null : creadoSegundos,
          detalle: d.medio ?? undefined,
          fuente: 'instalaciones/store',
        };
        result.push(proceso);
      }
    }
  }
  return result;
}

export function desdeActualizaciones(r: unknown): ProcesoActivo[] {
  if (!Array.isArray(r)) return [];
  const result: ProcesoActivo[] = [];
  for (const item of r) {
    if (item && typeof item === 'object') {
      const f = item as { 
        id?: string; 
        instalada?: string; 
        remota?: string | null; 
        estado?: string; 
        fecha?: string | null; 
        upstream?: string; 
      };
      if (f.estado === 'hay-actualizacion') {
        const fechaSegundos = f.fecha ? Date.parse(f.fecha) / 1000 : null;
        const proceso: ProcesoActivo = {
          id: f.id ?? '',
          tipo: 'actualizacion',
          nombre: f.id ?? '',
          estado: 'en-marcha',
          progreso: null,
          donde: f.upstream ?? '',
          desde: fechaSegundos === null || Number.isNaN(fechaSegundos) ? null : fechaSegundos,
          detalle: f.estado ?? undefined,
          fuente: 'library/actualizaciones',
        };
        result.push(proceso);
      }
    }
  }
  return result;
}

export function desdeVentanas(r: unknown): ProcesoActivo[] {
  if (r === null || typeof r !== 'object') return [];
  const state = r as { desktops: unknown; activeId?: string; snap?: boolean; savedAt?: number };
  if (!Array.isArray(state.desktops)) return [];
  const result: ProcesoActivo[] = [];
  for (const desktop of state.desktops) {
    if (desktop && typeof desktop === 'object') {
      const d = desktop as { 
        id?: string; 
        name?: string; 
        icons?: unknown; 
        windows?: unknown; 
        view?: unknown; 
        tiling?: unknown; 
        pageCount?: number; 
        activePage?: number; 
      };
      if (Array.isArray(d.windows)) {
        for (const win of d.windows) {
          if (win && typeof win === 'object') {
            const w = win as { 
              id?: string; 
              contentRef?: unknown; 
              minimized?: boolean; 
              maximized?: boolean; 
              fullscreen?: boolean; 
              prev?: unknown; 
              z?: number; 
              x?: number; 
              y?: number; 
              w?: number; 
              h?: number; 
            };
            if (w.minimized) {
              const proceso: ProcesoActivo = {
                id: w.id ?? '',
                tipo: 'app-fondo',
                nombre: '',
                estado: 'en-marcha',
                progreso: null,
                donde: d.name ?? '',
                desde: state.savedAt ? state.savedAt / 1000 : null,
                detalle: '',
                fuente: 'desktop/store',
              };
              result.push(proceso);
            }
          }
        }
      }
    }
  }
  return result;
}

export function desdePresencia(r: unknown): ProcesoActivo[] {
  if (r === null || typeof r !== 'object') return [];
  const presencia = r as { conectado?: boolean; medios?: unknown };
  if (!Array.isArray(presencia.medios)) return [];
  const result: ProcesoActivo[] = [];
  for (const medio of presencia.medios) {
    if (medio && typeof medio === 'object') {
      const m = medio as { 
        n?: string; 
        m?: string; 
        etiqueta?: string; 
        tipo?: string; 
        visible?: boolean; 
        t?: number; 
        s?: unknown; 
        v?: unknown; 
        sid?: string; 
        plataforma?: string; 
        desde?: string; 
      };
      if (m.visible === false) {
        const proceso: ProcesoActivo = {
          id: m.m ?? '',
          tipo: 'app-fondo',
          nombre: m.etiqueta ?? '',
          estado: 'en-marcha',
          progreso: null,
          donde: m.n ?? '',
          desde: m.t ? m.t / 1000 : null,
          detalle: m.tipo ?? undefined,
          fuente: 'neurons/presencia',
        };
        result.push(proceso);
      }
    }
  }
  return result;
}



export function unirProcesos(...listas: ProcesoActivo[][]): ProcesoActivo[] {
  const all = listas.flat();
  const seen = new Set<string>();
  const unique = all.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  // Sort: en-marcha first
  unique.sort((a, b) => {
    if (a.estado === 'en-marcha' && b.estado !== 'en-marcha') return -1;
    if (a.estado !== 'en-marcha' && b.estado === 'en-marcha') return 1;
    return 0;
  });
  return unique;
}

export function agruparPorTipo(procesos: ProcesoActivo[]): Partial<Record<TipoProceso, ProcesoActivo[]>> {
  const map = new Map<TipoProceso, ProcesoActivo[]>();
  for (const p of procesos) {
    if (!map.has(p.tipo)) {
      map.set(p.tipo, []);
    }
    map.get(p.tipo)!.push(p);
  }
  return Object.fromEntries(map) as Partial<Record<TipoProceso, ProcesoActivo[]>>;
}