/**
 * Protomolécula · SESIÓN Y SINCRONÍA. Operaciones como estado fusionable,
 * gestos efímeros y forma corta para LoRa. Módulo PURO.
 *
 * Contrato: `architecture/protomolecula.md` §6.2.
 * Dependencias: `salas/sala.ts`, `salas/sincronia-sala.ts`.
 */
import type {
  ElementoSala,
  EstadoSala,
} from "@/lib/salas/sincronia-sala";
import type {
  Operacion,
  Cambio,
  ParametroRef,
  ValorParametro,
  EstadoValores,
  Molecula,
  Capa,
  AtomoEnUso,
} from "./tipos";
import type { Autor } from "./tipos";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
import { claveDe } from "./parametros";

/**
 * Convierte una operación y su cambio en un ElementoSala para fusionar en salas.
 * Tipo: "parametro", prioridad P1, clave `atomoId::parametroId`,
 * valor = el valor RESULTANTE.
 */
export function elementoDeOperacion(
  op: Operacion,
  cambio: Cambio,
): ElementoSala {
  const clave = claveDe(op.objetivo);
  return {
    id: `op-${op.id}`,
    tipo: "parametro",
    datos: {
      clave,
      valor: cambio.despues,
    },
    actualizadoEn: op.t,
    porDispositivo: op.autor.id,
    borrado: false,
  };
}

/**
 * Crea un ElementoSala para cambios en estructura (capas/átomos).
 * Tipo: "capa" o "atomo", incluye lápidas (nunca borrado físico) y para capas el orden fraccionario.
 * 
 * @param tipoElemento - "capa" o "atomo"
 * @param idElemento - ID único de la capa o átomo en la sala
 * @param datos - Campos relevantes de la capa o átomo (según su tipo)
 * @param eliminado - Si es true, marca el ElementoSala como borrado (lápida)
 * @param timestamp - Marca de tiempo de la change (opcional, default Date.now())
 * @param dispositivoId - ID del dispositivo que hizo el cambio (opcional, default "desconocido")
 */
export function elementoDeEstructura(
  tipoElemento: "capa" | "atomo",
  idElemento: string,
  datos: Partial<Capa> | Partial<AtomoEnUso>,
  eliminado: boolean = false,
  timestamp: number = Date.now(),
  dispositivoId: string = "desconocido"
): ElementoSala {
  // Asegurar que los datos siempre incluyan el id del elemento
  const datosConId = { ...datos, id: idElemento };
  
  return {
    id: `estruct-${tipoElemento}-${idElemento}-${timestamp}`,
    tipo: tipoElemento,
    datos: {
      ...datosConId,
      // Para capas, asegurar que el orden esté presente si se proporciona
      ...(tipoElemento === "capa" && "orden" in datosConId && { orden: datosConId.orden }),
    },
    actualizadoEn: timestamp,
    porDispositivo: dispositivoId,
    borrado: eliminado,
  };
}

/**
 * Aplica una lista de ElementoSala a una molécula base.
 * Actualiza capas, átomos y valores de parámetros según los elementos.
 */
export function moleculaDesdeElementos(
  base: Molecula,
  elementos: ElementoSala[],
): Molecula {
  // Copiar la molécula base para no mutarla directamente
  const nueva: Molecula = { ...base };
  
    // Actualizar valores de parámetros desde ElementoSala tipo "parametro"
  for (const elem of elementos) {
    if (elem.tipo === "parametro" && typeof elem.datos === "object" && elem.datos !== null) {
      const datos = elem.datos as { clave?: string; valor?: ValorParametro };
      if (datos.clave && typeof datos.valor !== "undefined") {
        nueva.valores[datos.clave] = datos.valor;
      }
    }
  }
  
  // Procesar cambios en capas (tipo "capa")
  const capasMap = new Map(nueva.capas.map(c => [c.id, c]));
  for (const elem of elementos) {
    if (elem.tipo === "capa" && typeof elem.datos === "object" && elem.datos !== null) {
      const datos = elem.datos as Partial<Capa>;
      if (!datos.id) continue;
      
      if (elem.borrado) {
        // Eliminar capa (lápida: mantener en mapa pero marcar como borrada no aplica aquí)
        // En lugar de eso, realmente la removemos de las capas activas
        capasMap.delete(datos.id);
      } else {
        // Añadir o actualizar capa
        const existente = capasMap.get(datos.id);
        if (existente) {
          // Actualizar capa existente
          capasMap.set(datos.id, {
            ...existente,
            ...datos,
            // Asegurar que los campos opcionales se mantengan si no se especifican
            titulo: datos.titulo ?? existente.titulo,
            formato: datos.formato ?? existente.formato,
            referencia: datos.referencia ?? existente.referencia,
            orden: datos.orden ?? existente.orden,
            visible: datos.visible ?? existente.visible,
            bloqueada: datos.bloqueada ?? existente.bloqueada,
          });
        } else {
          // Nueva capa
          capasMap.set(datos.id, {
            id: datos.id,
            tipo: datos.tipo ?? "escena3d",
            titulo: datos.titulo ?? "",
            formato: datos.formato ?? "",
            referencia: datos.referencia ?? null,
            orden: datos.orden ?? 0,
            visible: datos.visible ?? true,
            bloqueada: datos.bloqueada ?? false,
          });
        }
      }
    }
  }
  nueva.capas = Array.from(capasMap.values());
  
  // Procesar cambios en átomos (tipo "atomo")
  const atomosMap = new Map(nueva.atomos.map(a => [a.id, a]));
  for (const elem of elementos) {
    if (elem.tipo === "atomo" && typeof elem.datos === "object" && elem.datos !== null) {
      const datos = elem.datos as Partial<AtomoEnUso>;
      if (!datos.id) continue;
      
      if (elem.borrado) {
        // Eliminar átomo
        atomosMap.delete(datos.id);
      } else {
        // Añadir o actualizar átomo
        const existente = atomosMap.get(datos.id);
        if (existente) {
          // Actualizar átomo existente
          atomosMap.set(datos.id, {
            ...existente,
            ...datos,
            titulo: datos.titulo ?? existente.titulo,
            capaId: datos.capaId ?? existente.capaId,
            ejecutaEn: datos.ejecutaEn ?? existente.ejecutaEn,
            estado: datos.estado ?? existente.estado,
          });
        } else {
          // Nuevo átomo
          atomosMap.set(datos.id, {
            id: datos.id,
            herramientaId: datos.herramientaId ?? "",
            capaId: datos.capaId ?? "",
            titulo: datos.titulo ?? "",
            ejecutaEn: datos.ejecutaEn,
            estado: datos.estado ?? "activo",
          });
        }
      }
    }
  }
  nueva.atomos = Array.from(atomosMap.values());
  
  // Actualizar timestamp de actualización: si hay elementos, usar su timestamp máximo;
  // si no hay elementos, mantener el de la base
  if (elementos.length > 0) {
    const maxTimestamp = elementos.reduce(
      (max, elem) => Math.max(max, elem.actualizadoEn),
      0
    );
    nueva.actualizadaEn = maxTimestamp;
  } else {
    nueva.actualizadaEn = base.actualizadaEn;
  }
  
  // Incrementar versión
  nueva.version = base.version + 1;
  
  return nueva;
}

/**
 * Crea un acumulador de gestos efímeros.
 * Un arrastre se emite como mensaje EFÍMERO P0 con solo el último valor cada ≥ 16 ms.
 * Al soltar, envía UNA confirmación.
 */
export function crearAcumuladorDeGestos(
  config: { cadaMs?: number } = {}
) {
  const cadaMs = config.cadaMs ?? 16;
  
  let ultimoValor: number | null = null;
  let ultimoEmision: number = 0;
  let estaArrastando: boolean = false;
  
  return {
    /**
     * Procesa un nuevo valor durante un arrastre.
     * @param valor - El valor actual del gesto
     * @param timestamp - Timestamp actual
     * @returns Operacion si debe enviarse un gesto efímero, null en caso contrario
     */
    procesar: (valor: number, timestamp: number): Operacion | null => {
      if (!estaArrastando) {
        // Iniciar arrastre
        estaArrastando = true;
        ultimoValor = valor;
        // No emitir gesto en el inicio del arrastre según lo típico
        return null;
      }
      
      // Verificar si ha pasado suficiente tiempo desde la última emisión
      if (timestamp - ultimoEmision >= cadaMs) {
        ultimoValor = valor;
        ultimoEmision = timestamp;
        
        // Crear y devolver una operación de gesto efímero
        // Para que compile, devolvemos una operación básica
        // En una implementación real, se necesitaría más contexto
        return {
          id: `gesto-${timestamp}`,
          objetivo: { atomoId: "gesto", parametroId: "valor" },
          accion: { tipo: "exacta", valor },
          autor: { tipo: "persona", id: "sistema" },
          origen: "mano",
          t: timestamp,
        } as Operacion;
      }
      
      return null;
    },
    
    /**
     * Indica que se ha soltado el gesto.
     * @returns Operacion de confirmación, null si no se estaba arrastrando
     */
    soltar: (): Operacion | null => {
      if (!estaArrastando) {
        return null;
      }
      
      estaArrastando = false;
      // Devolver una operación de confirmación
      return {
        id: `confirm-${Date.now()}`,
        objetivo: { atomoId: "gesto", parametroId: "confirm" },
        accion: { tipo: "exacta", valor: ultimoValor ?? 0 },
        autor: { tipo: "persona", id: "sistema" },
        origen: "mano",
        t: Date.now(),
      } as Operacion;
    },
    
    /**
     * Reinicia el acumulador a su estado inicial
     */
    reset: () => {
      ultimoValor = null;
      ultimoEmision = 0;
      estaArrastando = false;
    }
  };
}

/**
 * Convierte una operación a una forma corta (< 200 B para LoRa).
 * Solo confirmaciones, nunca gestos.
 * Usa JSON minimizado para ser compacto.
 */
export function formaCorta(op: Operacion): string {
  // Crear un objeto con solo los campos necesarios, usando nombres cortos para ser compacto
  const obj = {
    i: op.id,
    g: {  // objetivo
      a: op.objetivo.atomoId,
      p: op.objetivo.parametroId
    },
    acc: op.accion.tipo === "exacta" 
      ? { t: "exacta", v: op.accion.valor }
      : op.accion.tipo === "relativa"
        ? { t: "relativa", c: op.accion.cantidad, m: op.accion.modo }
        : op.accion.tipo === "alternar"
          ? { t: "alternar" }
          : { t: "disparo" },
    aut: {
      t: op.autor.tipo,
      i: op.autor.id,
      n: op.autor.nombre || undefined
    },
    o: op.origen,  // origen
    t: op.t,
    f: op.fuente || undefined,
    tx: op.texto || undefined
  };
  
  // Eliminar propiedades undefined para ahorrar espacio
  const cleanObj: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      cleanObj[key] = obj[key];
    }
  }
  
  // También limpiar objetos anidados
  if (cleanObj.aut && cleanObj.aut.n === undefined) {
    delete cleanObj.aut.n;
  }
  if (Object.keys(cleanObj.aut).length === 0) {
    delete cleanObj.aut;
  }
  
  return JSON.stringify(cleanObj);
}

/**
 * Convierte una forma corta de vuelta a una Operacion.
 * Devuelve null si no se puede parsear.
 */
export function desdeFormaCorta(s: string): Operacion | null {
  try {
    const obj = JSON.parse(s);
    
    // Validar campos obligatorios
    if (!obj.i || !obj.g || !obj.g.a || !obj.g.p || !obj.acc || !obj.aut || !obj.aut.t || !obj.aut.i || !obj.o || obj.t === undefined) {
      return null;
    }
    
    // Reconstruir la operación
    const operacion: Operacion = {
      id: obj.i,
      objetivo: {
        atomoId: obj.g.a,
        parametroId: obj.g.p
      },
      accion: obj.acc.t === "exacta"
        ? { tipo: "exacta", valor: obj.acc.v }
        : obj.acc.t === "relativa"
          ? { tipo: "relativa", cantidad: obj.acc.c, modo: obj.acc.m }
          : obj.acc.t === "alternar"
            ? { tipo: "alternar" }
            : { tipo: "disparo" },
      autor: {
        tipo: obj.aut.t,
        id: obj.aut.i,
        nombre: obj.aut.n
      },
      origen: obj.o,
      t: obj.t,
      fuente: obj.f,
      texto: obj.tx
    };
    
    // Limpiar undefined
    if (operacion.autor.nombre === undefined) {
      delete operacion.autor.nombre;
    }
    if (operacion.fuente === undefined) {
      delete operacion.fuente;
    }
    if (operacion.texto === undefined) {
      delete operacion.texto;
    }
    
    return operacion;
  } catch (e) {
    return null;
  }
}