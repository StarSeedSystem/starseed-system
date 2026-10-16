import type { Brain, BrainIncludes, BrainServer, BrainPermission } from '@/lib/brains/brains';

export interface ArchivoMemoria {
  id?: string;
  brain_id: string;
  name: string;
  content: string;
  updated_at?: string | null;
  meta?: Record<string, unknown> | null;
}

export type PrefsCerebro = Record<string, unknown>;

export function quitarFrontmatter(texto: string): string {
  if (!texto.startsWith('---\n')) return texto;
  const endIndex = texto.indexOf('\n---\n', 4);
  if (endIndex === -1) return texto;
  const afterBlock = texto.substring(endIndex + 4);
  let i = 0;
  while (i < afterBlock.length && afterBlock[i] === '\n') i++;
  return afterBlock.substring(i);
}

export function normalizar(texto: string): string {
  let sinFrontmatter = quitarFrontmatter(texto);
  sinFrontmatter = sinFrontmatter.replace(/\s+/g, ' ');
  return sinFrontmatter.trim();
}

export function seccionesDe(texto: string): string[] {
  const lines = texto.split('\n');
  const sections: string[] = [];
  let current = '';
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) {
        sections.push(current);
      }
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) {
    sections.push(current);
  }
  return sections;
}

export function utf8ByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

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

export function planFusion(e: {
  destino: Brain;
  origenes: Brain[];
  archivos: ArchivoMemoria[];
  prefs: Record<string, PrefsCerebro>;
  fecha: string;
}): PlanFusion {
  // Map of brain_id -> Map<file name, ArchivoMemoria>
  const archivosMap = new Map<string, Map<string, ArchivoMemoria>>();
  for (const archivo of e.archivos) {
    if (!archivosMap.has(archivo.brain_id)) {
      archivosMap.set(archivo.brain_id, new Map());
    }
    archivosMap.get(archivo.brain_id)!.set(archivo.name, archivo);
  }
  // Set of all file names
  const fileNames = new Set<string>();
  for (const [, fileMap] of archivosMap) {
    for (const name of fileMap.keys()) {
      fileNames.add(name);
    }
  }
  // Also include destino and origenes brain ids in the map (even if they have no archivos, we need to know they exist)
  // But we already have them from the archivos if they have files. If a brain has no archivos, then we treat it as having no files.
  const planArchivos: PlanFusion['archivos'] = [];
  let resumen = { archivosNuevos: 0, archivosAnexados: 0, archivosOmitidos: 0, bytes: 0 };
  for (const name of fileNames) {
    const destinoFile = archivosMap.get(e.destino.id)?.get(name);
    const hasDestino = !!destinoFile;
    const destinoContent = hasDestino ? quitarFrontmatter(destinoFile.content) : '';
    const normalizedDestinoContent = normalizar(destinoContent);
    let action: 'copiar' | 'anexar' | 'omitir' = 'omitir';
    let finalContent = destinoContent;
    let addedBytes = 0;
    let contribuidores: string[] = [];
    if (!hasDestino) {
      action = 'copiar';
      // Find first origen that has the file
      let firstOrigenIndex = -1;
      for (let i = 0; i < e.origenes.length; i++) {
        const origen = e.origenes[i];
        const origenFile = archivosMap.get(origen.id)?.get(name);
        if (origenFile) {
          firstOrigenIndex = i;
          const origenContent = quitarFrontmatter(origenFile.content);
          finalContent = origenContent;
          addedBytes = Buffer.byteLength(finalContent, 'utf8');
          contribuidores.push(origen.id);
          break;
        }
      }
        // Process remaining origenes
        for (let i = firstOrigenIndex + 1; i < e.origenes.length; i++) {
          const origen = e.origenes[i];
          const origenFile = archivosMap.get(origen.id)?.get(name);
          if (!origenFile) continue;
          const origenContent = quitarFrontmatter(origenFile.content);
          if (normalizar(finalContent) === normalizar(origenContent)) {
            continue;
          }
          const sections = seccionesDe(origenContent);
          for (const section of sections) {
            const normalizedSection = normalizar(section);
            if (!normalizar(finalContent).includes(normalizedSection)) {
              const fusionHeading = `## Fusionado de «${origen.name}» (${origen.id.substring(0, 8)}) · ${e.fecha}`;
              const fusionSection = fusionHeading + (section ? '\n' + section : '');
              if (finalContent) {
                finalContent += '\n\n' + fusionSection;
              } else {
                finalContent = fusionSection;
              }
              addedBytes += utf8ByteLength(fusionSection);
              contribuidores.push(origen.id);
            }
          }
        }
    } else {
      let isEqual = true;
      for (const origen of e.origenes) {
        const origenFile = archivosMap.get(origen.id)?.get(name);
        if (!origenFile) continue;
          const origenContent = quitarFrontmatter(origenFile.content);
          if (normalizar(finalContent) !== normalizar(origenContent)) {
            isEqual = false;
            const sections = seccionesDe(origenContent);
            for (const section of sections) {
              const normalizedSection = normalizar(section);
              if (!normalizar(finalContent).includes(normalizedSection)) {
                const fusionHeading = `## Fusionado de «${origen.name}» (${origen.id.substring(0, 8)}) · ${e.fecha}`;
                const fusionSection = fusionHeading + (section ? '\n' + section : '');
                if (finalContent) {
                  finalContent += '\n\n' + fusionSection;
                } else {
                  finalContent = fusionSection;
                }
                addedBytes += utf8ByteLength(fusionSection);
                contribuidores.push(origen.id);
              }
            }
          }
      }
      if (!isEqual) {
        action = 'anexar';
        // finalContent is already updated
      } else {
        action = 'omitir';
        finalContent = destinoContent;
        addedBytes = 0;
        contribuidores = [];
      }
    }
    planArchivos.push({
      name,
      accion: action,
      contenido: finalContent,
      bytesQueEntran: addedBytes,
      desde: contribuidores,
      idDestino: hasDestino ? e.destino.id : undefined
    });
    if (action === 'copiar') resumen.archivosNuevos++;
    else if (action === 'anexar') resumen.archivosAnexados++;
    else if (action === 'omitir') resumen.archivosOmitidos++;
    resumen.bytes += addedBytes;
  }
  // Compute includes: union without duplicates
  const includes: BrainIncludes = {
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
  const addUnique = (arr: string[], items: string[]) => {
    for (const item of items) {
      if (!arr.includes(item)) arr.push(item);
    }
  };
  // Helper to get includes from a brain
  const getIncludesFromBrain = (brainId: string) => {
    const brainIncludes = archivosMap.get(brainId)?.get('includes')?.content;
    if (brainIncludes) {
      try {
        return JSON.parse(brainIncludes) as BrainIncludes;
      } catch {
        return { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined } as BrainIncludes;
      }
    }
    return { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined } as BrainIncludes;
  };
  // Start with destino includes
  let destIncludes = getIncludesFromBrain(e.destino.id);
  addUnique(includes.vaults, destIncludes.vaults);
  addUnique(includes.backends, destIncludes.backends);
  addUnique(includes.personalities, destIncludes.personalities);
  addUnique(includes.runtimes, destIncludes.runtimes);
  addUnique(includes.tokens, destIncludes.tokens);
  addUnique(includes.memories, destIncludes.memories);
  addUnique(includes.connections, destIncludes.connections);
  includes.bindScope = includes.bindScope || destIncludes.bindScope;
   // Merge permissions: we'll just concatenate and then unique by who and level? 
   // For simplicity, we'll just concat and later we can unique by JSON.stringify
   let allPermissions: (BrainPermission | Record<string, unknown>)[] = [];
   if (Array.isArray(destIncludes.permissions)) {
     allPermissions.push(...destIncludes.permissions);
   } else {
     allPermissions.push(destIncludes.permissions);
   }
  // AI Provider: destino's or first origen's if destino doesn't have
  let aiProvider = destIncludes.aiProvider;
  if (!aiProvider) {
    for (const origen of e.origenes) {
      const inc = getIncludesFromBrain(origen.id);
      if (inc.aiProvider) {
        aiProvider = inc.aiProvider;
        break;
      }
    }
  }
  // Now add from origenes
  for (const origen of e.origenes) {
    const inc = getIncludesFromBrain(origen.id);
    addUnique(includes.vaults, inc.vaults);
    addUnique(includes.backends, inc.backends);
    addUnique(includes.personalities, inc.personalities);
    addUnique(includes.runtimes, inc.runtimes);
    addUnique(includes.tokens, inc.tokens);
    addUnique(includes.memories, inc.memories);
    addUnique(includes.connections, inc.connections);
     includes.bindScope = includes.bindScope || inc.bindScope;
     if (Array.isArray(inc.permissions)) {
       allPermissions.push(...inc.permissions);
     } else {
       allPermissions.push(inc.permissions);
     }
     if (!aiProvider && inc.aiProvider) {
       aiProvider = inc.aiProvider;
     }
  }
   // Deduplicate permissions by JSON.stringify
   const seen = new Set<string>();
   const uniquePermissions: (BrainPermission | Record<string, unknown>)[] = [];
   for (const perm of allPermissions) {
     const key = JSON.stringify(perm);
     if (!seen.has(key)) {
       seen.add(key);
       uniquePermissions.push(perm);
     }
   }
   includes.permissions = uniquePermissions as BrainPermission[] | Record<string, unknown>;
  includes.aiProvider = aiProvider;
  // Compute servers: union by id, and same endpoint counts as one
  const servers: BrainServer[] = [];
  const endpointMap = new Map<string, BrainServer>();
  const addServer = (server: BrainServer) => {
    if (!server.endpoint) {
      // No endpoint, use id
      if (!servers.find(s => s.id === server.id)) {
        servers.push(server);
      }
    } else {
      const existing = endpointMap.get(server.endpoint);
      if (existing) {
        // Already have a server with this endpoint, do nothing
      } else {
        endpointMap.set(server.endpoint, server);
        servers.push(server);
      }
    }
  };
  // Add destino servers
  const destinoServers = archivosMap.get(e.destino.id)?.get('servers')?.content;
  if (Array.isArray(destinoServers)) {
    (destinoServers as BrainServer[]).forEach(addServer);
  }
  // Add origenes servers
  for (const origen of e.origenes) {
    const origenServers = archivosMap.get(origen.id)?.get('servers')?.content;
    if (Array.isArray(origenServers)) {
      (origenServers as BrainServer[]).forEach(addServer);
    }
  }
   // Compute config: destino wins, add fusionados and fusionadoEn
   let destinoConfig: Record<string, unknown> = {};
   const destinoConfigRaw = archivosMap.get(e.destino.id)?.get('config')?.content;
   if (destinoConfigRaw) {
     try {
       destinoConfig = JSON.parse(destinoConfigRaw) as Record<string, unknown>;
     } catch {
       destinoConfig = {};
     }
   }
   const config: Record<string, unknown> = { ...destinoConfig };
   const fusionados = e.origenes.map(o => o.id);
   // Remove duplicates that are already in destino.config.fusionados
   const existingFusionados = Array.isArray(destinoConfig.fusionados) ? destinoConfig.fusionados : [];
   const newFusionados = fusionados.filter(id => !existingFusionados.includes(id));
   config.fusionados = [...existingFusionados, ...newFusionados];
   config.fusionadoEn = e.fecha;
  // Compute prefs: merge as per contract
   const prefs: PrefsCerebro = {};
   const getPrefsFromBrain = (brainId: string) => {
     const prefsContent = archivosMap.get(brainId)?.get('prefs')?.content;
     if (prefsContent) {
       try {
         return JSON.parse(prefsContent) as PrefsCerebro;
       } catch {
         return {} as PrefsCerebro;
       }
     }
     return {} as PrefsCerebro;
   };
  const destinoPrefs = getPrefsFromBrain(e.destino.id);
  // Start with destino prefs
  Object.assign(prefs, destinoPrefs);
  // Merge origenes prefs
  for (const origen of e.origenes) {
    const origenPrefs = getPrefsFromBrain(origen.id);
    for (const key in origenPrefs) {
      if (!(key in prefs)) {
        prefs[key] = origenPrefs[key];
      } else {
        // Both have the key
        const destinoVal = prefs[key];
        const origenVal = origenPrefs[key];
        // If both are arrays, union by id (if objects have id) or by value
        if (Array.isArray(destinoVal) && Array.isArray(origenVal)) {
          // Try to union by id if elements are objects with id property
          if (destinoVal.every((item: any) => typeof item === 'object' && item !== null && 'id' in item) &&
              origenVal.every((item: any) => typeof item === 'object' && item !== null && 'id' in item)) {
            const idSet = new Set<string>();
            const union: any[] = [];
            for (const item of [...destinoVal, ...origenVal]) {
              if (item.id && !idSet.has(item.id)) {
                idSet.add(item.id);
                union.push(item);
              }
            }
            prefs[key] = union;
          } else {
            // Union by JSON.stringify
            const seen = new Set<string>();
            const union: any[] = [];
            for (const item of [...destinoVal, ...origenVal]) {
              const keyStr = JSON.stringify(item);
              if (!seen.has(keyStr)) {
                seen.add(keyStr);
                union.push(item);
              }
            }
            prefs[key] = union;
          }
        } else if (typeof destinoVal === 'object' && destinoVal !== null && !Array.isArray(destinoVal) &&
                   typeof origenVal === 'object' && origenVal !== null && !Array.isArray(origenVal)) {
          // Both are objects: destino wins, fill missing keys from origen
          const merged = { ...destinoVal };
          for (const k in origenVal) {
            if (!(k in merged)) {
              merged[k] = origenVal[k];
            }
          }
          prefs[key] = merged;
        } else {
          // Other types: destino wins
          // Do nothing, keep destinoVal
        }
      }
    }
  }
  return {
    archivos: planArchivos,
    includes,
    servers,
    config,
    prefs,
    resumen
  };
}