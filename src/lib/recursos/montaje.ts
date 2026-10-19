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
 * Valida que el punto de montaje esté dentro de la carpeta de la persona y no contenga '..'
 * @param punto Ruta absoluta a validar
 * @returns true si es válido, false en caso contrario
 */
function validarPuntoMontaje(punto: string): boolean {
  // Verificar que no contenga '..' para evitar escape de directorio
  if (punto.includes('..')) {
    return false;
  }

  // Verificar que sea una ruta absoluta
  if (
    (punto.startsWith('/') && !punto.startsWith('//')) || // Unix-like absolute path
    /^[a-zA-Z]:\\/.test(punto) // Windows absolute path (e.g., C:\ )
  ) {
    return true;
  }

  return false;
}

/**
 * Genera las órdenes de montaje y desmontaje para un volumen por bandas
 * @param params Parámetros de configuración
 * @returns Órdenes de montaje y desmontaje
 */
export function ordenesMontaje(params: z.input<typeof esquemaEntrada>): ResultadoMontaje {
  const { sistema, origen, punto, soloLectura } = params;

  // Validar punto de montaje
  if (!validarPuntoMontaje(punto)) {
    throw new Error(`Punto de montaje inválido: ${punto}. Debe ser una ruta absoluta dentro de la carpeta de la persona y no contener '..'.`);
  }

  let montajeArgs: string[] = [];
  let desmontajeArgs: string[] = [];
  let montajeTexto: string = '';
  let desmontajeTexto: string = '';

  if (origen.tipo === 'webdav') {
    const { url } = origen;

    switch (sistema) {
      case 'macos':
        // mount_webdav URL MOUNT_POINT
        montajeArgs = ['mount_webdav', url, punto];
        montajeTexto = `mount_webdav ${url} ${punto}`;
        // umount MOUNT_POINT
        desmontajeArgs = ['umount', punto];
        desmontajeTexto = `umount ${punto}`;
        break;

      case 'windows':
        // net use * URL (se pedirán credenciales o se usarán de credenciales guardadas)
        // Usamos * para que asigne la próxima letra disponible
        montajeArgs = ['net', 'use', '*', url];
        montajeTexto = `net use * ${url}`;
        // net use * URL /delete
        desmontajeArgs = ['net', 'use', '*', url, '/delete'];
        desmontajeTexto = `net use * ${url} /delete`;
        break;

      case 'linux':
        // mount.davfs URL MOUNT_POINT -o rw (o ro)
        const opciones = soloLectura ? '-o ro' : '-o rw';
        montajeArgs = ['mount.davfs', url, punto, opciones];
        montajeTexto = `mount.davfs ${url} ${punto} ${opciones}`;
        // umount MOUNT_POINT
        desmontajeArgs = ['umount', punto];
        desmontajeTexto = `umount ${punto}`;
        break;
    }
  } else if (origen.tipo === 'rclone') {
    const { remoto, url } = origen;
    const rutaRemota = url ? `${remoto}:${url}` : `${remoto}:`;

    switch (sistema) {
      case 'macos':
        // rclone nfsmount REMOTE:PATH MOUNT_POINT --vfs-cache-mode full
        montajeArgs = ['rclone', 'nfsmount', rutaRemota, punto, '--vfs-cache-mode', 'full'];
        montajeTexto = `rclone nfsmount ${rutaRemota} ${punto} --vfs-cache-mode full`;
        // umount MOUNT_POINT
        desmontajeArgs = ['umount', punto];
        desmontajeTexto = `umount ${punto}`;
        break;

      case 'linux':
        // rclone mount REMOTE:PATH MOUNT_POINT --vfs-cache-mode full
        montajeArgs = ['rclone', 'mount', rutaRemota, punto, '--vfs-cache-mode', 'full'];
        montajeTexto = `rclone mount ${rutaRemota} ${punto} --vfs-cache-mode full`;
        // fusermount -u MOUNT_POINT o umount MOUNT_POINT
        desmontajeArgs = ['fusermount', '-u', punto];
        desmontajeTexto = `fusermount -u ${punto}`;
        break;

      case 'windows':
        // Según el documento, Windows solo soporta WebDAV vía net use, no rclone
        throw new Error('Rclone no está soportado en Windows según las restricciones del documento.');
    }
  }

  return {
    montaje: {
      args: montajeArgs,
      textoParaCopiar: montajeTexto
    },
    desmontaje: {
      args: desmontajeArgs,
      textoParaCopiar: desmontajeTexto
    }
  };
}