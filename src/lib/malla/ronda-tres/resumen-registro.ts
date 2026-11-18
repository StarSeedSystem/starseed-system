/**
 * resumen-registro — lector puro de enlaces.log que resume la ronda de pruebas de tres neuronas (T305)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin node:*) que parsea un registro de enlaces.log y genera
 * un resumen estructurado con contadores por tipo de evento.
 */

export interface ResumenRonda {
  mensajes: {
    enviados: number;
    entregados: number;
    porMedio: Record<string, number>;
  };
  archivos: {
    completos: number;
    verificados: number;
    fallos: string[];
    kbps: number[];
  };
  relevo: {
    rutas: number;
    entregados: number;
    sinRuta: number;
  };
  llamadas: {
    contestadas: number;
    porWebrtc: number;
    porDatos: number;
    fallos: number;
  };
  control: number;
  sinEvidencia: string[];
}

const RE_MENSAJE = /· mensaje-malla ·/;
const RE_ARCHIVO = /· archivo ·/;
const RE_LLAMADA = /· llamada ·/;
const RE_CONTROL = /(?:^|\s)control-\S+/;

function identificarTipo(linea: string): string | null {
  const limpia = linea.replace(/^\([^)]+\)\s*/, "");
  if (RE_CONTROL.test(limpia)) return "control";
  if (RE_MENSAJE.test(limpia)) return "mensaje-malla";
  if (RE_ARCHIVO.test(limpia)) return "archivo";
  if (RE_LLAMADA.test(limpia)) return "llamada";
  if (limpia.includes("relevo - -") || limpia.includes("· relevo ·")) return "relevo";
  return null;
}

function procesarMensaje(linea: string, resumen: ResumenRonda): void {
  if (linea.includes("entregado via=")) {
    const match = linea.match(/entregado via=(\S+)/);
    if (match) {
      resumen.mensajes.entregados += 1;
      const medio = match[1];
      resumen.mensajes.porMedio[medio] = (resumen.mensajes.porMedio[medio] || 0) + 1;
    }
  } else {
    resumen.mensajes.enviados += 1;
  }
}

function procesarArchivo(linea: string, resumen: ResumenRonda): void {
  if (linea.includes("fallo motivo=")) {
    const match = linea.match(/fallo motivo=([^·]+)/);
    if (match) {
      resumen.archivos.fallos.push(match[1].trim());
    }
  } else if (linea.includes("completo kbps=")) {
    resumen.archivos.completos += 1;
    const match = linea.match(/kbps=(\d+)/);
    if (match) resumen.archivos.kbps.push(parseInt(match[1], 10));
  } else if (linea.includes("verificado")) {
    resumen.archivos.verificados += 1;
  }
}

function procesarRelevo(linea: string, resumen: ResumenRonda): void {
  if (linea.includes("ruta destino=")) {
    resumen.relevo.rutas += 1;
  } else if (linea.includes("entregado") && linea.includes(" ms=")) {
    resumen.relevo.entregados += 1;
  } else if (linea.includes("sin-ruta")) {
    resumen.relevo.sinRuta += 1;
  }
}

function procesarLlamada(linea: string, resumen: ResumenRonda): void {
  if (linea.includes("contestada")) {
    resumen.llamadas.contestadas += 1;
  }
  if (linea.includes("medio=webrtc")) {
    resumen.llamadas.porWebrtc += 1;
  }
  if (linea.includes("enlace-datos")) {
    resumen.llamadas.porDatos += 1;
  }
  if (linea.includes("fallo")) {
    resumen.llamadas.fallos += 1;
  }
}

function procesarControl(_linea: string, resumen: ResumenRonda): void {
  resumen.control += 1;
}

function contarTipos(lineas: string[]): Set<string> {
  const tipos = new Set<string>();
  for (const linea of lineas) {
    if (linea.trim()) {
      const tipo = identificarTipo(linea);
      if (tipo) tipos.add(tipo);
    }
  }
  return tipos;
}

export function resumirRonda(lineas: string[]): ResumenRonda {
  const resumen: ResumenRonda = {
    mensajes: { enviados: 0, entregados: 0, porMedio: {} },
    archivos: { completos: 0, verificados: 0, fallos: [], kbps: [] },
    relevo: { rutas: 0, entregados: 0, sinRuta: 0 },
    llamadas: { contestadas: 0, porWebrtc: 0, porDatos: 0, fallos: 0 },
    control: 0,
    sinEvidencia: [],
  };

  const tiposEncontrados = contarTipos(lineas);

  if (!tiposEncontrados.has("mensaje-malla")) resumen.sinEvidencia.push("mensaje");
  if (!tiposEncontrados.has("archivo")) resumen.sinEvidencia.push("archivo");
  if (!tiposEncontrados.has("relevo")) resumen.sinEvidencia.push("puerta");
  if (!tiposEncontrados.has("llamada")) resumen.sinEvidencia.push("llamada");

  for (const linea of lineas) {
    const tipo = identificarTipo(linea);
    if (!tipo) continue;

    if (tipo === "mensaje-malla") procesarMensaje(linea, resumen);
    else if (tipo === "archivo") procesarArchivo(linea, resumen);
    else if (tipo === "relevo") procesarRelevo(linea, resumen);
    else if (tipo === "llamada") procesarLlamada(linea, resumen);
    else if (tipo === "control") procesarControl(linea, resumen);
  }

  return resumen;
}