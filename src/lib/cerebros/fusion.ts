/**
 * Plan puro de fusión de cerebros (CB1013B).
 *
 * Contrato: architecture/cerebros-fusion-telepatia.md §4.
 * Módulo PURO: sin Supabase, sin `window`, sin `node:*`.
 * Solo `import type` de `@/lib/brains/brains`.
 */

import type { Brain, BrainIncludes, BrainServer, BrainPermission } from "@/lib/brains/brains";

/** Archivo de memoria de un cerebro. */
export interface ArchivoMemoria {
  id?: string;
  brain_id: string;
  name: string;
  content: string;
  updated_at?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Preferencias por cerebro (clave → valor). La clave real es `starseed.brain.<id>.<sufijo>`. */
export type PrefsCerebro = Record<string, unknown>;

/** Resultado del plan de fusión. */
export interface PlanFusion {
  archivos: Array<{
    name: string;
    accion: 'copiar' | 'anexar' | 'omitir';
    contenido: string;
    bytesQueEntran: number;
    desde: string[];
    idDestino?: string;
  }>;
  includes: BrainIncludes;
  servers: BrainServer[];
  config: Record<string, unknown>;
  prefs: PrefsCerebro;
  resumen: {
    archivosNuevos: number;
    archivosAnexados: number;
    archivosOmitidos: number;
    bytes: number;
  };
}

/**
 * Quita un bloque inicial de frontmatter YAML (---...\n---) y los saltos que siguen.
 * Devuelve el texto sin el frontmatter.
 */
export function quitarFrontmatter(texto: string): string {
  const inicio = texto.indexOf("---\n");
  if (inicio !== 0) {
    return texto;
  }
  const fin = texto.indexOf("\n---\n", 4);
  if (fin === -1) {
    return texto;
  }
  // Saltamos el bloque de frontmatter completo (---\n... \n---\n)
  let pos = fin + 5; // Posición después del \n---\n
  // Saltamos cualquier salto de línea adicional que siga
  while (pos < texto.length && texto[pos] === '\n') {
    pos++;
  }
  return texto.slice(pos);
}

/**
 * Normaliza un texto: elimina frontmatter, colapsa espacios múltiples y trim.
 */
export function normalizar(texto: string): string {
  let sinFrontmatter = quitarFrontmatter(texto);
  // Colapsar espacios múltiples (incluyendo saltos de línea, tabs, etc.) en un solo espacio
  sinFrontmatter = sinFrontmatter.replace(/\s+/g, " ");
  // Trim
  return sinFrontmatter.trim();
}

/**
 * Parte un texto por líneas que empiezan con `## ` y devuelve un array de secciones.
 * Lo anterior al primer `## ` es la cabecera (puede estar vacío).
 */
export function seccionesDe(texto: string): { cabecera: string; secciones: string[] } {
  const lineas = texto.split("\n");
  let cabeceraLineas: string[] = [];
  let secciones: string[] = [];
  let i = 0;
  
  // Recopilar líneas de cabecera hasta encontrar una que comience con "## "
  while (i < lineas.length && !lineas[i].trimStart().startsWith("## ")) {
    cabeceraLineas.push(lineas[i]);
    i++;
  }
  
  // Eliminar líneas vacías al final de la cabecera
  while (cabeceraLineas.length > 0 && cabeceraLineas[cabeceraLineas.length - 1].trim() === "") {
    cabeceraLineas.pop();
  }
  const cabecera = cabeceraLineas.join("\n");
  
  // Procesar el resto como secciones
  while (i < lineas.length) {
    // Saltar líneas vacías antes de una sección
    while (i < lineas.length && lineas[i].trim() === "" && !lineas[i].trimStart().startsWith("## ")) {
      i++;
    }
    
    if (i >= lineas.length) break;
    
    // Inicio de una sección
    const inicioSeccion = i;
    i++;
    
    // Recopilar líneas de esta sección hasta la próxima que comience con "## " o fin
    while (i < lineas.length && !lineas[i].trimStart().startsWith("## ")) {
      i++;
    }
    
    // Extraer las líneas de esta sección
    let lineasSeccion = lineas.slice(inicioSeccion, i);
    // Eliminar líneas vacías al final de la sección
    while (lineasSeccion.length > 0 && lineasSeccion[lineasSeccion.length - 1].trim() === "") {
      lineasSeccion.pop();
    }
    secciones.push(lineasSeccion.join("\n"));
  }
  
  return { cabecera, secciones };
}

/**
 * Obtiene secciones que están en contenidoAdicional pero no en contenidoBase.
 * Se usa para determinar qué secciones agregar al fusionar archivos.
 */
function obtenerSeccionesNuevas(contenidoBase: string, contenidoAdicional: string): string[] {
  const { secciones: seccionesBase } = seccionesDe(contenidoBase);
  const { secciones: seccionesAdicional } = seccionesDe(contenidoAdicional);
  
  // Normalizamos las secciones base para comparación
  const seccionesBaseNormalizadas = new Set<string>();
  for (const seccion of seccionesBase) {
    // Para comparar, quitamos el encabezado "## " y normalizamos
    const lineaEncabezado = seccion.split("\n")[0];
    if (lineaEncabezado.startsWith("## ")) {
      const contenidoSeccion = seccion.substring(lineaEncabezado.length).trim();
      seccionesBaseNormalizadas.add(normalizar(contenidoSeccion));
    }
  }
  
  // Devolver las secciones adicionales cuyo contenido normalizado no está en base
  // Para secciones con contenido vacío después del encabezado, comparamos el encabezado completo
  const resultado: string[] = [];
  for (const seccion of seccionesAdicional) {
    const lineaEncabezado = seccion.split("\n")[0];
    if (lineaEncabezado.startsWith("## ")) {
      const contenidoSeccion = seccion.substring(lineaEncabezado.length).trim();
      const contenidoNormalizado = normalizar(contenidoSeccion);
      
      if (contenidoNormalizado === "") {
        // Contenido vacío después del encabezado: comparar encabezados completos
        const seccionBaseMatch = seccionesBase.find(s => 
          s.split("\n")[0] === lineaEncabezado
        );
        if (!seccionBaseMatch) {
          resultado.push(seccion);
        }
      } else {
        // Contenido no vacío: usar normalización estándar del contenido
        if (!seccionesBaseNormalizadas.has(contenidoNormalizado)) {
          resultado.push(seccion);
        }
      }
    } else {
      // Si por alguna razón no empieza con ## , tratar normalmente
      const seccionNormalizada = normalizar(seccion);
      if (!seccionesBaseNormalizadas.has(seccionNormalizada)) {
        resultado.push(seccion);
      }
    }
  }
  
  return resultado;
}

/**
 * Fusiona los includes de destino y origenes siguiendo las reglas de fusión.
 */
function fusionarIncludes(destino: Brain, origenes: Brain[]): BrainIncludes {
  const resultado: BrainIncludes = {
    vaults: [],
    backends: [],
    personalities: [],
    runtimes: [],
    tokens: [],
    memories: [],
    connections: [],
    bindScope: false,
    permissions: [],
    aiProvider: undefined
  };
  
  // Conjunto para tracking de duplicados
  const vaultsSet = new Set<string>();
  const backendsSet = new Set<string>();
  const personalitiesSet = new Set<string>();
  const runtimesSet = new Set<string>();
  const tokensSet = new Set<string>();
  const memoriesSet = new Set<string>();
  const connectionsSet = new Set<string>();
  
  // Primero, añadir los del destino
  for (const vault of destino.includes.vaults) {
    if (!vaultsSet.has(vault)) {
      vaultsSet.add(vault);
      resultado.vaults.push(vault);
    }
  }
  for (const backend of destino.includes.backends) {
    if (!backendsSet.has(backend)) {
      backendsSet.add(backend);
      resultado.backends.push(backend);
    }
  }
  for (const personality of destino.includes.personalities) {
    if (!personalitiesSet.has(personality)) {
      personalitiesSet.add(personality);
      resultado.personalities.push(personality);
    }
  }
  for (const runtime of destino.includes.runtimes) {
    if (!runtimesSet.has(runtime)) {
      runtimesSet.add(runtime);
      resultado.runtimes.push(runtime);
    }
  }
  for (const token of destino.includes.tokens) {
    if (!tokensSet.has(token)) {
      tokensSet.add(token);
      resultado.tokens.push(token);
    }
  }
  for (const memory of destino.includes.memories) {
    if (!memoriesSet.has(memory)) {
      memoriesSet.add(memory);
      resultado.memories.push(memory);
    }
  }
  for (const connection of destino.includes.connections) {
    if (!connectionsSet.has(connection)) {
      connectionsSet.add(connection);
      resultado.connections.push(connection);
    }
  }
  
  // bindScope es verdadero si cualquiera lo tiene
  resultado.bindScope = destino.includes.bindScope || 
    origenes.some(o => o.includes.bindScope);
  
  // aiProvider es el del destino o, si no tiene, el del primer origen que lo tenga
  if (destino.includes.aiProvider) {
    resultado.aiProvider = destino.includes.aiProvider;
  } else {
    for (const origen of origenes) {
      if (origen.includes.aiProvider) {
        resultado.aiProvider = origen.includes.aiProvider;
        break;
      }
    }
  }
  
  // Ahora añadir de los orígenes (sin duplicados)
  for (const origen of origenes) {
    for (const vault of origen.includes.vaults) {
      if (!vaultsSet.has(vault)) {
        vaultsSet.add(vault);
        resultado.vaults.push(vault);
      }
    }
    for (const backend of origen.includes.backends) {
      if (!backendsSet.has(backend)) {
        backendsSet.add(backend);
        resultado.backends.push(backend);
      }
    }
    for (const personality of origen.includes.personalities) {
      if (!personalitiesSet.has(personality)) {
        personalitiesSet.add(personality);
        resultado.personalities.push(personality);
      }
    }
    for (const runtime of origen.includes.runtimes) {
      if (!runtimesSet.has(runtime)) {
        runtimesSet.add(runtime);
        resultado.runtimes.push(runtime);
      }
    }
     for (const token of origen.includes.tokens) {
       if (!tokensSet.has(token)) {
         tokensSet.add(token);
         resultado.tokens.push(token);
       }
     }
     for (const memory of origen.includes.memories) {
       if (!memoriesSet.has(memory)) {
         memoriesSet.add(memory);
         resultado.memories.push(memory);
       }
     }
     for (const connection of origen.includes.connections) {
       if (!connectionsSet.has(connection)) {
         connectionsSet.add(connection);
         resultado.connections.push(connection);
       }
     }
  }
  
  // Permissions: unión por `who`
  const permissionsMap = new Map<string, BrainPermission>();
  
  // Añadir permisos del destino
  if (Array.isArray(destino.includes.permissions)) {
    for (const perm of destino.includes.permissions) {
      if (perm.who) {
        permissionsMap.set(perm.who, perm);
      }
    }
  } else if (destino.includes.permissions && typeof destino.includes.permissions === 'object') {
    if (Array.isArray(destino.includes.permissions)) {
      for (const perm of destino.includes.permissions) {
        if (perm.who) {
          permissionsMap.set(perm.who, perm);
        }
      }
    }
  }
  
  // Añadir permisos de los orígenes
  for (const origen of origenes) {
    if (Array.isArray(origen.includes.permissions)) {
      for (const perm of origen.includes.permissions) {
        if (perm.who && !permissionsMap.has(perm.who)) {
          permissionsMap.set(perm.who, perm);
        }
      }
    } else if (origen.includes.permissions && typeof origen.includes.permissions === 'object') {
      if (Array.isArray(origen.includes.permissions)) {
        for (const perm of origen.includes.permissions) {
          if (perm.who && !permissionsMap.has(perm.who)) {
            permissionsMap.set(perm.who, perm);
          }
        }
      }
    }
  }
  
  // Convertir el map a array
  resultado.permissions = Array.from(permissionsMap.values());
  
  return resultado;
}

/**
 * Fusiona los servidores de destino y origenes siguiendo las reglas de fusión.
 */
function fusionarServers(destino: Brain, origenes: Brain[]): BrainServer[] {
  const resultado: BrainServer[] = [];
  const vistoIds = new Set<string>();
  const vistoEndpoints = new Set<string>();
  
  // Procesar servidores del destino primero (tienen preferencia)
  for (const servidor of destino.servers) {
    if (!vistoIds.has(servidor.id)) {
      vistoIds.add(servidor.id);
      if (servidor.endpoint && servidor.endpoint.trim() !== "") {
        const endpoint = servidor.endpoint.trim();
        if (!vistoEndpoints.has(endpoint)) {
          vistoEndpoints.add(endpoint);
          resultado.push(servidor);
        }
        // Si el endpoint ya se vio, skip este servidor (duplicado de endpoint)
      } else {
        // Endpoint vacío: siempre incluir
        resultado.push(servidor);
      }
    }
    // Si ya existía por ID, skip (el primero gana)
  }
  
    // Luego procesar servidores de los orígenes
    for (const origen of origenes) {
      for (const servidor of origen.servers) {
      if (!vistoIds.has(servidor.id)) {
        vistoIds.add(servidor.id);
        if (servidor.endpoint && servidor.endpoint.trim() !== "") {
          const endpoint = servidor.endpoint.trim();
          if (!vistoEndpoints.has(endpoint)) {
            vistoEndpoints.add(endpoint);
            resultado.push(servidor);
          }
          // Si el endpoint ya se vio, skip este servidor (duplicado de endpoint)
        } else {
          // Endpoint vacío: siempre incluir
          resultado.push(servidor);
        }
      }
      // Si ya existía por ID, skip (el primero gana)
    }
  }
  
  // Ordenar por id para consistencia (opcional)
  resultado.sort((a, b) => a.id.localeCompare(b.id));
  
  return resultado;
}

/**
 * Fusiona las configuraciones de destino y origenes siguiendo las reglas de fusión.
 */
function fusionarConfig(destino: Brain, origenes: Brain[], configBase: Record<string, unknown>, fecha: string): Record<string, unknown> {
  const resultado = { ...configBase }; // Comenzamos con lo que ya tienes (config del destino)
  
  // Añadir del origen solo las claves que el destino no tiene
  for (const origen of origenes) {
    for (const [clave, valor] of Object.entries(origen.config)) {
      if (!(clave in resultado)) {
        resultado[clave] = valor;
      }
    }
  }
  
  // Añadir fusionados y fusionadoEn
  const idsOrigenes = origenes.map(o => o.id);
  const idsYaFusionados = Array.isArray(configBase.fusionados) ? configBase.fusionados : [];
  // Unión de ids sin duplicados
  const todosLosIds = [...new Set([...idsYaFusionados, ...idsOrigenes])];
  resultado.fusionados = todosLosIds;
  resultado.fusionadoEn = fecha;
  
  return resultado;
}

/**
 * Fusiona las preferencias de destino y origenes siguiendo las reglas de fusión.
 */
function fusionarPrefs(destino: Brain, origenes: Brain[], prefsEntrada: Record<string, PrefsCerebro>): PrefsCerebro {
  const resultado: PrefsCerebro = {};
  
  // Primero, procesamos las prefs del destino
  const prefsDestino = prefsEntrada[destino.id] || {};
  for (const [clave, valor] of Object.entries(prefsDestino)) {
    resultado[clave] = valor;
  }
  
  // Luego, procesamos las prefs de cada origen según las reglas de fusión
  for (const origen of origenes) {
    const prefsOrigen = prefsEntrada[origen.id] || {};
    for (const [clave, valorOrigen] of Object.entries(prefsOrigen)) {
      if (!(clave in resultado)) {
        // Clave ausente en el destino → se copia
        resultado[clave] = valorOrigen;
      } else {
        // Ambos tienen esta clave, aplicar reglas de fusión
        const valorDestino = resultado[clave];
        
        // Caso: ambos son listas
        if (Array.isArray(valorDestino) && Array.isArray(valorOrigen)) {
          // Unión por id si los elementos tienen id, o por valor si no
          // Para simplificar, asumimos que si es un array de objetos con id, unimos por id
          // De lo contrario, concatenamos y eliminamos duplicados por valor JSON
          if (valorDestino.length > 0 && typeof valorDestino[0] === 'object' && valorDestino[0] !== null && 'id' in valorDestino[0]) {
            // Ambos son arrays de objetos con id
            const idsDestino = new Set<string>();
            const objetosDestinoMap = new Map<string, unknown>();
            for (const obj of valorDestino as Record<string, unknown>[]) {
              if (obj && typeof obj === 'object' && 'id' in obj && typeof obj.id === 'string') {
                idsDestino.add(obj.id);
                objetosDestinoMap.set(obj.id, obj);
              }
            }
            
            for (const obj of valorOrigen as Record<string, unknown>[]) {
              if (obj && typeof obj === 'object' && 'id' in obj && typeof obj.id === 'string') {
                if (!idsDestino.has(obj.id)) {
                  idsDestino.add(obj.id);
                  objetosDestinoMap.set(obj.id, obj);
                }
              }
            }
            
            resultado[clave] = Array.from(objetosDestinoMap.values());
          } else {
            // No son objetos con id, o estamos seguros de que son simples valores
            // Concatenar y eliminar duplicados por valor JSON
            const combinado = [...valorDestino, ...valorOrigen];
            const vistos = new Set<string>();
            const unico: unknown[] = [];
            for (const item of combinado) {
              const json = JSON.stringify(item);
              if (!vistos.has(json)) {
                vistos.add(json);
                unico.push(item);
              }
            }
            resultado[clave] = unico;
          }
        } 
        // Caso: ambos son objetos
        else if (!Array.isArray(valorDestino) && !Array.isArray(valorOrigen) &&
                 typeof valorDestino === 'object' && valorDestino !== null &&
                 typeof valorOrigen === 'object' && valorOrigen !== null) {
          // Destino gana y se rellenan las claves que le faltan
          const objetoDestino = valorDestino as Record<string, unknown>;
          const objetoOrigen = valorOrigen as Record<string, unknown>;
          const fusionado = { ...objetoDestino }; // Comenzamos con el destino
          
          for (const [claveOrigen, valorOrigenObj] of Object.entries(objetoOrigen)) {
            if (!(claveOrigen in fusionado)) {
              fusionado[claveOrigen] = valorOrigenObj;
            }
          }
          
          resultado[clave] = fusionado;
        }
        // Otro tipo → gana el destino (no hacemos nada, ya tiene el valor del destino)
      }
    }
  }
  
  return resultado;
}

/**
 * Crea el plan de fusión sin aplicar cambios.
 * @param e Objeto con destino, origenes, archivos, prefs y fecha
 * @return Plan de fusión listo para aplicar
 */
export function planFusion(e: {
  destino: Brain;
  origenes: Brain[];
  archivos: ArchivoMemoria[];
  prefs: Record<string, PrefsCerebro>;
  fecha: string
}): PlanFusion {
  const { destino, origenes, archivos: archivosEntrada, prefs: prefsEntrada, fecha } = e;
  
  // Mapeo de archivos por nombre para acceso rápido
  const archivosPorNombre = new Map<string, ArchivoMemoria>();
  for (const archivo of archivosEntrada) {
    archivosPorNombre.set(archivo.name, archivo);
  }
  
  // Mapeo de brains por id para acceso rápido
  const brainsPorId = new Map<string, Brain>();
  brainsPorId.set(destino.id, destino);
  for (const origen of origenes) {
    brainsPorId.set(origen.id, origen);
  }
  
  // Resultado final
  const resultado: PlanFusion = {
    archivos: [],
    includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined },
    servers: [],
    config: {},
    prefs: {},
    resumen: { archivosNuevos: 0, archivosAnexados: 0, archivosOmitidos: 0, bytes: 0 }
  };
  
  // Procesar cada archivo de memoria único (por name)
  const nombresArchivos = new Set<string>();
  for (const archivo of archivosEntrada) {
    nombresArchivos.add(archivo.name);
  }
  // También incluir archivos que pueda tener el destino pero no estén en la entrada
  // Pero según el contrato, parece que solo procesamos los archivos dados
  // Sin embargo, para estar seguros, también obtenemos los archivos del destino y origenes
  // Pero el contrato dice "archivos: ArchivoMemoria[]" como entrada, así que nos limitamos a esos
  
  for (const name of nombresArchivos) {
    const archivoEntrada = archivosPorNombre.get(name);
    if (!archivoEntrada) continue;
    
    // Encontrar el archivo en el destino (si existe)
    // Nota: No tenemos una función para obtener archivos de un cerebro, pero asumimos que
    // el archivoEntrata representa el estado actual o necesitamos buscarlo
    // Según el contrato, parece que el archivo de entrada es lo que actualmente existe
    // Pero para saber si el destino lo tiene, necesitamos comparar con lo que habría en el destino
    // Esto es complejo porque no tenemos acceso directo a los archivos de cada cerebro
    // 
    // Releyendo el contrato: "archivos: ArchivoMemoria[]" parece ser la lista de todos los archivos
    // que existen en cualquiera de los cerebros (destino + origenes)
    // Y para cada uno, necesitamos determinar qué hacer basado en si el destino lo tiene y su contenido
    //
    // Pero no tenemos una forma de obtener el contenido actual de un archivo en un cerebro específico
    // 
    // Espera, mirando el tipo ArchivoMemoria: tiene brain_id. Entonces cada ArchivoMemoria
    // está asociado a un cerebro específico.
    // 
    // Entonces para un nombre de archivo dado, podemos tener múltiples ArchivoMemoria
    // (uno para cada cerebro que lo tenga).
    // 
    // Necesitamos agrupar por nombre de archivo y luego para cada grupo:
    // - Si no hay ninguno con brain_id === destino.id → el destino no lo tiene
    // - Si hay uno con brain_id === destino.id → el destino lo tiene con ese contenido
    // - Los orígenes son aquellos con brain_id en origenes.map(o => o.id)
    //
    // ¡Ah! Eso tiene más sentido.
    
    // Agrupar archivos por nombre
    const archivosDelNombre = archivosEntrada.filter(a => a.name === name);
    
    // Buscar el archivo en el destino
    const archivoDestino = archivosDelNombre.find(a => a.brain_id === destino.id);
    
    // Obtener archivos de los orígenes (excluyendo el destino)
    const archivosOrigenes = archivosDelNombre
      .filter(a => origenes.some(o => o.id === a.brain_id))
      .sort((a, b) => {
        // Ordenar por aparición en origenes (el primero que aparece en origenes va primero)
        const indiceA = origenes.findIndex(o => o.id === a.brain_id);
        const indiceB = origenes.findIndex(o => o.id === b.brain_id);
        return indiceA - indiceB;
      });
    
    let accion: 'copiar' | 'anexar' | 'omitir' = 'omitir';
    let contenidoFinal = '';
    let desde: string[] = [];
    let bytesQueEntran = 0;
    let idDestino: string | undefined = archivoDestino ? archivoDestino.id : undefined;
    
    if (!archivoDestino) {
      // Caso: archivo ausente en el destino → 'copiar'
      // (contenido del primer origen que lo tenga, más las secciones nuevas de los siguientes)
      accion = 'copiar';
      desde = archivosOrigenes.map(a => a.brain_id);
      
      if (archivosOrigenes.length > 0) {
        // Comenzar con el contenido del primer origen
        contenidoFinal = archivosOrigenes[0].content;
        
        // Para cada origen adicional, añadir solo las secciones nuevas
        for (let i = 1; i < archivosOrigenes.length; i++) {
          const origenActual = archivosOrigenes[i];
          const seccionesANexar = obtenerSeccionesNuevas(contenidoFinal, origenActual.content);
          if (seccionesANexar.length > 0) {
            contenidoFinal += "\n\n" + seccionesANexar.map(seccion => 
              `## Fusionado de «${(obtenerNombreBrain(origenes.find(o => o.id === origenActual.brain_id) || { name: '' }))}» (<${origenActual.brain_id.substring(0, 8)}) · ${fecha}`
              + "\n" + seccion
            ).join("\n\n");
          }
        }
      }
    } else {
      // El destino ya tiene el archivo
      // Verificar si el contenido es igual una vez normalizado
      const contenidoDestinoNormalizado = normalizar(archivoDestino.content);
      
      // Verificar si alguno de los orígenes tiene contenido diferente
      let hayDiferencia = false;
      for (const origenArchivo of archivosOrigenes) {
        if (normalizar(origenArchivo.content) !== contenidoDestinoNormalizado) {
          hayDiferencia = true;
          break;
        }
      }
      
      if (!hayDiferencia) {
        // Igual tras normalizar → 'omitir'
        accion = 'omitir';
        contenidoFinal = archivoDestino.content;
        desde = [];
      } else {
        // Distinto → 'anexar' solo las secciones ## cuyo texto normalizado NO esté ya contenido en el destino
        accion = 'anexar';
        desde = archivosOrigenes.map(a => a.brain_id);
        
        // Comenzar con el contenido del destino
        contenidoFinal = archivoDestino.content;
        
          // Para cada origen, añadir solo las secciones que no están ya en el destino
          for (const origenArchivo of archivosOrigenes) {
          const seccionesANexar = obtenerSeccionesNuevas(contenidoFinal, origenArchivo.content);
          if (seccionesANexar.length > 0) {
            contenidoFinal += "\n\n" + seccionesANexar.map(seccion => 
              `## Fusionado de «${(obtenerNombreBrain(origenes.find(o => o.id === origenArchivo.brain_id) || { name: '' }))}» (<${origenArchivo.brain_id.substring(0, 8)}) · ${fecha}`
              + "\n" + seccion
            ).join("\n\n");
          }
        }
      }
    }
    
    // Calcular bytes que entran (diferencia entre contenidoFinal y lo que había en destino)
    let bytesEntrada = 0;
    if (archivoDestino) {
      bytesEntrada = new TextEncoder().encode(contenidoFinal).length - 
                    new TextEncoder().encode(archivoDestino.content).length;
    } else {
      bytesEntrada = new TextEncoder().encode(contenidoFinal).length;
    }
    // Asegurarnos de que no sea negativo (en caso de que quitemos algo, pero según reglas no debería pasar)
    if (bytesEntrada < 0) bytesEntrada = 0;
    
    // Añadir al resultado
    resultado.archivos.push({
      name,
      accion,
      contenido: contenidoFinal,
      bytesQueEntran: bytesEntrada,
      desde,
      idDestino
    });
    
    // Actualizar resumen
    if (accion === 'copiar') {
      resultado.resumen.archivosNuevos++;
    } else if (accion === 'anexar') {
      resultado.resumen.archivosAnexados++;
    } else if (accion === 'omitir') {
      resultado.resumen.archivosOmitidos++;
    }
    resultado.resumen.bytes += bytesEntrada;
  }
  
  // Procesar includes
  resultado.includes = fusionarIncludes(destino, origenes);
  
  // Procesar servers
  resultado.servers = fusionarServers(destino, origenes);
  
   // Procesar config
   resultado.config = fusionarConfig(destino, origenes, destino.config, fecha);
  
  // Procesar prefs
  resultado.prefs = fusionarPrefs(destino, origenes, prefsEntrada);
  
  return resultado;
}

// Helper para obtener el nombre de un brain (de sus metadatos o name)
function obtenerNombreBrain(brain: Brain | undefined): string {
  return brain ? brain.name : "Desconocido";
}