/**
 * CTL1126D · Aviso de fallo remoto para error boundaries
 *
 * Cuando una página en un aparato cae (error boundary), este módulo:
 * 1. Registra el error en el registro de enlaces del aparato (tabla relevo_eventos)
 * 2. Si hay una sesión de control activa, envía un aviso al controlador
 *
 * Sin datos personales ni contenido de página.
 * - Código corto del fallo (no la pila)
 * - Mensaje: "fallo en el aparato: <ruta> · <mensaje>"
 */

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