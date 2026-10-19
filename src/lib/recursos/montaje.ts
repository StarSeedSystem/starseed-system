export type Sistema = 'macos' | 'windows' | 'linux';
export type TipoOrigen = 'webdav' | 'rclone';
export interface Origen {
  tipo: TipoOrigen;
  url?: string;
  remoto?: string;
}
export interface OrdenMontaje {
  args: string[];
  texto: string;
}

/**
 * Valida que el punto de montaje esté dentro de la carpeta de la persona y no contenga '..'
 * En esta implementación pura, asumimos que el punto es un camino absoluto y solo verificamos que no contenga '..'
 * y que no esté vacío.
 */
export function validarPunto(punto: string): boolean {
  return punto.trim() !== '' && !punto.includes('..');
}

/**
 * Genera las órdenes de montaje según el sistema, origen, punto y si es solo lectura.
 * Devuelve un array de órdenes (cada orden tiene args y texto para copiar).
 */
export function ordenesMontaje({
  sistema,
  origen,
  punto,
  soloLectura,
}: {
  sistema: Sistema;
  origen: Origen;
  punto: string;
  soloLectura: boolean;
}): OrdenMontaje[] {
  if (!validarPunto(punto)) {
    return [];
  }

  const { tipo, url, remoto } = origen;
  // Nota: Los parámetros url y remoto podrían ser usados según el tipo de origen.
  // Por simplicidad, usamos url si está definido,否则 remoto.
  const recurso = url ?? remoto ?? '';
  if (!recurso) {
    return [];
  }

  const orders: OrdenMontaje[] = [];

  if (sistema === 'macos') {
    if (tipo === 'webdav') {
      const args = ['mount_webdav', recurso, punto];
      const texto = `mount_webdav ${recurso} ${punto}`;
      orders.push({ args, texto });
    } else if (tipo === 'rclone') {
      let args = ['rclone', 'nfsmount', recurso, punto, '--vfs-cache-mode', 'full'];
      let texto = `rclone nfsmount ${recurso} ${punto} --vfs-cache-mode full`;
      if (soloLectura) {
        args = [...args, '--read-only'];
        texto += ' --read-only';
      }
      orders.push({ args, texto });
    }
  } else if (sistema === 'windows') {
    if (tipo === 'webdav') {
      // net use <punto> <recurso>
      const args = ['net use', punto, recurso];
      const texto = `net use ${punto} ${recurso}`;
      orders.push({ args, texto });
    } else if (tipo === 'rclone') {
      let args = ['rclone', 'mount', recurso, punto, '--vfs-cache-mode', 'full'];
      let texto = `rclone mount ${recurso} ${punto} --vfs-cache-mode full`;
      if (soloLectura) {
        args = [...args, '--read-only'];
        texto += ' --read-only';
      }
      orders.push({ args, texto });
    }
  } else if (sistema === 'linux') {
    if (tipo === 'webdav') {
      // Usamos davfs2 mediante mount -t davfs
      let args = ['mount', '-t', 'davfs', recurso, punto];
      let texto = `mount -t davfs ${recurso} ${punto}`;
      if (soloLectura) {
        // Para davfs2, la opción de solo lectura se pasa con -o ro
        args = ['mount', '-t', 'davfs', '-o', 'ro', recurso, punto];
        texto = `mount -t davfs -o ro ${recurso} ${punto}`;
      }
      orders.push({ args, texto });
    } else if (tipo === 'rclone') {
      let args = ['rclone', 'mount', recurso, punto, '--vfs-cache-mode', 'full'];
      let texto = `rclone mount ${recurso} ${punto} --vfs-cache-mode full`;
      if (soloLectura) {
        args = [...args, '--read-only'];
        texto += ' --read-only';
      }
      orders.push({ args, texto });
    }
  }

  return orders;
}

/**
 * Genera la orden de desmontaje según el sistema y el punto.
 * Devuelve una orden (args y texto) o un array vacío si el punto no es válido.
 */
export function ordenDesmontar({
  sistema,
  punto,
}: {
  sistema: Sistema;
  punto: string;
}): OrdenMontaje | null {
  if (!validarPunto(punto)) {
    return null;
  }

  let args: string[] = [];
  let texto: string = '';

  if (sistema === 'macos' || sistema === 'linux') {
    args = ['umount', punto];
    texto = `umount ${punto}`;
  } else if (sistema === 'windows') {
    args = ['net use', punto, '/delete'];
    texto = `net use ${punto} /delete`;
  }

  return { args, texto };
}