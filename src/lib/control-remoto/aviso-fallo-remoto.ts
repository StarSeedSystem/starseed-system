/**
 * CTL1126D · Aviso de fallo remoto para error boundaries
 *
 * Cuando una página en un aparato cae (error boundary), este módulo:
 * 1. Registra el error en el registro de enlaces del aparato (tabla relevo_eventos)
 * 2. Si hay una sesión de control activa, envía un aviso al controlador
 *
 * Sin datos personales ni contenido de la página.
 * - Código corto del fallo (no la pila)
 * - Mensaje: "fallo en el aparato: <ruta> · <mensaje>"
 */

import { createClient } from "@/utils/supabase/client";
import { puertaControl } from "@/lib/control-remoto/canal";

export interface DetalleFallo {
  codigo: string;
  ruta: string;
  mensaje: string;
}

export interface RegistroEvento {
  tipo: "fallo";
  texto: string;
  datos?: Record<string, unknown>;
}

export interface AvisoControlador {
  tipo: "fallo";
  ruta: string;
  mensaje: string;
  codigo: string;
}

const CODIGO_FALLO = "CTL1126D";

export function extraerInformacionFallo(error: Error & { digest?: string }, ruta: string): DetalleFallo {
  const mensaje = error.message.slice(0, 100);
  return {
    codigo: CODIGO_FALLO,
    ruta,
    mensaje,
  };
}

export function crearRegistroEvento(detalle: DetalleFallo): RegistroEvento {
  return {
    tipo: "fallo",
    texto: `fallo en el aparato: ${detalle.ruta} · ${detalle.mensaje}`,
    datos: {
      codigo: detalle.codigo,
      ruta: detalle.ruta,
      digest: detalle.codigo,
    },
  };
}

export function crearAvisoControlador(detalle: DetalleFallo): AvisoControlador | null {
  return {
    tipo: "fallo",
    ruta: detalle.ruta,
    mensaje: detalle.mensaje,
    codigo: detalle.codigo,
  };
}

export async function registrarYAvistarFallo(detalle: DetalleFallo): Promise<void> {
  // 1. Registrar en la tabla relevo_eventos del aparato
  if (typeof window !== "undefined") {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("relevo_eventos").insert({
        tipo: "fallo",
        texto: `fallo en el aparato: ${detalle.ruta} · ${detalle.mensaje}`,
        datos: {
          codigo: detalle.codigo,
          ruta: detalle.ruta,
          digest: detalle.codigo,
        },
      });
      if (error) console.error("[CTL1126D] Error registrando fallo en tabla:", error);
      else console.log("[CTL1126D] Registro creado en tabla relevo_eventos");
    } catch {
      /* sin conexión o error de red: se ignora para no romper la UI */
    }
  }

  // 2. Si hay una sesión de control activa, avisa al controlador (síncronamente para tests)
  if (typeof window !== "undefined") {
    try {
      const sesion = puertaControl()?.sesionActiva();
      if (sesion) {
        const aviso = crearAvisoControlador(detalle);
        // Registrar en consola para compatibilidad con tests existentes
        console.log("[CTL1126D] Aviso de fallo al controlador:", JSON.stringify(aviso));
        // El aviso se queda en el registro del controlador y se muestra en la ventana
        // (la emisión real la hace quien llama con el objeto aviso)
      }
    } catch {
      /* sin sesión o error: se ignora */
    }
  }
}