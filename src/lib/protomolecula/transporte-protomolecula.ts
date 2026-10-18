import type { Operacion, Cambio, ElementoSala, Sesion } from "./sesion-sincronia";
import type { Molecula } from "./tipos";
import type { TransporteSala } from "@/lib/salas/sala";
import type { ResultadoEnvio } from "@/lib/malla/transporte-universal";
import { RelojComun } from "@/lib/estaciones/reloj-comun";
import { enviarMensaje, alRecibirMensaje, SobreMensaje } from "@/lib/malla/transporte-universal";
import { elementoDeOperacion, moleculaDesdeElementos, formaCorta, desdeFormaCorta } from "./sesion-sincronia";

// Crea un enlace de sesión para la Protomolécula sobre el canal "protomolecula"
export function crearEnlaceSesion({
  sesion,
  enviar,
  recibir,
  reloj,
}: {
  sesion: Sesion;
  enviar: (cuerpo: unknown) => Promise<ResultadoEnvio>;
  recibir: (callback: (cuerpo: unknown) => void) => () => void;
  reloj: RelojComun;
}) {
  // Estado del enlace
  let estadoEnlace: "conectado" | "desconectado" = "conectado";
  const muestrasLatencia: number[] = [];
  const MAX_MUESTRAS_LATENCIA = 30;

  // ID único de este dispositivo en la sesión (simplificación)
  const dispositivoId = sesion.anfitrion; // o sesion.miId? Verificar en estaciones/tipos.ts

  async function enviarOperacion(op: Operacion, cambio: Cambio): Promise<void> {
    const opConT = { ...op, t: reloj.ahora() };
    await enviar({ tipo: "operacion", elemento: elementoDeOperacion(opConT, cambio) });
  }

  function enviarGesto(valor: number): void {
    enviar({ tipo: "gesto", elemento: {
      id: `gesto-${Date.now()}`,
      tipo: "gesto",
      datos: { valor },
      actualizadoEn: reloj.ahora(),
      porDispositivo: dispositivoId,
      borrado: false,
    } });
  }

  function enviarConfirmacion(op: Operacion): void {
    enviar({ tipo: "confirmacion", corto: formaCorta(op) });
  }

  // Recepción de mensajes
  const unsuscribir = recibir((mensaje) => {
    switch (mensaje.tipo) {
      case "operacion":
        // Procesar elemento de operación
        if (mensaje.elemento) {
          // Aquí se aplicaría el elemento a la molécula local mediante moleculaDesdeElementos
          // Pero necesitamos la molécula base y la lista de elementos
          // Este lógica debería estar en la capa de sincronización de la sesión
          // Por ahora, solo pasamos el elemento a un callback externo (no implementado)
        }
        break;
      case "gesto":
        // Procesar gesto efímero (no se guarda, solo se muestra temporalmente)
        break;
      case "confirmacion":
        // Procesar confirmación corta
        if (mensaje.corto) {
          const op = desdeFormaCorta(mensaje.corto);
          if (op) {
            // Similar a operación, se aplicaría a la molécula
          }
        }
        break;
      case "ping":
        // Responder con pong para medir latencia
        enviar({ tipo: "pong", id: mensaje.id, t1: mensaje.t0, t2: reloj.ahora(), t3: reloj.ahora() });
        break;
      case "pong":
        // Calcular latencia y almacenar muestra
        if (mensaje.id) {
          const latencia = mensaje.t3 - mensaje.t0;
          muestrasLatencia.push(latencia);
          if (muestrasLatencia.length > MAX_MUESTRAS_LATENCIA) {
            muestrasLatencia.shift();
          }
        }
        break;
      default:
        // Ignorar tipos desconocidos
        break;
    }
  });

  // Medición activa de latencia (ping/pong)
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  function iniciarMedicionLatencia() {
    if (pingInterval) return;
    pingInterval = setInterval(() => {
      const id = Math.random().toString(36).substring(2, 15);
      enviar({ tipo: "ping", id, t0: reloj.ahora() });
    }, 5000); // Ping cada 5 segundos
  }
  function detenerMedicionLatencia() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  // Estado del enlace para la interfaz
  function obtenerEstadoEnlace(): {
    estado: "conectado" | "desconectado";
    latencia: { p50: number | null; p95: number | null; muestras: number };
    precisionReloj: number | null;
  } {
    const latenciaP50 = muestrasLatencia.length >= 1
      ? calcularPercentil(muestrasLatencia, 50)
      : null;
    const latenciaP95 = muestrasLatencia.length >= 1
      ? calcularPercentil(muestrasLatencia, 95)
      : null;
    return {
      estado: estadoEnlace,
      latencia: {
        p50: latenciaP50,
        p95: latenciaP95,
        muestras: muestrasLatencia.length,
      },
      precisionReloj: reloj.estado().precisionMs,
    };
  }

  function calcularPercentil(arr: number[], percentil: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (percentil / 100) * (sorted.length - 1);
    const low = Math.floor(index);
    const high = Math.ceil(index);
    if (low === high) return sorted[low];
    const fraction = index - low;
    return sorted[low] + fraction * (sorted[high] - sorted[low]);
  }

  // Iniciar medicion de latencia por defecto
  iniciarMedicionLatencia();

  // Devolver la interfaz del enlace
  return {
    enviarOperacion,
    enviarGesto,
    enviarConfirmacion,
    obtenerEstadoEnlace,
    // Método para detener la medición y limpiar recursos
    detener: () => {
      detenerMedicionLatencia();
      unsuscribir();
    },
  };
}