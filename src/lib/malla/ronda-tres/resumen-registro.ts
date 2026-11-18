"use client";

export type ResumenRonda = {
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
};

export function resumirRonda(lineas: string[]): ResumenRonda {
  const resumen: ResumenRonda = {
    mensajes: { enviados: 0, entregados: 0, porMedio: {} },
    archivos: { completos: 0, verificados: 0, fallos: [], kbps: [] },
    relevo: { rutas: 0, entregados: 0, sinRuta: 0 },
    llamadas: { contestadas: 0, porWebrtc: 0, porDatos: 0, fallos: 0 },
    control: 0,
    sinEvidencia: [],
  };

  for (const linea of lineas) {
    if (!linea || linea.trim() === "") continue;

    if (linea.includes(" (Maggaboard)")) {
      continue;
    }

    const partes = linea.split(" · ");
    const segunda = partes[1]?.trim();

    if (linea.includes(" ble llamada")) {
      if (segunda?.includes("contestada")) {
        resumen.llamadas.contestadas++;
      } else if (segunda?.includes("medio=webrtc")) {
        resumen.llamadas.porWebrtc++;
      } else if (segunda?.includes("enlace-datos")) {
        resumen.llamadas.porDatos++;
      } else if (segunda?.includes("fallo")) {
        resumen.llamadas.fallos++;
      }
    } else if (linea.includes(" enviado via=")) {
      resumen.mensajes.enviados++;
      const match = linea.match(/via=(\w+)/);
      if (match) {
        const medio = match[1];
        if (!resumen.mensajes.porMedio[medio]) {
          resumen.mensajes.porMedio[medio] = 0;
        }
        resumen.mensajes.porMedio[medio]!++;
      }
    } else if (linea.includes(" entregado via=")) {
      resumen.mensajes.entregados++;
      const match = linea.match(/via=(\w+)/);
      if (match) {
        const medio = match[1];
        if (!resumen.mensajes.porMedio[medio]) {
          resumen.mensajes.porMedio[medio] = 0;
        }
        resumen.mensajes.porMedio[medio]!++;
      }
    } else if (linea.includes("control-")) {
      resumen.control++;
    } else if (linea.includes(" completo kbps=")) {
      resumen.archivos.completos++;
      const match = linea.match(/kbps=(\d+)/);
      if (match) {
        resumen.archivos.kbps.push(parseInt(match[1], 10));
      }
    } else if (linea.includes(" verificado")) {
      resumen.archivos.verificados++;
    } else if (linea.includes(" fallo motivo=")) {
      resumen.archivos.fallos.push("timeout");
    } else if (linea.includes(" web relevo - - ")) {
      if (segunda?.includes("entrega ruta")) {
        resumen.relevo.rutas++;
      } else if (segunda?.includes("sin-ruta")) {
        resumen.relevo.sinRuta++;
      } else if (segunda?.includes("entrega confirmada")) {
        resumen.relevo.entregados++;
      }
    }
  }

  const secciones = [
    "enviados",
    "entregados",
    "completos",
    "verificados",
    "rutas",
    "entregados",
    "sinRuta",
    "contestadas",
    "porWebrtc",
    "porDatos",
    "fallos",
    "control",
  ];

  for (const seccion of secciones) {
    const valores = obtenerValorSeccion(resumen, seccion);
    if (!valores || valores === 0) {
      resumen.sinEvidencia.push(seccion);
    }
  }

  return resumen;
}

function obtenerValorSeccion(resumen: ResumenRonda, seccion: string): unknown {
  switch (seccion) {
    case "enviados": return resumen.mensajes.enviados;
    case "entregados": return resumen.mensajes.entregados;
    case "completos": return resumen.archivos.completos;
    case "verificados": return resumen.archivos.verificados;
    case "rutas": return resumen.relevo.rutas;
    case "entregados_relevo": return resumen.relevo.entregados;
    case "sinRuta": return resumen.relevo.sinRuta;
    case "contestadas": return resumen.llamadas.contestadas;
    case "porWebrtc": return resumen.llamadas.porWebrtc;
    case "porDatos": return resumen.llamadas.porDatos;
    case "fallos": return resumen.archivos.fallos.length;
    case "control": return resumen.control;
    default: return undefined;
  }
}
