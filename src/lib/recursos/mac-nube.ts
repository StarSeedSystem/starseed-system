// src/lib/recursos/mac-nube.ts
// Funciones puras para planificar operaciones de sparse bundle y movimiento de datos en macOS
// Ningún efecto secundario, solo retorna planes de pasos
import { basename, join, sep } from 'node:path';

export type PlanPaso = {
  orden: number;
  descripcion: string;
  comando?: string; // comando a ejecutar (opcional, para pasos que requieren acción)
  verificacion?: string; // cómo verificar el paso (opcional)
};

export type PlanSparseBundleResult = {
  pasos: PlanPaso[];
  rutaSparseBundle: string; // ruta del sparse bundle creado
};

export type PlanMoverDatosResult = {
  pasos: PlanPaso[];
  rutaRespaldo: string; // ruta del respaldo creado (para posible vuelta atrás)
};

export type PlanVolverAtrasResult = {
  pasos: PlanPaso[];
};

/**
 * Planifica la creación y adjunción de un sparse bundle en Google Drive.
 * @param params - Parámetros: carpetaDrive (ruta base en Google Drive), nombre (nombre del sparse bundle sin extensión), tamanoGB (tamaño en GB)
 * @returns Plan con pasos para crear y adjuntar el sparse bundle
 * 
 * Requisitos:
 * - La carpetaDrive debe estar bajo ~/Library/CloudStorage/GoogleDrive-*
 * - Sintaxis de hdiutil create: hdiutil create -size <size>g -type SPARSEBUNDLE -fs APFS -volname <name> <path>
 * - Sintaxis de hdiutil attach: hdiutil attach <path>
 */
export function planSparseBundle(params: {
  carpetaDrive: string;
  nombre: string;
  tamanoGB: number;
}): PlanSparseBundleResult {
  // Sintaxis de hdiutil create: hdiutil create -size <size>g -type SPARSEBUNDLE -fs APFS -volname <name> <path>
  // Sintaxis de hdiutil attach: hdiutil attach <path>
  const sparseBundlePath = join(params.carpetaDrive, `${params.nombre}.sparsebundle`);
  const home = process.env.HOME;
  if (!home) {
    throw new Error('Variable de entorno HOME no definida');
  }
  const googleDrivePrefix = join(home, 'Library', 'CloudStorage', 'GoogleDrive-');
  // Paso 1: Verificar que la carpetaDrive está bajo Google Drive
  const pasoVerificar: PlanPaso = {
    orden: 1,
    descripcion: 'Verificar que la carpeta de Google Drive es válida',
    comando: [
      `if [[ "${params.carpetaDrive}" == "${googleDrivePrefix}"* ]]; then`,
      `  echo "Valid"`,
      `else`,
      `  echo "Error: la carpeta debe estar bajo ${googleDrivePrefix}*" >&2`,
      `  exit 1`,
      `fi`
    ].join('\\n'),
    verificacion: 'El comando debe salir con código 0 e imprimir "Valid"',
  };
  // Paso 2: Crear el sparse bundle
  const pasoCrear: PlanPaso = {
    orden: 2,
    descripcion: `Crear sparse bundle de ${params.tamanoGB}GB con nombre ${params.nombre}`,
    comando: `hdiutil create -size ${params.tamanoGB}g -type SPARSEBUNDLE -fs APFS -volname "${params.nombre}" "${sparseBundlePath}"`,
    verificacion: 'El sparse bundle debe existir en la ruta especificada',
  };
  // Paso 3: Adjuntar el sparse bundle
  const pasoAdjuntar: PlanPaso = {
    orden: 3,
    descripcion: 'Adjuntar el sparse bundle',
    comando: `hdiutil attach "${sparseBundlePath}"`,
    verificacion: 'El sparse bundle debe estar adjunto y visible en /Volumes',
  };
  return {
    pasos: [pasoVerificar, pasoCrear, pasoAdjuntar],
    rutaSparseBundle: sparseBundlePath,
  };
}

/**
 * Planifica el movimiento de los datos de una app a un destino (sparse bundle) y crea un enlace simbólico.
 * @param params - Parámetros: app (ruta de la app .app), origen (ruta actual de la app), destino (ruta dentro del sparse bundle donde se moverá la app)
 * @returns Plan con pasos para cerrar la app, copiar, verificar, renombrar original como respaldo, crear enlace y probar apertura
 * 
 * Pasos:
 * 1. Comprobar que la app está cerrada (por nombre de proceso o verificando que no esté en ejecución)
 * 2. Ejecutar ditto desde origen a destino (preservando atributos y forks)
 * 3. Verificar que los tamaños coincidan (comparar tamaño de origen y destino)
 * 4. Renombrar el original a <origen>.respaldo-starseed
 * 5. Crear enlace simbólico desde origen hacia destino (ln -s <destino> <origen>)
 * 6. Probar que la app abre (ejecutar open <origen> y verificar que el proceso se inicia)
 * 
 * Nota: Borrar el respaldo es una acción aparte que requiere confirmação explícita de la persona.
 */
export function planMoverDatos(params: {
  app: string;
  origen: string;
  destino: string;
}): PlanMoverDatosResult {
  const appName = basename(params.origen).replace('.app', '');
  const respaldoPath = `${params.origen}.respaldo-starseed`;
  // Paso 1: Comprobar que la app está cerrada
  const pasoCerrada: PlanPaso = {
    orden: 1,
    descripcion: `Verificar que la app ${appName} no está en ejecución`,
    comando: `if pgrep -x "${appName}" > /dev/null; then echo "Error: la app ${appName} está en ejecución" >&2; exit 1; else echo "App cerrada"; fi`,
    verificacion: 'El comando debe salir con código 0 e imprimir "App cerrada"',
  };
  // Paso 2: Ejecutar ditto
  const pasoDitto: PlanPaso = {
    orden: 2,
    descripcion: `Copiar la app desde ${params.origen} a ${params.destino} preservando atributos`,
    comando: `ditto "${params.origen}" "${params.destino}"`,
    verificacion: 'La app debe existir en el destino con los mismos atributos',
  };
  // Paso 3: Verificar tamaños
  const pasoVerificarTamanos: PlanPaso = {
    orden: 3,
    descripcion: 'Verificar que los tamaños de origen y destino coincidan',
    comando: [
      `tamano_origen=$(du -sh "${params.origen}" | cut -f1)`,
      `tamano_destino=$(du -sh "${params.destino}" | cut -f1)`,
      `if [ "$tamano_origen" = "$tamano_destino" ]; then`,
      `  echo "Tamaños igual: $tamano_origen"`,
      `else`,
      `  echo "Error: tamaños difieren (origen: $tamano_origen, destino: $tamano_destino)" >&2`,
      `  exit 1`,
      `fi`
    ].join('\\n'),
    verificacion: 'El comando debe salir con código 0 e indicar que los tamaños son iguales',
  };
  // Paso 4: Renombrar original como respaldo
  const pasoRespaldo: PlanPaso = {
    orden: 4,
    descripcion: `Renombrar la app original a ${respaldoPath} como respaldo`,
    comando: `mv "${params.origen}" "${respaldoPath}"`,
    verificacion: `El respaldo debe existir en ${respaldoPath} y la ruta original debe haber desaparecido`,
  };
  // Paso 5: Crear enlace simbólico
  const pasoEnlace: PlanPaso = {
    orden: 5,
    descripcion: `Crear enlace simbólico desde ${params.origen} a ${params.destino}`,
    comando: `ln -s "${params.destino}" "${params.origen}"`,
    verificacion: `El enlace simbólico debe existir en ${params.origen} y apuntar a ${params.destino}`,
  };
  // Paso 6: Probar que la app abre
  const pasoProbarApertura: PlanPaso = {
    orden: 6,
    descripcion: `Probar que la app ${appName} abre correctamente`,
    comando: `open "${params.origen}" && sleep 2 && if pgrep -x "${appName}" > /dev/null; then echo "App abierta"; else echo "Error: la app no se abrió" >&2; exit 1; fi`,
    verificacion: 'El comando debe salir con código 0 e imprimir "App abierta"',
  };
  return {
    pasos: [pasoCerrada, pasoDitto, pasoVerificarTamanos, pasoRespaldo, pasoEnlace, pasoProbarApertura],
    rutaRespaldo: respaldoPath,
  };
}

/**
 * Planifica la vuelta atrás: restaurar la app original desde el respaldo y eliminar el enlace simbólico.
 * @param params - Parámetros: origen (ruta original de la app, que actualmente es un enlace simbólico), destino (ruta dentro del sparse bundle donde está la app movida), respaldo (ruta del respaldo, por defecto <origen>.respaldo-starseed)
 * @returns Plan con pasos para eliminar el enlace, mover el respaldo de vuelta a origen y verificar
 */
export function planVolverAtras(params: {
  origen: string;
  destino: string;
  respaldo?: string;
}): PlanVolverAtrasResult {
  const respaldoPath = params.respaldo ?? `${params.origen}.respaldo-starseed`;
  // Paso 1: Eliminar el enlace simbólico en origen
  const pasoEliminarEnlace: PlanPaso = {
    orden: 1,
    descripcion: `Eliminar el enlace simbólico en ${params.origen}`,
    comando: `rm "${params.origen}"`,
    verificacion: `El enlace simbólico debe haber desaparecido; ${params.origen} no debe existir`,
  };
  // Paso 2: Mover el respaldo de vuelta a origen
  const pasoRestaurar: PlanPaso = {
    orden: 2,
    descripcion: `Restaurar la app desde el respaldo ${respaldoPath} a ${params.origen}`,
    comando: `mv "${respaldoPath}" "${params.origen}"`,
    verificacion: `La app debe existir en ${params.origen} y el respaldo debe haber desaparecido`,
  };
  // Paso 3: Verificar que la app está en su lugar y no es un enlace
  const pasoVerificar: PlanPaso = {
    orden: 3,
    descripcion: `Verificar que ${params.origen} es una app válida y no un enlace simbólico`,
    comando: [
      `if [ -d "${params.origen}" ] && [ ! -L "${params.origen}" ]; then`,
      `  echo "App restaurada correctamente"`,
      `else`,
      `  echo "Error: la ruta no es un directorio o es un enlace" >&2`,
      `  exit 1`,
      `fi`
    ].join('\\n'),
    verificacion: 'El comando debe salir con código 0 e imprimir "App restaurada correctamente"',
  };
  return {
    pasos: [pasoEliminarEnlace, pasoRestaurar, pasoVerificar],
  };
}