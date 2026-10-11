import { TipoAccion } from './tipos';
import { validarAccion } from './acciones';

export type EstadoAgUi = {
  textoAcumulado: Record<string, string>;
  llamadas: Record<string, {
    name: string;
    args: string;
    result?: unknown;
    ended: boolean;
  }>;
  estado: unknown;
  estadoDesincronizado: boolean;
  contadorEventosDesconocidos: number;
  textoTotalLength: number;
  llamadasCount: number;
  argumentosTotalLength: number;
};

export const reducirEventos = (estado: EstadoAgUi | undefined, evento: unknown): EstadoAgUi => {
  // Initialize state if undefined
  const estadoActual = estado ?? {
    textoAcumulado: {},
    llamadas: {},
    estado: undefined,
    estadoDesincronizado: false,
    contadorEventosDesconocidos: 0,
    textoTotalLength: 0,
    llamadasCount: 0,
    argumentosTotalLength: 0,
  };

  // If evento is not an object or doesn't have a string type, treat as unknown
  if (typeof evento !== 'object' || evento === null || !('type' in evento) || typeof (evento as any).type !== 'string') {
    return {
      ...estadoActual,
      contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
    };
  }

  const tipo = ((evento as any).type as string).toUpperCase();
  const payload = (evento as any).payload;

  switch (tipo) {
    case 'RUN_STARTED':
    case 'RUN_FINISHED':
    case 'RUN_ERROR':
      // These events don't change state for now, but we could log or something
      return estadoActual;

    case 'TEXT_MESSAGE_START':
      // Start accumulating text for a messageId
      if (typeof payload === 'object' && payload !== null && 'messageId' in payload && typeof payload.messageId === 'string') {
        const messageId = payload.messageId;
        // Initialize empty string for this messageId if not present
        return {
          ...estadoActual,
          textoAcumulado: {
            ...estadoActual.textoAcumulado,
            [messageId]: estadoActual.textoAcumulado[messageId] ?? '',
          },
        };
      }
      // If payload malformed, treat as unknown
      return {
        ...estadoActual,
        contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
      };

    case 'TEXT_MESSAGE_CONTENT':
      if (typeof payload === 'object' && payload !== null && 'messageId' in payload && typeof payload.messageId === 'string' && 'content' in payload && typeof payload.content === 'string') {
        const messageId = payload.messageId;
        const content = payload.content;
        const currentText = estadoActual.textoAcumulado[messageId] ?? '';
        const newText = currentText + content;
        const newTotalLength = estadoActual.textoTotalLength + content.length;

        // Check text limit: 20000 characters total across all messages
        if (newTotalLength > 20000) {
          // Ignore this content chunk to stay within limit
          return estadoActual;
        }

        return {
          ...estadoActual,
          textoAcumulado: {
            ...estadoActual.textoAcumulado,
            [messageId]: newText,
          },
          textoTotalLength: newTotalLength,
        };
      }
      return {
        ...estadoActual,
        contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
      };

    case 'TEXT_MESSAGE_END':
      // No action needed, just keep the accumulated text
      return estadoActual;

    case 'TOOL_CALL_START':
      if (typeof payload === 'object' && payload !== null && 'toolCallId' in payload && typeof payload.toolCallId === 'string' && 'name' in payload && typeof payload.name === 'string') {
        // Check tool call limit: 50 calls total
        if (estadoActual.llamadasCount >= 50) {
          // Ignore this START event to stay within limit
          return estadoActual;
        }
        const toolCallId = payload.toolCallId;
        const name = payload.name;
        return {
          ...estadoActual,
          llamadas: {
            ...estadoActual.llamadas,
            [toolCallId]: { name, args: '', result: undefined, ended: false },
          },
          llamadasCount: estadoActual.llamadasCount + 1,
        };
      }
      return {
        ...estadoActual,
        contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
      };

     case 'TOOL_CALL_ARGS':
       if (typeof payload === 'object' && payload !== null && 'toolCallId' in payload && typeof payload.toolCallId === 'string' && 'args' in payload && typeof payload.args === 'string') {
         const toolCallId = payload.toolCallId;
         const argsChunk = payload.args;
         const currentCall = estadoActual.llamadas[toolCallId];
         if (!currentCall) {
           // No START event, ignore
           return estadoActual;
         }
         const newArgs = currentCall.args + argsChunk;
         const newArgsLength = newArgs.length;
         // Calculate new total arguments length: we need to subtract the old args length and add the new one
         const oldArgsLength = currentCall.args.length;
         const newTotalArgsLength = estadoActual.argumentosTotalLength - oldArgsLength + newArgsLength;

         // Check arguments limit: 20000 characters total across all tool calls
         if (newTotalArgsLength > 20000) {
           // Ignore this args chunk
           return estadoActual;
         }

         return {
           ...estadoActual,
           llamadas: {
             ...estadoActual.llamadas,
             [toolCallId]: {
               ...currentCall,
               args: newArgs,
             },
           },
           argumentosTotalLength: newTotalArgsLength,
         };
       }
       return {
         ...estadoActual,
         contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
       };

    case 'TOOL_CALL_END':
      if (typeof payload === 'object' && payload !== null && 'toolCallId' in payload && typeof payload.toolCallId === 'string') {
        const toolCallId = payload.toolCallId;
        const currentCall = estadoActual.llamadas[toolCallId];
        if (!currentCall) {
          // No START event, ignore
          return estadoActual;
        }
        // Mark the tool call as ended
        return {
          ...estadoActual,
          llamadas: {
            ...estadoActual.llamadas,
            [toolCallId]: {
              ...currentCall,
              ended: true,
            },
          },
        };
      }
      return {
        ...estadoActual,
        contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
      };

    case 'TOOL_CALL_RESULT':
      if (typeof payload === 'object' && payload !== null && 'toolCallId' in payload && typeof payload.toolCallId === 'string' && 'result' in payload) {
        const toolCallId = payload.toolCallId;
        const currentCall = estadoActual.llamadas[toolCallId];
        if (!currentCall) {
          // No START event, ignore
          return estadoActual;
        }
        return {
          ...estadoActual,
          llamadas: {
            ...estadoActual.llamadas,
            [toolCallId]: {
              ...currentCall,
              result: payload.result,
            },
          },
        };
      }
      return {
        ...estadoActual,
        contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
      };

    case 'STATE_SNAPSHOT':
      if (typeof payload === 'object' && payload !== null) {
        return {
          ...estadoActual,
          estado: payload,
          estadoDesincronizado: false, // Reset desync flag on snapshot
        };
      }
      return {
        ...estadoActual,
        contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
      };

    case 'STATE_DELTA':
      if (typeof payload === 'object' && payload !== null) {
        try {
          const nuevoEstado = aplicarDelta(estadoActual.estado, payload);
          return {
            ...estadoActual,
            estado: nuevoEstado,
            estadoDesincronizado: false,
          };
        } catch (e) {
          // If any operation fails, mark as desynchronized
          return {
            ...estadoActual,
            estadoDesincronizado: true,
          };
        }
      }
      return {
        ...estadoActual,
        contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
      };

    default:
      // Unknown event type
      return {
        ...estadoActual,
        contadorEventosDesconocidos: estadoActual.contadorEventosDesconocidos + 1,
      };
  }
};

// Helper function to apply a simple JSON Patch (only add, replace, remove) on simple paths
function aplicarDelta(estado: unknown, delta: any): unknown {
  if (!Array.isArray(delta)) {
    throw new Error('Delta must be an array');
  }

  let clone = JSON.parse(JSON.stringify(estado));

  for (const op of delta) {
    if (!op || typeof op !== 'object' || Array.isArray(op)) {
      throw new Error('Invalid patch operation');
    }
    const { op: operacion, path, value } = op;
    if (typeof operacion !== 'string' || typeof path !== 'string') {
      throw new Error('Invalid patch operation');
    }

    // Normalize path: split by '/' and skip empty first part
    const parts = path.split('/').slice(1); // removes leading empty string if path starts with '/'
    if (parts.length === 0) {
      // Root operation
      switch (operacion) {
        case 'add':
        case 'replace':
          clone = value;
          break;
        case 'remove':
          clone = undefined;
          break;
        default:
          throw new Error(`Unsupported operation: ${operacion}`);
      }
      continue;
    }

    // Navigate to the parent object
    let currentObj = clone;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof currentObj !== 'object' || currentObj === null || !(part in currentObj)) {
        throw new Error('Cannot traverse path: parent does not exist');
      }
      currentObj = currentObj[part];
      // Ensure it's an object
      if (typeof currentObj !== 'object' || currentObj === null) {
        throw new Error('Cannot traverse path: parent is not an object');
      }
    }

    const lastPart = parts[parts.length - 1];
    switch (operacion) {
      case 'add':
        if (lastPart in currentObj) {
          throw new Error('Cannot add: property already exists');
        }
        currentObj[lastPart] = value;
        break;
      case 'replace':
        if (!(lastPart in currentObj)) {
          throw new Error('Cannot replace: property does not exist');
        }
        currentObj[lastPart] = value;
        break;
      case 'remove':
        if (!(lastPart in currentObj)) {
          throw new Error('Cannot remove: property does not exist');
        }
        delete currentObj[lastPart];
        break;
      default:
        throw new Error(`Unsupported operation: ${operacion}`);
    }
  }

  return clone;
}

export const llamadasComoPropuestas = (estado: EstadoAgUi): { acciones: TipoAccion[]; problemas: string[] } => {
  const acciones: TipoAccion[] = [];
  const problemas: string[] = [];

  for (const toolCallId in estado.llamadas) {
    const llamada = estado.llamadas[toolCallId];
    if (!llamada.ended) {
      // Skip tool calls that haven't ended yet
      continue;
    }

    let input: unknown;
    try {
      input = JSON.parse(llamada.args);
    } catch (e: unknown) {
      if (e instanceof Error) {
        problemas.push(`Error al parsear argumentos de la herramienta ${llamada.name}: ${e.message}`);
      } else {
        problemas.push(`Error al parsear argumentos de la herramienta ${llamada.name}: ${String(e)}`);
      }
      continue;
    }

    const accion = {
      name: llamada.name,
      input,
    };

    try {
      const esValido = validarAccion(accion);
      if (esValido) {
        // We assume that if validarAccion returns true, the action is valid
        // We cast the name to TipoAccion (this is unsafe but we have no better option)
        acciones.push(llamada.name as TipoAccion);
      } else {
        problemas.push(`Herramienta no disponible para invitados: ${llamada.name}`);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        problemas.push(`Error al validar la acción ${llamada.name}: ${e.message}`);
      } else {
        problemas.push(`Error al validar la acción ${llamada.name}: ${String(e)}`);
      }
    }
  }

  return { acciones, problemas };
};