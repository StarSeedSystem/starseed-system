// Procesos activos: normalizadores de fuentes a ProcesoActivo.
// Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §7.

import { ProcesoActivo, TipoProceso } from "./procesos";
import { compararVersiones } from "../../actualizaciones/manifiesto";

/** Convierte la respuesta de `/api/mando/agentes` a ProcesoActivo[] (tipo génesis). */
export function desdeAgentesMac(r: unknown): ProcesoActivo[] {
  const o = typeof r === "object" && r !== null ? r : {};
  const sesiones = Array.isArray((o as any).sesiones) ? (o as any).sesiones : [];
  const procesos = Array.isArray((o as any).procesos) ? (o as any).procesos : [];
  const result: ProcesoActivo[] = [];

  for (const s of sesiones) {
    if (typeof s !== "object" || s === null) continue;
    const sesion = s as {
      id?: string;
      titulo?: string;
      activa?: boolean;
      ultimaAccion?: string;
      modelo?: string;
    };
    const id = typeof sesion.id === "string" ? sesion.id : "";
    if (!id) continue;
    const nombre = typeof sesion.titulo === "string" ? sesion.titulo : id;
    const estado = sesion.activa === true ? "en-marcha" : "esperando";
    const progreso: number | null = null;
    const donde = ""; // No se proporciona ubicación específica
    const detalle = typeof sesion.ultimaAccion === "string" ? sesion.ultimaAccion : undefined;
    const fuente = "/api/mando/agentes";
    result.push({
      id,
      tipo: "genesis",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
    });
  }

  for (const p of procesos) {
    if (typeof p !== "object" || p === null) continue;
    const proc = p as {
      pid?: number;
      tipo?: "orquestador" | "agente" | "servidor";
      detalle?: string;
    };
    const id = typeof proc.pid === "number" ? `proc-${proc.pid}` : "";
    if (!id) continue;
    const nombre = proc.tipo ?? "proceso";
    const estado = "en-marcha"; // Asumimos que los procesos en la lista están activos
    const progreso: number | null = null;
    const donde = "";
    const detalle = typeof proc.detalle === "string" ? proc.detalle : undefined;
    const fuente = "/api/mando/agentes";
    result.push({
      id,
      tipo: "genesis",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
    });
  }

  return result;
}

/** Convierte la respuesta de `/api/mando/medidores` (latidos[]) a ProcesoActivo[] (tipo génesis). */
export function desdeLatidos(r: unknown): ProcesoActivo[] {
  const o = typeof r === "object" && r !== null ? r : {};
  const latidos = Array.isArray((o as any).latidos) ? (o as any).latidos : [];
  const result: ProcesoActivo[] = [];

  for (const l of latidos) {
    if (typeof l !== "object" || l === null) continue;
    const latido = l as {
      tarea?: string;
      fase?: string;
      modelo?: string;
      minutos?: number;
      donde?: string;
      proveedor?: string;
      quietoSegundos?: number;
      bytesLog?: number;
      cola?: string;
      medio?: string;
      titulo?: string;
      subfase?: string;
      paso?: string;
      pasos?: string;
      tareasDeTanda?: string[];
      trabajador?: number;
      trabajadores?: number;
      latidoHaceS?: number;
      atasco?: { tipo: string; motivo: string; cancelar: boolean };
      pasoViejo?: boolean;
    };
    const tarea = typeof latido.tarea === "string" ? latido.tarea : "";
    if (!tarea) continue;
    // Usamos la tarea como id; si hay múltiples latidos con la misma tarea, se considerarán duplicados y serán manejados por unirProcesos
    const id = tarea;
    const nombre = typeof latido.titulo === "string" ? latido.titulo : latido.tarea;
    const estado = "en-marcha"; // Asumimos que los latidos en la lista representan actividad
    const progreso: number | null = null; // No tenemos medida de progreso real
    const donde = typeof latido.donde === "string" ? latido.donde : "";
    const detalle = `${latido.fase || ""} ${latido.modelo || ""}`.trim();
    const fuente = "/api/mando/medidores";
    result.push({
      id,
      tipo: "genesis",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
    });
  }

  return result;
}

/** Convierte el resultado de `leerEstadoAutonomo()` a ProcesoActivo[] (tipo génesis). */
export function desdeNodos(r: unknown): ProcesoActivo[] {
  const o = typeof r === "object" && r !== null ? r : {};
  const estado = o as {
    modo?: "bus" | "tablas";
    lider?: string | null;
    termino?: number;
    autonomia?: boolean | null;
    nodos?: {
      nodo?: string;
      medio?: string;
      etiqueta?: string;
      modo?: "real" | "seco" | string;
      vivo?: boolean;
      lider?: boolean;
      hace_ms?: number | null;
      puntos?: number | null;
      orquestadores?: string[];
      caidos?: string[];
      disco_gb?: number | null;
      ram_libre_mb?: number | null;
      trabajo?: Record<string, number | null>;
      enCurso?: unknown[];
      contenedor?: unknown;
    }[];
    medidores?: Record<string, string>;
    decisiones?: unknown[];
    ordenes?: unknown[];
    fotoHaceMs?: number | null;
    liderSeco?: boolean;
  };
  const nodos = Array.isArray(estado.nodos) ? estado.nodos : [];
  const result: ProcesoActivo[] = [];

  for (const nodo of nodos) {
    if (typeof nodo !== "object" || nodo === null) continue;
    const n = nodo as {
      nodo?: string;
      medio?: string;
      orquestadores?: string[];
      vivo?: boolean;
    };
    const nodoName = typeof n.nodo === "string" ? n.nodo : "";
    const vivo = n.vivo === true;
    if (!vivo || !nodoName) continue;
    const orquestadores = Array.isArray(n.orquestadores) ? n.orquestadores : [];
    for (const orquestador of orquestadores) {
      if (typeof orquestador !== "string" || !orquestador) continue;
      const id = `${nodoName}:${orquestador}`;
      const nombre = orquestador;
      const estado = "en-marcha"; // Asumimos que los orquestadores en vivo están activos
      const progreso: number | null = null;
      const donde = nodoName;
      const detalle = typeof n.medio === "string" ? n.medio : "";
      const fuente = "leerEstadoAutonomo";
    result.push({
      id,
      tipo: "genesis",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
      desde: null,
    });
    }
  }

  return result;
}

/** Convierte las operaciones 'propuesta' de `leerHistorial()` y propuestas abiertas a ProcesoActivo[] (tipo poligénesis). */
export function desdePoligenesis(r: unknown): ProcesoActivo[] {
  const o = typeof r === "object" && r !== null ? r : {};
  const entradas = Array.isArray((o as any).entradas) ? (o as any).entradas : [];
  const result: ProcesoActivo[] = [];

  for (const e of entradas) {
    if (typeof e !== "object" || e === null) continue;
    const entrada = e as {
      id?: string;
      titulo?: string;
      estado?: "aplicada" | "deshecha" | "propuesta" | "fallida";
      resultado?: string;
      operacion?: unknown;
      donde?: "cuenta" | "aparato";
    };
    const id = typeof entrada.id === "string" ? entrada.id : "";
    if (!id) continue;
    if (entrada.estado !== "propuesta") continue;
    const nombre = typeof entrada.titulo === "string" ? entrada.titulo : id;
    const estado = "esperando"; // Las propuestas están esperando a ser aplicadas
    const progreso: number | null = null;
    const donde = typeof entrada.donde === "string" ? entrada.donde : "";
    const detalle = typeof entrada.resultado === "string" ? entrada.resultado : undefined;
    const fuente = "leerHistorial";
    result.push({
      id,
      tipo: "genesis",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
      desde: null,
    });
  }

  return result;
}

/** Combina `/api/mando/suenos` y `fetchAstraura158DreamStatus` a ProcesoActivo[] (tipo sueño). */
export function desdeSuenos(r: unknown): ProcesoActivo[] {
  const o = typeof r === "object" && r !== null ? r : {};
  const suenosData = (o as any).suenos;
  const dreamStatus = (o as any).dreamStatus;
  const result: ProcesoActivo[] = [];

    // Procesos desde las filas de suenos en estado "analizando"
    if (typeof suenosData === "object" && suenosData !== null) {
      const sesion = (suenosData as any).sesion;
      if (typeof sesion === "object" && sesion !== null) {
        const filas = (sesion as any).filas;
        if (Array.isArray(filas)) {
          for (const f of filas) {
            if (typeof f !== "object" || f === null) continue;
            const fila = f as {
              id?: string;
              area?: string;
              lente?: string;
              estado?: "pendiente" | "analizando" | "informe" | "verificado" | "ajustado" | "rechazado" | "fallo" | "interrumpida";
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
            // Only process filas in "analizando" state
            if (fila.estado !== "analizando") continue;
            const id = typeof fila.id === "string" ? fila.id : "";
            if (!id) continue;
            const nombre = `${fila.area || ""} -- ${fila.lente || ""}`.trim();
            const estado = "en-marcha";
            const progreso: number | null = null;
            const donde = typeof fila.area === "string" ? fila.area : "";
            const detalle = `${fila.lente || ""} ${fila.modelo || ""} ${fila.subfase || ""}`.trim();
            const fuente = "/api/mando/suenos";
    result.push({
      id,
      tipo: "genesis",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
      desde: null,
    });
          }
        }
      }
    }

  // Proceso desde el estado del sueño (si está soñando)
  if (typeof dreamStatus === "object" && dreamStatus !== null) {
    const isDreaming = (dreamStatus as any).is_dreaming === true;
    if (isDreaming) {
      const id = "sueño-general";
      const nombre = "Sueño en curso";
      const estado = "en-marcha";
      const progreso: number | null = null;
      const donde = ""; // No se especifica ubicación
      const detalle = "Sueño profundo activo";
      const fuente = "fetchAstraura158DreamStatus";
    result.push({
      id,
      tipo: "genesis",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
      desde: null,
    });
    }
  }

  return result;
}

/** Combina `fetchAstraura158ImaginationStatus` y `imagine_runs` en curso a ProcesoActivo[] (tipo imaginación). */
export function desdeImaginacion(r: unknown): ProcesoActivo[] {
  const o = typeof r === "object" && r !== null ? r : {};
  const imaginationStatus = (o as any).imaginationStatus;
  const runs = Array.isArray((o as any).runs) ? (o as any).runs : [];
  const result: ProcesoActivo[] = [];

  // Procesos desde las runs en curso
  for (const run of runs) {
    if (typeof run !== "object" || run === null) continue;
    const imagineRun = run as {
      id?: string;
      title?: string;
      status?: "pending" | "running" | "paused" | "done" | "error";
      mode?: "juntos" | "fondo";
      server?: string;
      imagine_id?: string | null;
      ai_config?: unknown;
      steps?: unknown[];
      result?: string | null;
      updated_at?: string;
      created_at?: string;
    };
    const id = typeof imagineRun.id === "string" ? imagineRun.id : "";
    if (!id) continue;
    if (imagineRun.status !== "running") continue;
    const nombre = typeof imagineRun.title === "string" ? imagineRun.title : id;
    const estado = "en-marcha";
    const progreso: number | null = null;
    const donde = typeof imagineRun.server === "string" ? imagineRun.server : "";
    const detalle = `Modo: ${imagineRun.mode || ""}`.trim();
    const fuente = "imagine_runs";
    result.push({
      id,
      tipo: "poligenesis",
      nombre,
      estado,
      progreso: null,
      donde,
      detalle,
      fuente,
      desde: null,
    });
  }

  // Opcional: proceso desde el estado de la imaginación
  if (typeof imaginationStatus === "object" && imaginationStatus !== null) {
    const activeProcesses = (imaginationStatus as any).active_processes_count;
    const activeAgents = (imaginationStatus as any).active_agents_count;
    const isRunning = (typeof activeProcesses === "number" && activeProcesses > 0) ||
                      (typeof activeAgents === "number" && activeAgents > 0);
    if (isRunning) {
      const id = "imaginacion-general";
      const nombre = "Imaginación en curso";
      const estado = "en-marcha";
      const progreso: number | null = null;
      const donde = "";
      const detalle = "Proceso de imaginación activo";
      const fuente = "fetchAstraura158ImaginationStatus";
      result.push({
        id,
        tipo: "sueno",
        nombre,
        estado,
        progreso,
        donde,
        detalle,
        fuente,
        desde: null,
      });
    }
  }

  return result;
}

/** Convierte estados de instalaciones: 'pedida' → descarga, 'descargada' → instalación a ProcesoActivo[]. */
export function desdeInstalaciones(r: unknown): ProcesoActivo[] {
  const lista = Array.isArray(r) ? r : [];
  const result: ProcesoActivo[] = [];

  for (const dest of lista) {
    if (typeof dest !== "object" || dest === null) continue;
    const destino = dest as {
      id?: string;
      appNombre?: string;
      estado?: "pedida" | "descargada" | "instalada" | "cancelada" | "fallida";
      neuronaNombre?: string;
      medio?: "web" | "pwa" | "descarga" | "tienda";
      pedidaDesde?: string;
    };
    const id = typeof destino.id === "string" ? destino.id : "";
    if (!id) continue;
    const appNombre = typeof destino.appNombre === "string" ? destino.appNombre : "";
    let tipo: TipoProceso | null = null;
    let estadoProceso: "en-marcha" | "esperando" | "pausado" | "fallando" = "en-marcha";
    if (destino.estado === "pedida") {
      tipo = "descarga";
    } else if (destino.estado === "descargada") {
      tipo = "instalacion";
    } else {
      // Las demás no son activas, así que no creamos proceso
      continue;
    }
    if (!tipo) continue;
    const progreso: number | null = null;
    const donde = typeof destino.neuronaNombre === "string" ? destino.neuronaNombre : "";
    const detalle = typeof destino.medio === "string" ? destino.medio : "";
    const fuente = "instalaciones";
    result.push({
      id,
      tipo,
      nombre: appNombre || id,
      estado: estadoProceso,
      progreso,
      donde,
      detalle,
      fuente,
      desde: null,
    });
  }

  return result;
}

/** Convierte capas con versión pendiente a ProcesoActivo[] (tipo actualización). */
export function desdeActualizaciones(r: unknown): ProcesoActivo[] {
  const lista = Array.isArray(r) ? r : [];
  const result: ProcesoActivo[] = [];

  for (const capa of lista) {
    if (typeof capa !== "object" || capa === null) continue;
    const pendiente = capa as {
      capa?: "datos" | "interfaz" | "sw" | "servicios" | "modelos" | "nativa";
      tiene?: string | null;
      deberia?: string;
      como?: {
        gesto?: string;
        interrumpe?: boolean;
        reinstala?: boolean;
        pesada?: boolean;
        texto?: string;
      };
    };
    const capaNombre = pendiente.capa;
    if (!capaNombre) continue;
    // Determinar si la capa es pendiente: tiene es null o la versión que tiene es menor a la que debería tener
    const tiene = pendiente.tiene;
    const deberia = pendiente.deberia;
    let esPendiente = false;
    if (tiene === null) {
      esPendiente = true;
    } else if (deberia !== null && typeof tiene === "string" && typeof deberia === "string") {
      // Usar la función de comparación de versiones del manifiesto
      esPendiente = compararVersiones(tiene, deberia) < 0;
    }
    if (!esPendiente) continue;

    // Usamos una combinación de capa y versión deberia como id, para evitar duplicados si aparecen múltiples veces
    const id = `${capaNombre}:${deberia || ""}`;
    const nombre = capaNombre;
    const estado = "en-marcha"; // Asumimos que las capas pendientes necesitan ser aplicadas
    const progreso: number | null = null;
    const donde = ""; // No se proporciona ubicación específica
    let detalle = `Debería: ${deberia || ""}, Tiene: `;
    if (tiene !== null) {
      detalle += tiene;
    }
    const fuente = "actualizaciones";
    result.push({
      id,
      tipo: "actualizacion",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
      desde: null,
    });
  }

  return result;
}

/** Convierte ventanas minimizadas de `readDesktopsSnapshot()` a ProcesoActivo[] (tipo app-fondo). */
export function desdeVentanas(r: unknown): ProcesoActivo[] {
  const o = typeof r === "object" && r !== null ? r : {};
  const desktops = Array.isArray((o as any).desktops) ? (o as any).desktops : [];
  const result: ProcesoActivo[] = [];

  for (const desktop of desktops) {
    if (typeof desktop !== "object" || desktop === null) continue;
    const d = desktop as {
      activeId?: string;
      windows?: {
        id?: string;
        contentRef?: {
          type?: string;
          ref?: string;
          name?: string;
          meta?: Record<string, string | undefined>;
        };
        minimized?: boolean;
        maximized?: boolean;
        fullscreen?: boolean;
        z?: number;
        x?: number;
        y?: number;
        w?: number;
        h?: number;
      }[];
    };
    const windows = Array.isArray(d.windows) ? d.windows : [];
    for (const win of windows) {
      if (typeof win !== "object" || win === null) continue;
      const ventana = win as {
        id?: string;
        contentRef?: {
          type?: string;
          ref?: string;
          name?: string;
          meta?: Record<string, string | undefined>;
        };
        minimized?: boolean;
      };
      const id = typeof ventana.id === "string" ? ventana.id : "";
      if (!id) continue;
      if (ventana.minimized !== true) continue;
      const nombre = ventana.contentRef?.name ?? ventana.contentRef?.ref ?? id;
      const estado = "en-marcha";
      const progreso: number | null = null;
      const donde = ""; // No se proporciona ubicación específica
      const detalle = typeof ventana.contentRef?.type === "string" ? ventana.contentRef.type : "";
      const fuente = "readDesktopsSnapshot";
    result.push({
      id,
      tipo: "app-fondo",
      nombre: typeof nombre === "string" ? nombre : id,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
      desde: null,
    });
    }
  }

  return result;
}

/** Convierte neuronas con `visible === false` a ProcesoActivo[] (tipo app-fondo). */
export function desdePresencia(r: unknown): ProcesoActivo[] {
  const o = typeof r === "object" && r !== null ? r : {};
  const estado = o as {
    conectado?: boolean;
    medios?: {
      n?: string;
      m?: string;
      tipo?: string;
      etiqueta?: string;
      sid?: string;
      plataforma?: string;
      visible?: boolean;
      desde?: string;
      t?: number;
      s?: unknown;
      v?: unknown;
    }[];
  };
  const medios = Array.isArray(estado.medios) ? estado.medios : [];
  const result: ProcesoActivo[] = [];

  for (const medio of medios) {
    if (typeof medio !== "object" || medio === null) continue;
    const m = medio as {
      n?: string;
      m?: string;
      tipo?: string;
      etiqueta?: string;
      visible?: boolean;
    };
    const neuronId = typeof m.n === "string" ? m.n : "";
    const medioId = typeof m.m === "string" ? m.m : "";
    const visible = m.visible === true;
    if (visible) continue; // Solo queremos las que no están visibles
    if (!neuronId || !medioId) continue;
    const id = medioId; // Usamos el id del medio como id del proceso
    const nombre = typeof m.etiqueta === "string" ? m.etiqueta : medioId;
    const estado = "en-marcha";
    const progreso: number | null = null;
    const donde = neuronId;
    const detalle = typeof m.tipo === "string" ? m.tipo : "";
    const fuente = "presenciaActual";
    result.push({
      id,
      tipo: "app-fondo",
      nombre,
      estado,
      progreso,
      donde,
      detalle,
      fuente,
      desde: null,
    });
  }

  return result;
}

/** Une listas de procesos, sin duplicar por id, priorizando los que están en marcha. */
export function unirProcesos(...listas: ProcesoActivo[][]): ProcesoActivo[] {
  const map = new Map<string, ProcesoActivo>();
  for (const lista of listas) {
    for (const p of lista) {
      const existing = map.get(p.id);
      if (!existing) {
        map.set(p.id, p);
      } else {
        // Priorizar el que esté en marcha
        const existingEnMarcha = existing.estado === "en-marcha";
        const newEnMarcha = p.estado === "en-marcha";
        if (newEnMarcha && !existingEnMarcha) {
          map.set(p.id, p);
        }
        // Si ambos están en marcha o ninguno, mantenemos el existente (primero que llegó)
      }
    }
  }
  return Array.from(map.values());
}

/** Agrupa procesos por tipo. */
export function agruparPorTipo(procesos: ProcesoActivo[]): Record<TipoProceso, ProcesoActivo[]> {
  const grupos: Record<TipoProceso, ProcesoActivo[]> = {
    genesis: [],
    poligenesis: [],
    sueno: [],
    imaginacion: [],
    descarga: [],
    instalacion: [],
    actualizacion: [],
    "app-fondo": [],
    servicio: [],
  };
  for (const p of procesos) {
    const tipo = p.tipo;
    if (grupos[tipo]) {
      grupos[tipo].push(p);
    }
  }
  return grupos;
}