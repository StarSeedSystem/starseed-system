// Mac en la nube: sparse bundle APFS en Google Drive y mover datos pesados (architecture/apps-en-la-malla.md §8)
// Puro: sin node:*, sin disco real, sin procesos; todo inyectable.

export interface Paso {
  orden: string;
  descripcion: string;
  requiereConfirmacion?: boolean;
}

export interface PlanSparseBundle {
  pasos: Paso[];
  rutaBundle: string;
  comprobacionCarpeta: boolean;
}

export interface PlanMoverDatos {
  pasos: Paso[];
  respaldoRenombrado?: string;
  enlaceCreado?: string;
}

export interface PlanVolverAtras {
  pasos: Paso[];
  respaldoAUsar: string;
}

// Nota: la sintaxis real (verificada con `hdiutil create -help` en macOS):
// `hdiutil create -size <n>g -type SPARSEBUNDLE -fs APFS -volname <nombre> <ruta>`
// `hdiutil attach <ruta>`

export interface ComprobadorAppCerrada { (app: string): boolean; }
export interface EjecutorDitto { (origen: string, destino: string): boolean; }
export interface VerificadorTamanos { (origen: string, destino: string): boolean; }
export interface ComprobadorAppAbre { (app: string): boolean; }

export function planSparseBundle({
  carpetaDrive,
  nombre,
  tamanoGB,
}: {
  carpetaDrive: string;
  nombre: string;
  tamanoGB: number;
}): PlanSparseBundle {
  const rutaBundle = `${carpetaDrive}/${nombre}.sparsebundle`;
  const estaBajoDrive = carpetaDrive.includes("~/Library/CloudStorage/GoogleDrive-");
  const pasos: Paso[] = [
    {
      orden: "hdiutil create -size <n>g ...",
      descripcion: `Crear bundle APFS ${tamanoGB} GB: hdiutil create -size ${tamanoGB}g -type SPARSEBUNDLE -fs APFS -volname ${nombre} ${rutaBundle}`,
    },
    {
      orden: "hdiutil attach <ruta>",
      descripcion: `Montar: hdiutil attach ${rutaBundle}`,
    },
  ];
  return { pasos, rutaBundle, comprobacionCarpeta: estaBajoDrive };
}

export function planMoverDatos({
  app,
  origen,
  destino,
  appCerrada,
  ejecutarDitto,
  verificarTamanos,
  comprobarAbre,
}: {
  app: string;
  origen: string;
  destino: string;
  appCerrada: ComprobadorAppCerrada;
  ejecutarDitto: EjecutorDitto;
  verificarTamanos: VerificadorTamanos;
  comprobarAbre: ComprobadorAppAbre;
}): PlanMoverDatos {
  const pasos: Paso[] = [];
  if (!appCerrada(app)) {
    pasos.push({
      orden: "verificar-app-cerrada",
      descripcion: `Comprobar que la app ${app} está cerrada antes de mover datos.`,
      requiereConfirmacion: true,
    });
  }
  pasos.push({ orden: "ditto", descripcion: `ditto ${origen} ${destino}` });
  pasos.push({ orden: "verificar-tamanos", descripcion: `Verificar ${origen} vs ${destino}` });
  pasos.push({ orden: "renombrar-respaldo", descripcion: `mv ${origen} ${origen}.respaldo-starseed` });
  pasos.push({ orden: "ln -s", descripcion: `ln -s ${destino} ${origen}` });
  pasos.push({ orden: "probar-apertura", descripcion: `Probar que ${app} abre` });
  return {
    pasos,
    respaldoRenombrado: `${origen}.respaldo-starseed`,
    enlaceCreado: destino,
  };
}

export function planVolverAtras({
  respaldo,
  original,
}: {
  respaldo: string;
  original: string;
}): PlanVolverAtras {
  const pasos: Paso[] = [
    {
      orden: "eliminar-enlace",
      descripcion: `Eliminar el enlace simbólico actual: rm ${original}`,
    },
    {
      orden: "restaurar-respaldo",
      descripcion: `Restaurar el respaldo: mv ${respaldo} ${original}`,
    },
  ];
  return { pasos, respaldoAUsar: respaldo };
}
