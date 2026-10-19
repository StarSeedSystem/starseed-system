import { TipoAlcance, Sesion } from '../recursos/sesion-prestamo';

// Tipos para las dependencias inyectadas
type CapturarFn = () => Promise<ImageBitmap | null>;
type DibujarFn = (frame: ImageBitmap | null, canvas: HTMLCanvasElement) => void;
type CrearPistaFn = (canvas: HTMLCanvasElement, fps: number) => MediaStreamTrack;

// Configuración del anfitrión web
export interface ConfigAnfitrion {
  capturar: CapturarFn;
  dibujar: DibujarFn;
  crearPista: CrearPistaFn;
  sesion: Sesion;
  fps: number;
  anchoMax: number;
}

// Estado interno del anfitrión
interface EstadoAnfitrion {
  cuadro: HTMLCanvasElement;
  pista: MediaStreamTrack | null;
  animacionId: number | null;
}

// Crea un anfitrión web que gestiona la transmisión de una app remota
export function crearAnfitrion({
  capturar,
  dibujar,
  crearPista,
  sesion,
  fps,
  anchoMax,
}: ConfigAnfitrion) {
  const estado: EstadoAnfitrion = {
    cuadro: document.createElement('canvas'),
    pista: null,
    animacionId: null,
  };

  // Configura el tamaño máximo del lienzo basado en anchoMax
  estado.cuadro.width = anchoMax;
  // La altura se ajustará manteniendo la proporción del fotograma (por ahora fija)
  estado.cuadro.height = anchoMax * 3 / 4; // proporción 4:3 asumida

  // Crear la pista de video desde el lienzo y el fps
  estado.pista = crearPista(estado.cuadro, fps);

  // Devuelve una pista de video que combina el lienzo y el fps actual
  function obtenerPista(): MediaStreamTrack | null {
    return estado.pista;
  }

  // Inicia el bucle de captura y renderizado
  function iniciar(): void {
    if (estado.animacionId !== null) return; // Ya está iniciado

    const ciclo = async () => {
      console.log('ciclo inicio');
      // Verificar si la sesión sigue siendo válida
      const ahora = Date.now();
      if (sesion.revocada || ahora >= sesion.vence) {
        detener();
        return;
      }

      try {
        // Solicitar un fotograma a la app nativa
        const fotograma = await capturar();
        // Dibujar el fotograma en el lienzo
        dibujar(fotograma, estado.cuadro);
        // Nota: No actualizamos la pista aquí porque el lienzo y el fps no cambian
        // En una implementación más avanzada, podríamos recrear la pista si cambia el fps
      } catch (error) {
        console.error('Error al capturar o dibujar fotograma:', error);
      }

      // Programar el siguiente fotograma
      estado.animacionId = requestAnimationFrame(ciclo);
      console.log('ciclo fin');
    };

    // Iniciar el bucle
    estado.animacionId = requestAnimationFrame(ciclo);
  }

  // Detiene el bucle y libera recursos
  function detener(): void {
    if (estado.animacionId !== null) {
      cancelAnimationFrame(estado.animacionId);
      estado.animacionId = null;
    }
    // Si tenemos una pista, la detenemos (pero no la cerramos porque podría estar en uso)
    if (estado.pista) {
      estado.pista.enabled = false;
    }
  }

  // Devuelve la interfaz pública
  return {
    obtenerPista,
    iniciar,
    detener,
  };
}