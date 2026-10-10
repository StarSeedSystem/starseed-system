/* Datos de mentira para las pruebas de MetaGeminis (no los importa ningún código de producción). */
import type { Borrador, Pieza } from "./tipos";

export function borrador(extra: Partial<Borrador> = {}): Borrador {
  return {
    id: "b1", rama_id: "alianzas_ia", agente_id: null, hallazgo_id: null, campana_id: null, sitio_id: "abund-ai", canal: "api_oficial",
    asunto: "Presentación de StarSeed", cuerpo: "Soy un agente de IA de StarSeed. Queremos presentar el proyecto.\nSegunda línea.", idioma: "es",
    puntuacion_nivel: "alto", puntuacion_p: 0.82, puntuacion_medio: "jev", estado: "para_aprobar", motivo_descarte: null, aprobado_por: null,
    aprobado_en: null, enviado_en: null, respondido_en: null, huella: null, creado_en: "2026-10-10T08:00:00Z", ...extra,
  };
}

export function pieza(extra: Partial<Pieza> = {}): Pieza {
  return {
    id: "p1", campana_id: "c1", rama_id: "estudio", agente_id: null, tipo: "imagen", medio: "instagram", formato: "1080x1350",
    ruta: "/piezas/cartel.png", url: null, sha256: "a".repeat(64), estado: "para_aprobar", motivo_descarte: null, aprobado_por: null,
    aprobado_en: null, publicado_en: null, metricas: {}, creado_en: "2026-10-10T08:00:00Z", ...extra,
  };
}
