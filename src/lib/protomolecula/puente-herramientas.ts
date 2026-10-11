/**
 * Protomolécula · PUENTE HERRAMIENTAS. Protocolo OS⇄marco aislado.
 * Contrato: architecture/protomolecula.md §11.1 (líneas 395-398).
 * Módulo PURO: se inyectan window y reloj; sin React, sin red, sin node:* .
 */

import type { Parametro } from "./tipos";
import type { DefinicionAtomo } from "./registro-atomos";

// ══════════════════════════════════════════════════════════════════════════════════
// TIPOS DE MENSAJE
// ══════════════════════════════════════════════════════════════════════════════════

export const VERSION_PUENTE = 1;

export const TIPOS_DE_MENSAJE_HERRAMIENTA_OS = [
  "hola",
  "cambio",
  "exportar",
  "listo",
  "error",
] as const;
export type TipoDeMensajeHerramientaOS = (typeof TIPOS_DE_MENSAJE_HERRAMIENTA_OS)[number];

export const TIPOS_DE_MENSAJE_OS_HERRAMIENTA = [
  "establecer",
  "estado",
  "disparar",
] as const;
export type TipoDeMensajeOSHerramienta = (typeof TIPOS_DE_MENSAJE_OS_HERRAMIENTA)[number];

export interface MensajeBase {
  protomolecula: typeof VERSION_PUENTE;
  tipo: string;
  canal: string;
}

export interface MensajeHola extends MensajeBase {
  tipo: "hola";
  nombre?: string;
  parametros?: Parametro[];
}

export interface MensajeCambio extends MensajeBase {
  tipo: "cambio";
  parametroId: string;
  valor: unknown; // Se valida contra el tipo del parámetro declarado
}

export interface MensajeExportar extends MensajeBase {
  tipo: "exportar";
  formato: string;
  datos: unknown; // Se limita a 2 MB
}

export interface MensajeListo extends MensajeBase {
  tipo: "listo";
}

export interface MensajeError extends MensajeBase {
  tipo: "error";
  mensaje: string;
}

export type MensajeDeHerramientaAOS =
  | MensajeHola
  | MensajeCambio
  | MensajeExportar
  | MensajeListo
  | MensajeError;

export interface MensajeEstablecer extends MensajeBase {
  tipo: "establecer";
  parametroId: string;
  valor: unknown; // Se valida contra el tipo del parámetro declarado
}

export interface MensajeEstado extends MensajeBase {
  tipo: "estado";
  valores: Record<string, unknown>; // Estado de todos los parámetros
}

export interface MensajeDisparar extends MensajeBase {
  tipo: "disparar";
  parametroId: string;
}

export type MensajeDeOSAHerramienta =
  | MensajeEstablecer
  | MensajeEstado
  | MensajeDisparar;

// ══════════════════════════════════════════════════════════════════════════════════
// FUNCIÓN DE CREACIÓN DE TOKEN
// ══════════════════════════════════════════════════════════════════════════════════

/**
 * Crea un token aleatorio de 16 bytes en formato hexadecimal.
 * En producción se inyecta `crypto.getRandomValues`.
 */
export function crearToken(aleatorio: (n: number) => Uint8Array): string {
  const bytes = aleatorio(16);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

// ══════════════════════════════════════════════════════════════════════════════════
// TIPOS DE ESTADO Y ENTRADA
// ══════════════════════════════════════════════════════════════════════════════════

export interface Marco {
  ventana: unknown; // contentWindow del iframe
  token: string;
  origenEsperado: string | null; // null para marcos propios con sandbox sin allow-same-origin
  parametros?: Parametro[]; // Parámetros declarados por la herramienta
}

export interface EstadoLimite {
  mensajesPorSegundo: number; // Límite de frecuencia (120 por segundo por marco)
  ultimoSegundo: number; // Segundo actual del reloj simulado
  contadorMensajes: number; // Mensajes en el segundo actual
}

export interface EntradaPuente {
  tipo: "hola" | "cambio" | "exportar" | "listo" | "error";
  canal: string;
  [key: string]: unknown;
}

// ══════════════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL DE PROCESAMIENTO
// ══════════════════════════════════════════════════════════════════════════════════

/**
 * Procesa un mensaje entrante del marco.
 * Devuelve la entrada válida o null si no pasa las validaciones.
 * También devuelve el estado actualizado del limitador de frecuencia y un motivo opcional de rechazo.
 */
export function procesarMensaje(
  ev: { origin: string; source: unknown; data: unknown },
  marco: Marco,
  ahora: number, // Timestamp en ms del reloj simulado
  estado: EstadoLimite
): { entrada: EntradaPuente | null; estado: EstadoLimite; motivo?: string } {
  // 1. Validar que el source coincida con la ventana del marco
  if (ev.source !== marco.ventana) {
    return {
      entrada: null,
      estado,
      motivo: "Source del evento no coincide con la ventana del marco",
    };
  }

  // 2. Validar el origen según el tipo de marco
  if (marco.origenEsperado === null) {
    // Marco propio con sandbox sin allow-same-origin: origen debe ser "null"
    if (ev.origin !== "null") {
      return {
        entrada: null,
        estado,
        motivo: "Origen esperado 'null' para marco con sandbox sin allow-same-origin",
      };
    }
  } else {
    // Marco con origen esperado específico
    if (ev.origin !== marco.origenEsperado) {
      return {
        entrada: null,
        estado,
        motivo: `Origen inesperado: se esperaba ${marco.origenEsperado}, se recibió ${ev.origin}`,
      };
    }
  }

  // 3. Validar que los datos sean un objeto y tengan la estructura básica
  if (!ev.data || typeof ev.data !== "object") {
    return {
      entrada: null,
      estado,
      motivo: "Los datos del mensaje no son un objeto válido",
    };
  }

  const datos = ev.data as Record<string, unknown>;

  // 4. Validar versión y canal
  if (
    !(datos as { protomolecula?: number }).protomolecula ||
    (datos as { protomolecula?: number }).protomolecula !== VERSION_PUENTE
  ) {
    return {
      entrada: null,
      estado,
      motivo: `Versión de protomolecula incorrecta o faltante`,
    };
  }

  if (
    typeof datos.canal !== "string" ||
    datos.canal !== marco.token
  ) {
    return {
      entrada: null,
      estado,
      motivo: "Canal del mensaje no coincide con el token del marco",
    };
  }

  // 5. Validar tipo de mensaje conocido
  const tipo = datos.tipo as string;
  if (
    !TIPOS_DE_MENSAJE_HERRAMIENTA_OS.includes(tipo as TipoDeMensajeHerramientaOS) &&
    !TIPOS_DE_MENSAJE_OS_HERRAMIENTA.includes(tipo as TipoDeMensajeOSHerramienta)
  ) {
    // Ignorar tipos desconocidos según el contrato
    return {
      entrada: null,
      estado,
      motivo: `Tipo de mensaje desconocido ignorado: ${tipo}`,
    };
  }

  // 6. Validar límite de frecuencia (120 mensajes por segundo por marco)
  const segundoActual = Math.floor(ahora / 1000);
  const estadoActualizado = { ...estado };

  if (segundoActual !== estado.ultimoSegundo) {
    // Nuevo segundo, resetear contador
    estadoActualizado.ultimoSegundo = segundoActual;
    estadoActualizado.contadorMensajes = 1;
  } else {
    // Mismo segundo, incrementar contador y verificar límite
    estadoActualizado.contadorMensajes++;
    if (estadoActualizado.contadorMensajes > estado.mensajesPorSegundo) {
      return {
        entrada: null,
        estado: estadoActualizado,
        motivo: `Límite de frecuencia excedido: ${estadoActualizado.contadorMensajes} mensajes en el segundo ${segundoActual}`,
      };
    }
  }

   // 7. Validar tamaño máximo del JSON (2.6 MB)
     const tamañoJSON = new TextEncoder().encode(JSON.stringify(datos)).length;
     if (tamañoJSON > 2.6 * 1024 * 1024) {
       // 2.6 MB = 2726297.6 bytes
       return {
         entrada: null,
         estado: estadoActualizado,
         motivo: `Tamanho del mensaje excede el límite de 2.6 MB: ${tamañoJSON} bytes`,
       };
     }

  // 8. Procesar según el tipo de mensaje
  switch (tipo) {
    case "hola": {
      const mensaje = datos as unknown as MensajeHola;
      // Validar opcionalmente nombre y parametros
      if (mensaje.nombre !== undefined && typeof mensaje.nombre !== "string") {
        return {
          entrada: null,
          estado: estadoActualizado,
          motivo: "El campo 'nombre' en mensaje hola debe ser una cadena",
        };
      }
      if (
        mensaje.parametros !== undefined &&
        (!Array.isArray(mensaje.parametros) ||
          mensaje.parametros.some(p => !(p as Parametro).id || !(p as Parametro).nombre))
      ) {
        return {
          entrada: null,
          estado: estadoActualizado,
          motivo: "El campo 'parametros' en mensaje hola debe ser un array de parámetros válidos",
        };
      }
      return {
        entrada: {
          tipo: "hola",
          canal: mensaje.canal,
          nombre: mensaje.nombre,
          parametros: mensaje.parametros,
        },
        estado: estadoActualizado,
      };
    }

    case "cambio": {
      const mensaje = datos as unknown as MensajeCambio;
      if (typeof mensaje.parametroId !== "string" || !mensaje.parametroId) {
        return {
          entrada: null,
          estado: estadoActualizado,
          motivo: "El campo 'parametroId' en mensaje cambio es requerido y debe ser una cadena no vacía",
        };
      }
      // El valor se valida contra el tipo del parámetro declarado en el núcleo (no aquí)
      return {
        entrada: {
          tipo: "cambio",
          canal: mensaje.canal,
          parametroId: mensaje.parametroId,
          valor: mensaje.valor,
        },
        estado: estadoActualizado,
      };
    }

    case "exportar": {
      const mensaje = datos as unknown as MensajeExportar;
      if (typeof mensaje.formato !== "string" || !mensaje.formato) {
        return {
          entrada: null,
          estado: estadoActualizado,
          motivo: "El campo 'formato' en mensaje exportar es requerido y debe ser una cadena no vacía",
        };
      }
      // Validar tamaño máximo de datos (2 MB)
      const tamañoDatos = new TextEncoder().encode(JSON.stringify(mensaje.datos)).length;
      if (tamañoDatos > 2 * 1024 * 1024) {
        // 2 MB = 2097152 bytes
        return {
          entrada: null,
          estado: estadoActualizado,
          motivo: `Tamanho de los datos en mensaje exportar excede el límite de 2 MB: ${tamañoDatos} bytes`,
        };
      }
      return {
        entrada: {
          tipo: "exportar",
          canal: mensaje.canal,
          formato: mensaje.formato,
          datos: mensaje.datos,
        },
        estado: estadoActualizado,
      };
    }

    case "listo": {
      const mensaje = datos as unknown as MensajeListo;
      return {
        entrada: {
          tipo: "listo",
          canal: mensaje.canal,
        },
        estado: estadoActualizado,
      };
    }

    case "error": {
      const mensaje = datos as unknown as MensajeError;
      if (typeof mensaje.mensaje !== "string" || !mensaje.mensaje) {
        return {
          entrada: null,
          estado: estadoActualizado,
          motivo: "El campo 'mensaje' en mensaje error es requerido y debe ser una cadena no vacía",
        };
      }
      return {
        entrada: {
          tipo: "error",
          canal: mensaje.canal,
          mensaje: mensaje.mensaje,
        },
        estado: estadoActualizado,
      };
    }

    // Los mensajes OS→herramienta no se procesan aquí (son salidas)
    case "establecer":
    case "estado":
    case "disparar":
    default:
      return {
        entrada: null,
        estado: estadoActualizado,
        motivo: `Tipo de mensaje no procesado en esta dirección: ${tipo}`,
      };
  }
}

// ══════════════════════════════════════════════════════════════════════════════════
// FUNCIÓN DE CREACIÓN DE MENSAJE PARA MARCO
// ══════════════════════════════════════════════════════════════════════════════════

/**
 * Crea un mensaje para enviar al marco.
 */
export function mensajeParaMarco(
  tipo: string,
  payload: Record<string, unknown>,
  token: string
): Record<string, unknown> {
  return {
    protomolecula: VERSION_PUENTE,
    tipo,
    canal: token,
    ...payload,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════
// FUNCIÓN DE DESTINO DEL MARCO
// ══════════════════════════════════════════════════════════════════════════════════

/**
 * Devuelve el destino para enviar un mensaje al marco.
 * "*" si el origen es opaco (marco propio con sandbox sin allow-same-origin).
 * El origen exacto si es real.
 * NOTA: Según el comentario en el contrato, se deja como "*" porque es seguro 
 * ya que el mensaje solo se entrega a ese contentWindow específico.
 */
export function destinoDe(marco: Marco): string {
  // Si el origen es opaco (sandbox sin allow-same-origin), usar "*"
  // Esto es seguro porque el mensaje solo se entrega al contentWindow específico
  if (marco.origenEsperado === null) {
    return "*";
  }
  // Para marcos con origen real, usar el origen exacto
  return marco.origenEsperado;
}

// ══════════════════════════════════════════════════════════════════════════════════
// FUNCIÓN DE VALIDACIÓN DE URL EMBEBIBLE
// ══════════════════════════════════════════════════════════════════════════════════

/**
 * Valida si una URL es embebible según los criterios de seguridad.
 */
export function esUrlEmbebible(
  url: string,
  origenOS: string
): { ok: true; origen: string } | { ok: false; motivo: string } {
  try {
    // Prohibir esquemas peligrosos primero
    const lowerUrl = url.toLowerCase();
    if (
      lowerUrl.startsWith("javascript:") ||
      lowerUrl.startsWith("data:") ||
      lowerUrl.startsWith("blob:")
    ) {
      return { ok: false, motivo: "Esquema de URL prohibido" };
    }
    
    const u = new URL(url);
    
    // Solo permitir https:
    if (u.protocol !== "https:") {
      return { ok: false, motivo: "Solo se permiten URLs con protocolo https:" };
    }
    
    // No permitir credenciales en la URL
    if (u.username || u.password) {
      return { ok: false, motivo: "La URL no puede contener credenciales" };
    }
    
    // No permitir que sea del mismo origen que el OS
    if (u.origin === origenOS) {
      return { ok: false, motivo: "La URL no puede ser del mismo origen que el OS" };
    }
    
    return { ok: true, origen: u.origin };
  } catch (e) {
    return { ok: false, motivo: "URL inválida" };
  }
}