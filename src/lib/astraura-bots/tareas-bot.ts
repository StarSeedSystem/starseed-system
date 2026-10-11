export interface EntradaTarea {
  id: string;
  titulo: string;
  descripcion: string;
  director: string;
  origen: string;
  criterios?: CriterioEntrada[];
  pasos?: PasoEntrada[];
  verificaciones?: EstadoVerificacionEntrada[];
}

export interface CriterioEntrada {
  id: string;
  descripcion: string;
  peso: number;
}

export interface PasoEntrada {
  id: string;
  descripcion: string;
  responsableId: string;
}

export interface EstadoVerificacionEntrada {
  verifId: string;
  criterioId: string;
  porTipo: "persona" | "bot" | "pruebas";
  porId: string;
  ok: boolean;
  evidencia: string;
}

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string;
  director: string;
  origen: string;
  criterios: CriterioEntrada[];
  pasos: PasoEntrada[];
  verificaciones: EstadoVerificacionEntrada[];
}

export interface EstadoVerificacion {
  verifId: string;
  criterioId: string;
  porTipo: "persona" | "bot" | "pruebas";
  porId: string;
  ok: boolean;
  evidencia: string;
}

export type EstadoTarea = "en-curso" | "verificando" | "hecha";

export function crearTarea(args: EntradaTarea): Tarea | { problemas: string[] } {
  const problemas: string[] = [];

  if (!args.id || args.id.trim().length === 0) {
    problemas.push("El id de la tarea no puede estar vacío");
  }

  if (!args.titulo || args.titulo.trim().length === 0) {
    problemas.push("El título de la tarea no puede estar vacío");
  }

  if (!args.descripcion || args.descripcion.trim().length === 0) {
    problemas.push("La descripción de la tarea no puede estar vacía");
  }

  if (!args.director || args.director.trim().length === 0) {
    problemas.push("El director de la tarea no puede estar vacío");
  }

  if (!args.origen || args.origen.trim().length === 0) {
    problemas.push("El origen de la tarea no puede estar vacío");
  }

  const criterios = args.criterios || [];
  if (criterios.length > 12) {
    problemas.push("Una tarea solo puede tener un máximo de 12 criterios");
  }

  const pasos = args.pasos || [];

  const verificaciones = args.verificaciones || [];

  if (problemas.length > 0) {
    return { problemas };
  }

  return {
    id: args.id,
    titulo: args.titulo,
    descripcion: args.descripcion,
    director: args.director,
    origen: args.origen,
    criterios,
    pasos,
    verificaciones,
  };
}

export function asignarPasos(
  tarea: Tarea,
  agentes: { id: string; capacidades: string[] }[]
): Paso[] {
  const pasos: Paso[] = [];

  for (const criterio of tarea.criterios) {
    const textoCriterio = `${criterio.descripcion} ${criterio.peso}`.toLowerCase();

    let mejorAgente: { id: string; coincidencias: number } | null = null;
    let maxCoincidencias = 0;

    for (const agente of agentes) {
      let coincidencias = 0;

      for (const palabra of textoCriterio.split(" ").filter((p) => p.length > 0)) {
        for (const capacidad of agente.capacidades) {
          if (capacidad.includes(palabra) || palabra.includes(capacidad)) {
            coincidencias++;
          }
        }
      }

      if (coincidencias > 0 && coincidencias > maxCoincidencias) {
        maxCoincidencias = coincidencias;
        mejorAgente = { id: agente.id, coincidencias };
      }
    }

    if (mejorAgente) {
      const paso: Paso = {
        id: `paso-${criterio.id}`,
        descripcion: `Implementar: ${criterio.descripcion}`,
        responsableId: mejorAgente.id,
      };
      pasos.push(paso);
    } else {
      const paso: Paso = {
        id: `paso-${criterio.id}-director`,
        descripcion: `Implementar: ${criterio.descripcion}`,
        responsableId: tarea.director,
      };
      pasos.push(paso);
    }
  }

  return pasos;
}

export function marcarCriterio(
  estadoVerif: EstadoVerificacion,
  criterio: Criterio,
  por: { tipo: "persona" | "bot" | "pruebas"; id: string },
  ok: boolean,
  evidencia: string
): EstadoVerificacion {
  if (por.tipo === "bot" && por.id === criterio.id) {
    throw new Error("Un bot no puede verificar su propio criterio");
  }

  return {
    verifId: `verif-${criterio.id}-${Date.now()}`,
    criterioId: criterio.id,
    porTipo: por.tipo,
    porId: por.id,
    ok,
    evidencia,
  };
}

export function estadoDe(
  tarea: Tarea,
  verif: EstadoVerificacion
): EstadoTarea {
  const verificacionesConEseCriterio = tarea.verificaciones.filter(
    (v) => v.criterioId === verif.criterioId
  );

  if (verificacionesConEseCriterio.length === 0) {
    return "en-curso";
  }

  const criteriosVerificadosPorUnVerificadorValido = verificarCriterioEsValido(
    verif,
    tarea.verificaciones
  );

  if (criteriosVerificadosPorUnVerificadorValido.length === tarea.criterios.length) {
    return "hecha";
  }

  return "verificando";
}

function verificarCriterioEsValido(
  verif: EstadoVerificacion,
  verificaciones: EstadoVerificacionEntrada[]
): string[] {
  const verificacionesValidas: string[] = [];

  for (const v of verificaciones) {
    if (v.criterioId === verif.criterioId && v.ok) {
      verificacionesValidas.push(v.criterioId);
    }
  }

  return verificacionesValidas;
}
