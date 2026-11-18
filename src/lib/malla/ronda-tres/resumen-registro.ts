export interface ResumenRonda {
  mensajes: { enviados: number; entregados: number; porMedio: Record<string, number> };
  archivos: { completos: number; verificados: number; fallos: string[]; kbps: number[] };
  relevo: { rutas: number; entregados: number; sinRuta: number };
  llamadas: { contestadas: number; porWebrtc: number; porDatos: number; fallos: number };
  control: number;
  sinEvidencia: string[];
}

const SECCIONES = ["mensajes", "archivos", "relevo", "llamadas", "control"] as const;

function seccionConLineas(resumen: ResumenRonda, nombre: string): boolean {
  switch (nombre) {
    case "mensajes":
      return resumen.mensajes.enviados > 0 || resumen.mensajes.entregados > 0;
    case "archivos":
      return resumen.archivos.completos > 0 || resumen.archivos.verificados > 0 || resumen.archivos.fallos.length > 0;
    case "relevo":
      return resumen.relevo.rutas > 0 || resumen.relevo.entregados > 0 || resumen.relevo.sinRuta > 0;
    case "llamadas":
      return resumen.llamadas.contestadas > 0 || resumen.llamadas.porWebrtc > 0 || resumen.llamadas.porDatos > 0 || resumen.llamadas.fallos > 0;
    case "control":
      return resumen.control > 0;
    default:
      return false;
  }
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

  for (const linea of lineas) {
    const limpia = linea.trim();
    if (!limpia) continue;

    // Quitar prefijo tipo (Maggaboard)
    const sinPrefijo = limpia.replace(/^\([^)]+\)\s*/, "");

    // Detectar formato: web (·) o nativo (espacios)
    const partes = sinPrefijo.split(" · ");
    let tipo: string;
    let detalle: string;

    if (partes.length >= 4) {
      // Formato web: ISO · tipo · enlace=... · neurona=... · detalle (el último)
      tipo = partes[1];
      detalle = partes[partes.length - 1];
    } else {
      // Formato nativo: ISO ble tipo enlace=... neurona=... · detalle
      const idxDetalle = sinPrefijo.indexOf(" · ");
      if (idxDetalle < 0) continue;
      const antes = sinPrefijo.slice(0, idxDetalle).split(/\s+/);
      if (antes.length < 3 || antes[1] !== "ble") continue;
      tipo = antes[2];
      detalle = sinPrefijo.slice(idxDetalle + 3);
    }

    // Contar por tipo
    switch (tipo) {
      case "mensaje-malla": {
        if (detalle === "enviado") resumen.mensajes.enviados++;
        else if (detalle.startsWith("entregado via=")) {
          resumen.mensajes.entregados++;
          const medio = detalle.slice("entregado via=".length).trim();
          if (medio) resumen.mensajes.porMedio[medio] = (resumen.mensajes.porMedio[medio] ?? 0) + 1;
        }
        break;
      }
      case "archivo": {
        // detalle: "<id> <hito> ..."
        const partesArchivo = detalle.split(/\s+/);
        if (partesArchivo.length >= 2) {
          const hito = partesArchivo[1];
          if (hito === "completo") {
            resumen.archivos.completos++;
            // extraer kbps
            const m = detalle.match(/kbps=(\d+)/);
            if (m) resumen.archivos.kbps.push(Number(m[1]));
          } else if (hito === "verificado") {
            resumen.archivos.verificados++;
          } else if (hito === "fallo") {
            const m = detalle.match(/motivo=([^\s]+)/);
            resumen.archivos.fallos.push(m ? m[1] : "desconocido");
          }
        }
        break;
      }
      case "relevo": {
        if (detalle.startsWith("ruta ")) resumen.relevo.rutas++;
        else if (detalle.startsWith("entregado ")) resumen.relevo.entregados++;
        else if (detalle === "sin-ruta") resumen.relevo.sinRuta++;
        break;
      }
      case "llamada": {
        if (detalle.includes("contestada")) {
          resumen.llamadas.contestadas++;
          if (detalle.includes("medio=webrtc")) resumen.llamadas.porWebrtc++;
          else if (detalle.includes("medio=enlace-datos")) resumen.llamadas.porDatos++;
        } else if (detalle === "fallo") {
          resumen.llamadas.fallos++;
        }
        break;
      }
      default: {
        if (tipo.startsWith("control-")) resumen.control++;
      }
    }
  }

  resumen.sinEvidencia = SECCIONES.filter((s) => !seccionConLineas(resumen, s));
  return resumen;
}