import { z } from 'zod';

// Tipos para la función ordenesMontaje
export type Sistema = 'macos' | 'windows' | 'linux';

export type TipoOrigen = 'webdav' | 'rclone';

export interface OrigenWebdav {
  tipo: 'webdav';
  url: string;
}

export interface OrigenRclone {
  tipo: 'rclone';
  remoto: string; // nombre del remoto configurado en rclone
  url?: string; // path dentro del remoto, opcional
}

export type Origen = OrigenWebdav | OrigenRclone;

export interface PuntosMontaje {
  punto: string; // ruta absoluta donde montar
  soloLectura: boolean;
}

export interface OrdenMontaje {
  args: string[]; // argumentos para ejecutar el comando
  textoParaCopiar: string; // texto listo para copiar y pegar en terminal
}

export interface ResultadoMontaje {
  montaje: OrdenMontaje;
  desmontaje: OrdenMontaje;
}

// Esquema de validación para entrada
const esquemaOrigenWebdav = z.object({
  tipo: z.literal('webdav'),
  url: z.string().url(),
});

const esquemaOrigenRclone = z.object({
  tipo: z.literal('rclone'),
  remoto: z.string().min(1),
  url: z.string().optional(),
});

const esquemaOrigen = z.union([esquemaOrigenWebdav, esquemaOrigenRclone]);

const esquemaEntrada = z.object({
  sistema: z.enum(['macos', 'windows', 'linux']),
  origen: esquemaOrigen,
  punto: z.string(),
  soloLectura: z.boolean(),
});

/**
 * Genera las órdenes de montaje y desmontaje para un volumen por bandas
 * @param params Parámetros de configuración
 * @returns Órdenes de montaje y desmontaje
 */
export function ordenesMontaje(params: z.input<typeof esquemaEntrada>): ResultadoMontaje {
  // TODO: Implementar validación y generación de órdenes
  const { sistema, origen, punto, soloLectura } = params;
  
  // Validar punto de montaje (debe estar dentro de la carpeta de la persona, sin ..)
  // Para ahora, devolvemos un resultado placeholder
  return {
    montaje: {
      args: ['echo', 'mount placeholder'],
      textoParaCopiar: 'echo "comando de mount placeholder"'
    },
    desmontaje: {
      args: ['echo', 'unmount placeholder'],
      textoParaCopiar: 'echo "comando de unmount placeholder"'
    }
  };
}