'use client';

import type { Estacion } from './tipos';
import type { EstacionOida } from './malla';
import { faroDeEstacion, estacionesDeFaros } from './malla';
import { enviarMensaje } from '../malla/transporte-universal';
import { enlacesLocalesVivos } from '../malla/registro-enlaces-locales';
import { alRecibirMensaje } from '../malla/transporte-universal';

/**
 * Anuncia una estación por los enlaces locales vivos.
 * @param e Estación a anunciar
 * @param deps Dependencias inyectables (para testing)
 * @returns Promesa con el número de envios exitosos y los IDs de los enlaces usados
 */
export async function anunciarPorEnlacesDirectos(
  e: Estacion,
  deps?: {
    enlaces?: () => Promise<any[]>;
    enviar?: (destino: any, canal: string, cuerpo: unknown) => Promise<{ ok: boolean; enlace?: { id?: string } }>;
    alRecibir?: (canal: string, cb: (m: any) => void) => () => void;
  }
): Promise<{ enviados: number; enlaces: string[] }> {
  // Obtener enlaces locales vivos (o usar los inyectados)
  const enlacesVivos = deps?.enlaces
    ? await deps.enlaces()
    : await enlacesLocalesVivos();

  const faro = faroDeEstacion(e);
  let enviados = 0;
  const enlacesExitosos: string[] = [];

   for (const enlace of enlacesVivos) {
     // Asumimos que cada enlace tiene una propiedad `id`
     const enlaceId = enlace.id;
     try {
       let resultado;
       if (deps?.enviar) {
         resultado = await deps.enviar({ enlaceId }, 'estacion', faro);
       } else {
         resultado = await enviarMensaje({ enlaceId }, 'estacion', faro);
       }

       if (resultado.ok && resultado.enlace?.id) {
         enviados++;
         enlacesExitosos.push(resultado.enlace.id);
       }
     } catch (error) {
       // Ignorar errores individuales, continuar con otros enlaces
       console.error(`Error al anunciar por enlace ${enlaceId}:`, error);
     }
   }

  return { enviados, enlaces: enlacesExitosos };
}

/**
 * Escucha estaciones recibidas por enlaces directos.
 * @param cb Callback que recibe un array de estaciones oídas
 * @param deps Dependencias inyectables (para testing)
 * @return Función para detener la escucha
 */
export function escucharEstacionesDirectas(
  cb: (oidas: EstacionOida[]) => void,
  deps?: {
    alRecibir?: (canal: string, cb: (m: any) => void) => () => void;
  }
): () => void {
  const manejador = (m: any) => {
    // Convertir el cuerpo del mensaje a formato esperado por estacionesDeFaros
    const items = [{ body: m.cuerpo }];
    const oidas = estacionesDeFaros(items);
    if (oidas.length > 0) {
      cb(oidas);
    }
    // No avisa si la lista está vacía (como se especifica)
  };

  // Usar alRecibir inyectado o el real
  const detener = deps?.alRecibir
    ? deps.alRecibir('estacion', manejador)
    : alRecibirMensaje('estacion', manejador);

  return detener;
}