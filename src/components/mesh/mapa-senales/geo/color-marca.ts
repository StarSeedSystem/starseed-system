import { ANTENNA_COLOR } from "@/ai/astraura/mesh/signals";
import { COLOR_CONCIENCIA, COLOR_DESCONOCIDO, colorCalidad, ORDEN_CONCIENCIA, type CapaId } from "@/lib/senales/geo/capas";
import type { MarcaGeo } from "@/lib/senales/geo/marcas";

/** Color del anillo de una marca según la capa activa. Sin dato = gris. */
export function colorMarca(capa: CapaId, m: MarcaGeo): string {
  switch (capa) {
    case "senal":
      return colorCalidad(m.calidad.valor);
    case "conciencia": {
      const l = m.capas.lista;
      if (!l) return COLOR_DESCONOCIDO;
      const primera = ORDEN_CONCIENCIA.find((c) => l.includes(c));
      return primera ? COLOR_CONCIENCIA[primera] : COLOR_DESCONOCIDO;
    }
    case "antenas": {
      const medida = m.antenas.find((a) => a.medida && a.kind !== "serial" && !/sin conexión|sin radio|sin adaptador|^0 /.test(a.valor));
      return medida ? ANTENNA_COLOR[medida.kind] : COLOR_DESCONOCIDO;
    }
    default:
      return COLOR_DESCONOCIDO;
  }
}
