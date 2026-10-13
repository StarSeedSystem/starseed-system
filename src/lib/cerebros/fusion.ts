import type { Brain, BrainIncludes, BrainServer } from "@/lib/brains/brains";
import type { MemoryFile } from "@/lib/cerebro/memory-files";

/**
 * Archivo de memoria simplificado para la lógica de fusión.
 */
export interface ArchivoMemoria {
  id?: string;
  brain_id: string;
  name: string;
  content: string;
  updated_at?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Preferencias de cerebro.
 */
export type PrefsCerebro = Record<string, unknown>;

/**
 * Elimina el frontmatter YAML inicial de un texto.
 * @param texto - Texto que posiblemente tenga frontmatter
 * @returns Texto sin el bloque inicial ----\n...\n---- y los saltos que siguen
 */
export function quitarFrontmatter(texto: string): string {
  const frontmatterPattern = /^---[\s\S]*?---\n*/;
  return texto.replace(frontmatterPattern, '');
}

/**
 * Normaliza un texto: elimina frontmatter, colapsa espacios y aplica trim.
 * @param texto - Texto a normalizar
 * @returns Texto normalizado
 */
export function normalizar(texto: string): string {
  let sinFrontmatter = quitarFrontmatter(texto);
  // Colapsar múltiples espacios en uno y aplicar trim
  return sinFrontmatter.replace(/\s+/g, ' ').trim();
}

/**
 * Divide un texto por secciones que empiezan con `## `.
 * @param texto - Texto sin frontmatter ya normalizado
 * @returns Array de secciones, donde el elemento 0 es la cabecera (antes del primer ## )
 */
export function seccionesDe(texto: string): string[] {
  // Caso especial para texto vacío
  if (texto === '') {
    return [''];
  }
  
  // Encontrar todas las ocurrencias de "\n## "
  const posiciones: number[] = [];
  let pos = texto.indexOf('\n## ');
  while (pos !== -1) {
    posiciones.push(pos);
    pos = texto.indexOf('\n## ', pos + 1);
  }
  
  // Si no hay secciones ##, todo es la cabecera
  if (posiciones.length === 0) {
    return [texto];
  }
  
  // Construir las secciones
  const resultado: string[] = [];
  
  // Primera sección: desde el inicio hasta después del primer \n## 
  resultado.push(texto.slice(0, posiciones[0] + 1));
  
  // Secciones intermedias: desde después de cada \n## hasta después del siguiente \n##
  for (let i = 0; i < posiciones.length - 1; i++) {
    resultado.push(texto.slice(posiciones[i] + 1, posiciones[i + 1] + 1));
  }
  
  // Última sección: desde después del último \n## hasta el final
  resultado.push(texto.slice(posiciones[posiciones.length - 1] + 1));
  
  // Filtrar secciones que estén vacías después de trim (pero mantener la cabecera incluso si está vacía)
  return resultado.filter((seccion, indice) => 
    indice === 0 || seccion.trim() !== ''
  );
}

/**
 * Resultado de la planificación de fusión.
 */
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
 * Planifica la fusión de cerebros sin aplicar cambios.
 * @param e - Objeto con destino, origenes, archivos, prefs y fecha
 * @returns Plan de fusión con las acciones a realizar
 */
export function planFusion(e: {
  destino: Brain;
  origenes: Brain[];
  archivos: ArchivoMemoria[];
  prefs: Record<string, PrefsCerebro>;
  fecha: string
}): PlanFusion {
  const { destino, origenes, archivos: archivosEntrada, prefs: prefsEntrada, fecha } = e;
  
  // 1. Procesar archivos de memoria
  const archivosPlan: PlanFusion['archivos'] = [];
  
  // Agrupar archivos de entrada por name
  const archivosPorNombre: Record<string, ArchivoMemoria[]> = {};
  for (const archivo of archivosEntrada) {
    if (!archivosPorNombre[archivo.name]) {
      archivosPorNombre[archivo.name] = [];
    }
    archivosPorNombre[archivo.name].push(archivo);
  }
  
  // Para cada archivo único por name
  for (const [nombre, versiones] of Object.entries(archivosPorNombre)) {
    // Ordenar por brain_id para tener un orden determinístico (primero el destino si existe, luego origenes)
    const versionesOrdenadas = [...versiones].sort((a, b) => {
      // El destino va primero si coincide con el brain_id del destino
      if (a.brain_id === destino.id) return -1;
      if (b.brain_id === destino.id) return 1;
      return a.brain_id.localeCompare(b.brain_id);
    });
    
    // Verificar si el destino ya tiene este archivo
    const existeEnDestino = versionesOrdenadas.some(v => v.brain_id === destino.id);
    
    if (!existeEnDestino) {
      // Caso: archivo ausente en el destino → 'copiar'
      // Contenido del primer origen que lo tenga
      const primeraVersion = versionesOrdenadas[0];
      let contenidoFinal = primeraVersion.content;
      let bytesQueEntran = new TextEncoder().encode(contenidoFinal).length;
      const desde: string[] = [primeraVersion.brain_id];
      
      // Además, añadir las secciones nuevas de los siguientes orígenes
      for (let i = 1; i < versionesOrdenadas.length; i++) {
        const version = versionesOrdenadas[i];
        const secciones = seccionesDe(normalizar(version.content));
        // La cabecera es secciones[0], el resto son secciones reales
        if (secciones.length > 1) {
          for (let j = 1; j < secciones.length; j++) {
            const seccion = secciones[j];
            // Verificar si esta sección ya está en el contenido final
            if (!contenidoFinal.includes(seccion)) {
              const encabezadoFusion = `## Fusionado de «${version.name}» (${version.brain_id?.substring(0, 8) || 'unknown'}) · ${fecha}\n`;
              contenidoFinal += `\n${encabezadoFusion}${seccion}\n`;
              bytesQueEntran += new TextEncoder().encode(`\n${encabezadoFusion}${seccion}\n`).length;
              desde.push(version.brain_id);
            }
          }
        }
      }
      
      archivosPlan.push({
        name: nombre,
        accion: 'copiar',
        contenido: contenidoFinal,
        bytesQueEntran,
        desde,
        idDestino: undefined // No existe en el destino aún
      });
    } else {
      // El destino sí tiene el archivo, necesitamos comparar
      const versionDestino = versionesOrdenadas.find(v => v.brain_id === destino.id)!;
      const contenidoDestinoNormalizado = normalizar(versionDestino.content);
      
      // Verificar si todas las versiones son iguales tras normalizar
      const todasIguales = versionesOrdenadas.every(v => normalizar(v.content) === contenidoDestinoNormalizado);
      
      if (todasIguales) {
        // Caso: igual tras normalizar → 'omitir'
        archivosPlan.push({
          name: nombre,
          accion: 'omitir',
          contenido: versionDestino.content,
          bytesQueEntran: 0,
          desde: versionesOrdenadas.map(v => v.brain_id),
          idDestino: versionDestino.id
        });
      } else {
        // Caso: distinto → 'anexar' solo las secciones nuevas
        let contenidoFinal = versionDestino.content;
        let bytesQueEntran = 0;
        const desde: string[] = [destino.id]; // Siempre incluye el destino
        
        // Para cada origen, verificar secciones nuevas
        let seccionesNuevasEncontradas = false;
        for (const version of versionesOrdenadas) {
          if (version.brain_id === destino.id) continue; // Saltar el destino mismo
          
          // Partir el contenido del origen por encabezados ## (pero mantener el ## en cada sección)
          const seccionesOrigen = seccionesDe(version.content);
          // Partir el contenido del destino por encabezados ##
          const seccionesDestino = seccionesDe(versionDestino.content);
          
          // La cabecera es secciones[0], el resto son secciones reales
          if (seccionesOrigen.length > 1) {
            for (let j = 1; j < seccionesOrigen.length; j++) {
              const seccionOrigen = seccionesOrigen[j];
              
              // Verificar si esta sección (ignorando trailing newlines) ya está en las secciones del destino
              const seccionOrigenLimpia = seccionOrigen.replace(/\n+$/, '');
              let seccionEnDestino = false;
              for (const seccionDestino of seccionesDestino) {
                const seccionDestinoLimpia = seccionDestino.replace(/\n+$/, '');
                if (seccionOrigenLimpia === seccionDestinoLimpia) {
                  seccionEnDestino = true;
                  break;
                }
              }
              
              if (!seccionEnDestino) {
                seccionesNuevasEncontradas = true;
                const encabezadoFusion = `## Fusionado de «${version.name}» (${version.brain_id?.substring(0, 8) || 'unknown'}) · ${fecha}\n`;
                contenidoFinal += `\n${encabezadoFusion}${seccionOrigen}\n`;
                bytesQueEntran += new TextEncoder().encode(`\n${encabezadoFusion}${seccionOrigen}\n`).length;
                desde.push(version.brain_id);
              }
            }
          }
        }
        
        // Determinar la acción basada en si se encontraron secciones nuevas
        const accion = seccionesNuevasEncontradas ? 'anexar' : 'omitir';
        
        archivosPlan.push({
          name: nombre,
          accion: accion,
          contenido: contenidoFinal,
          bytesQueEntran,
          desde,
          idDestino: versionDestino.id
        });
      }
    }
  }
  
  // 2. Procesar includes
  const includesPlan: BrainIncludes = {
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
  
  // Unión sin duplicados para arrays simples
  const unionSinDuplicados = <T>(arrays: T[][]): T[] => {
    const resultado: T[] = [];
    const vistos = new Set<string>();
    for (const array of arrays) {
      for (const item of array) {
        // Para objetos simples, usamos JSON.stringify para comparar
        const clave = typeof item === 'string' ? item : JSON.stringify(item);
        if (!vistos.has(clave)) {
          vistos.add(clave);
          resultado.push(item);
        }
      }
    }
    return resultado;
  };
  
  // Recopilar todos los valores de includes
  const todosIncludes = [destino.includes, ...origenes.map(o => o.includes)];
  
  includesPlan.vaults = unionSinDuplicados(todosIncludes.map(i => i.vaults));
  includesPlan.backends = unionSinDuplicados(todosIncludes.map(i => i.backends));
  includesPlan.personalities = unionSinDuplicados(todosIncludes.map(i => i.personalities));
  includesPlan.runtimes = unionSinDuplicados(todosIncludes.map(i => i.runtimes));
  includesPlan.tokens = unionSinDuplicados(todosIncludes.map(i => i.tokens));
  includesPlan.memories = unionSinDuplicados(todosIncludes.map(i => i.memories));
  includesPlan.connections = unionSinDuplicados(todosIncludes.map(i => i.connections));
  
  // bindScope: activo si lo tenía cualquiera
  includesPlan.bindScope = todosIncludes.some(i => i.bindScope);
  
  // permissions: unión por `who`
  const todosPermisos = todosIncludes.flatMap(i => i.permissions);
  const permisosMap = new Map<string, BrainPermission>();
  for (const permiso of todosPermisos) {
    if (!permisosMap.has(permiso.who)) {
      permisosMap.set(permiso.who, permiso);
    } else {
      // Si ya existe, mantener el nivel más alto? Según el contrato: "permissions por who"
      // No especifica cómo resolver conflictos, así que dejamos el primero
    }
  }
  includesPlan.permissions = Array.from(permisosMap.values());
  
  // aiProvider: del destino o del primer origen si el destino no tiene
  includesPlan.aiProvider = destino.includes.aiProvider || 
    (origenes.length > 0 ? origenes[0].includes.aiProvider : undefined);
  
  // 3. Procesar servers
  // Unión por `id`; si dos tienen el mismo `endpoint` no vacío, cuentan como uno
  const todosServers = [destino.servers, ...origenes.map(o => o.servers)];
  const servidoresMap = new Map<string, BrainServer>();
  
  // Primero agregar todos por id, pero el destino gana en caso de conflicto
  for (const serversArray of todosServers) {
    for (const servidor of serversArray) {
      if (servidor.id) {
        // Si ya existe un servidor con este id, no sobrescribir (el destino gana)
        if (!servidoresMap.has(servidor.id)) {
          servidoresMap.set(servidor.id, servidor);
        }
      }
    }
  }
  
  // Luego verificar endpoints duplicados (solo si no están ya por id)
  const servidoresArray = Array.from(servidoresMap.values());
  const servidoresFinal: BrainServer[] = [];
  
  for (const servidor of servidoresArray) {
    // Verificar si ya tenemos un servidor con el mismo endpoint (no vacío)
    const endpointDuplicado = servidoresFinal.find(existente => 
      existente.endpoint && servidor.endpoint && 
      existente.endpoint === servidor.endpoint
    );
    
    if (!endpointDuplicado) {
      servidoresFinal.push(servidor);
    }
    // Si es duplicado por endpoint, lo ignoramos (se cuenta como uno)
  }
  
  // 4. Procesar config
  // El destino gana. Del origen solo entran las claves que el destino no tiene.
  const configPlan: Record<string, unknown> = { ...destino.config };
  
  // Añadir clausos de los orígenes que no estén en el destino
  for (const origen of origenes) {
    for (const [clave, valor] of Object.entries(origen.config)) {
      if (!(clave in configPlan)) {
        configPlan[clave] = valor;
      }
    }
  }
  
  // Añadir fusionados y fusionadoEn
  const todosLosIds = [destino.id, ...origenes.map(o => o.id)].filter((id): id => id !== undefined) as string[];
  const fusionados = [...new Set(todosLosIds)]; // Eliminar duplicados
  configPlan.fusionados = fusionados;
  configPlan.fusionadoEn = fecha;
  
  // 5. Procesar prefs
  const prefsPlan: PrefsCerebro = {};
  
  // Primero copiar todas las prefs del destino
  Object.assign(prefsPlan, destino.config.prefs || {});
  
  // Luego procesar las prefs de entrada
  for (const [clave, valorEntrada] of Object.entries(prefsEntrada)) {
    if (!(clave in prefsPlan)) {
      // Clave ausente en el destino → se copia
      prefsPlan[clave] = valorEntrada;
    } else {
      const valorDestino = prefsPlan[clave];
      
        // Si ambas son listas
      if (Array.isArray(valorDestino) && Array.isArray(valorEntrada)) {
        // Unión por id, o por valor JSON si no tienen id
        const combinados: unknown[] = [...valorDestino];
        const idsVistos = new Set<string>();
        
        // Primero agregar los del destino con sus ids
        for (const item of valorDestino) {
          if (item && typeof item === 'object' && 'id' in item && item.id !== undefined) {
            idsVistos.add(String(item.id));
          } else {
            // Para items sin id, usamos JSON.stringify
            idsVistos.add(JSON.stringify(item));
          }
        }
        
        // Luego agregar los de entrada que no estén ya
        for (const item of valorEntrada) {
          let claveItem: string;
          if (item && typeof item === 'object' && 'id' in item && item.id !== undefined) {
            claveItem = String(item.id);
          } else {
            claveItem = JSON.stringify(item);
          }
          
          if (!idsVistos.has(claveItem)) {
            idsVistos.add(claveItem);
            // Para conflictos por id, copiar propiedades del primer elemento de destino con ese id
            const itemDestinoExistente = valorDestino.find(existingItem => 
              existingItem && typeof existingItem === 'object' && 
              'id' in existingItem && existingItem.id !== undefined && 
              String(existingItem.id) === claveItem
            );
            if (itemDestinoExistente) {
              // Crear una copia del item de entrada pero sobrescribir con valores del destino para campos en conflicto
              const itemCombinado = { ...item };
              // Para cada campo que existe en ambos, mantener el valor del destino
              for (const clave in item) {
                if (clave in itemDestinoExistente) {
                  itemCombinado[clave] = itemDestinoExistente[clave];
                }
              }
              combinados.push(itemCombinado);
            } else {
              combinados.push(item);
            }
          }
        }
        
        prefsPlan[clave] = combinados;
      } 
        // Si ambas son objetos
      else if (typeof valorDestino === 'object' && valorDestino !== null && 
               !Array.isArray(valorDestino) &&
               typeof valorEntrada === 'object' && valorEntrada !== null && 
               !Array.isArray(valorEntrada)) {
        // El destino gana y se rellenan las claves que le faltan
        const objetoCombinado = { ...valorEntrada, ...valorDestino };
        prefsPlan[clave] = objetoCombinado;
      } 
      // Otro tipo → gana el destino (no hacer nada, ya está copiado)
    }
  }
  
  // Calcular resumen
  let archivosNuevos = 0;
  let archivosAnexados = 0;
  let archivosOmitidos = 0;
  let totalBytes = 0;
  
  for (const archivo of archivosPlan) {
    totalBytes += archivo.bytesQueEntran;
    switch (archivo.accion) {
      case 'copiar':
        archivosNuevos++;
        break;
      case 'anexar':
        archivosAnexados++;
        break;
      case 'omitir':
        archivosOmitidos++;
        break;
    }
  }
  
  return {
    archivos: archivosPlan,
    includes: includesPlan,
    servers: servidoresFinal,
    config: configPlan,
    prefs: prefsPlan,
    resumen: {
      archivosNuevos,
      archivosAnexados,
      archivosOmitidos,
      bytes: totalBytes
    }
  };
}