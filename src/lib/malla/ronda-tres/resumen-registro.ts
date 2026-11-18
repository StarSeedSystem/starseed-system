export interface ResumenRonda {
  mensajes: { enviados: number; entregados: number; porMedio: Record<string, number> };
  archivos: { completos: number; verificados: number; fallos: string[]; kbps: number[] };
  relevo: { rutas: number; entregados: number; sinRuta: number };
  llamadas: { contestadas: number; porWebrtc: number; porDatos: number; fallos: number };
  control: number;
  sinEvidencia: string[];
}

const SECCIONES = ["mensajes", "archivos", "relevo", "llamadas", "control"] as const;

function seccionTieneLineas(tipo: string, lineas: string[]): boolean {
  for (const l of lineas) {
    const t = extraerTipo(l);
    if (t === tipo) return true;
    if (tipo === "control" && t?.startsWith("control-")) return true;
    if (tipo === "mensajes" && t === "mensaje-malla") return true;
    if (tipo === "archivos" && t === "archivo") return true;
    if (tipo === "relevo" && l.includes(" web relevo ")) return true;
    if (tipo === "llamadas" && t === "llamada") return true;
  }
  return false;
}

function extraerTipo(linea: string): string | null {
  const limpia = linea.trim();
  if (!limpia) return null;
  const partes = limpia.split(" ");
  if (partes.length < 3) return null;
  if (partes[1] === "ble") return partes[2];
  if (partes[1] === "web" && partes[2] === "relevo") return "relevo";
  if (partes[1].includes("·")) {
    const i = limpia.indexOf(" · ");
    if (i > 0) {
      const despues = limpia.slice(i + 3);
      const tp = despues.split(" · ")[0];
      return tp;
    }
  }
  return null;
}

function extraerDetalle(linea: string): string {
  const i = linea.lastIndexOf(" · ");
  if (i >= 0) return linea.slice(i + 3);
  const parts = linea.split(" ");
  if (parts.length > 4) return parts.slice(4).join(" ");
  return "";
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
    const l = linea.trim();
    if (!l) continue;

    const tipo = extraerTipo(l);
    if (!tipo) continue;

    const detalle = extraerDetalle(l);

    if (tipo === "mensaje-malla") {
      if (detalle === "enviado") resumen.mensajes.enviados++;
      else if (detalle.startsWith("entregado via=")) {
        resumen.mensajes.entregados++;
        const medio = detalle.split("via=")[1]?.split(" ")[0];
        if (medio) resumen.mensajes.porMedio[medio] = (resumen.mensajes.porMedio[medio] || 0) + 1;
      }
    } else if (tipo === "archivo") {
      if (detalle.includes("completo kbps=")) {
        resumen.archivos.completos++;
        const m = detalle.match(/kbps=(\d+)/);
        if (m) resumen.archivos.kbps.push(Number(m[1]));
      } else if (detalle === "verificado") {
        resumen.archivos.verificados++;
      } else if (detalle.startsWith("fallo motivo=")) {
        const motivo = detalle.split("motivo=")[1]?.split(" ")[0];
        if (motivo) resumen.archivos.fallos.push(motivo);
      }
    } else if (tipo === "relevo" || l.includes(" web relevo ")) {
      if (detalle.startsWith("ruta ")) resumen.relevo.rutas++;
      else if (detalle.startsWith("entregado ")) resumen.relevo.entregados++;
      else if (detalle.startsWith("sin-ruta")) resumen.relevo.sinRuta++;
    } else if (tipo === "llamada") {
      if (detalle === "contestada medio=webrtc") {
        resumen.llamadas.contestadas++;
        resumen.llamadas.porWebrtc++;
      } else if (detalle === "contestada medio=enlace-datos") {
        resumen.llamadas.contestadas++;
        resumen.llamadas.porDatos++;
      } else if (detalle.startsWith("fallo")) {
        resumen.llamadas.fallos++;
      }
    } else if (tipo.startsWith("control-")) {
      resumen.control++;
    }
  }

  for (const s of SECCIONES) {
    if (!seccionTieneLineas(s, lineas)) resumen.sinEvidencia.push(s);
  }

  return resumen;
}