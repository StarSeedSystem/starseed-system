"use client";

/**
 * Protomolécula · CONSENTIMIENTOS DE SALUD. Gestiona el permiso por métrica
 * de wearable para compartir datos en sesiones. Sin afirmaciones médicas.
 */
import React from "react";
import { useEffect, useState } from "react";
import { METRICAS_SALUD, type MetricaSalud, type Consentimiento, Ambito, AMBITOS, decidirSalud } from "@/lib/protomolecula/tipos";
import { AVISO_SALUD } from "@/lib/protomolecula/permisos";
import { toast } from "sonner";

export interface ConsentimientosSaludProps {
  /** Métricas actualmente consentidas */
  consentimientos: Consentimiento[];
  /** Ámbito de la sesión actual */
  ambitoSesion: Ambito;
  /** ID del usuario actual */
  usuarioId: string;
  /** Timestamp actual */
  ahora: number;
  /** Callback cuando se cambia el consentimiento */
  onCambiarConsentimiento: (nuevos: Consentimiento[]) => void;
}

/** Nombre legible de cada métrica de salud */
const NOMBRES_METRICAS: Record<MetricaSalud, string> = {
  pulso: "Pulso",
  "variabilidad-cardiaca": "Variabilidad cardíaca",
  oxigeno: "Oxígeno en sangre",
  temperatura: "Temperatura corporal",
  respiracion: "Frecuencia respiratoria",
  sueno: "Calidad del sueño",
  estres: "Nivel de estrés",
  ecg: "Electrocardiograma",
  pasos: "Pasos dados",
};

/** Unidad de cada métrica (para mostrar) */
const UNIDADES_METRICAS: Record<MetricaSalud, string> = {
  pulso: "bpm",
  "variabilidad-cardiaca": "ms",
  oxigeno: "%",
  temperatura: "°C",
  respiracion: "rpm",
  sueno: "score",
  estres: "índice",
  ecg: "mV",
  pasos: "pasos",
};

/** Descripción de cada métrica (sin afirmaciones médicas) */
const DESCRIPCIONES_METRICAS: Record<MetricaSalud, string> = {
  pulso: "Latidos por minuto medidos por el dispositivo",
  "variabilidad-cardiaca": "Variación en el tiempo entre latidos consecutivos",
  oxigeno: "Saturación de oxígeno en la sangre arterial",
  temperatura: "Temperatura corporal medida en la piel",
  respiracion: "Numero de respiraciones por minuto",
  sueno: "Evaluación de patrones y calidad del sueño",
  estres: "Indicador de respuesta fisiológica a demandas",
  ecg: "Actividad eléctrica del corazón capturada en un derivación",
  pasos: "Conteo de pasos detectados por movimiento",
};

export function ConsentimientosSalud({
  consentimientos,
  ambitoSesion,
  usuarioId,
  ahora,
  onCambiarConsentimiento,
}: ConsentimientosSaludProps) {
  const [metricasSeleccionadas, setMetricasSeleccionadas] = useState<Set<MetricaSalud>>(
    new Set(consentimientos.map(c => c.metrica))
  );
  const [duraciones, setDuraciones] = useState<Record<MetricaSalud, number>>({});
  const [expresos, setExpresos] = useState<Record<MetricaSalud, boolean>>({});

  // Inicializar duraciones y expresos para métricas ya consentidas
  useEffect(() => {
    const nuevasDuraciones: Record<MetricaSalud, number> = {};
    const nuevosExpresos: Record<MetricaSalud, boolean> = {};
    
    consentimientos.forEach(c => {
      if (c.caducaEn) {
        nuevasDuraciones[c.metrica] = c.caducaEn - ahora;
      }
      nuevosExpresos[c.metrica] = c.expreso ?? false;
    });
    
    setDuraciones(nuevasDuraciones);
    setExpresos(nuevosExpresos);
  }, [consentimientos, ahora]);

  const toggleConsentimiento = (metrica: MetricaSalud) => {
    setMetricasSeleccionadas(prev => {
      const nuevoSet = new Set(prev);
      if (nuevoSet.has(metrica)) {
        nuevoSet.delete(metrica);
      } else {
        nuevoSet.add(metrica);
      }
      return nuevoSet;
    });
  };

  const actualizarDuracion = (metrica: MetricaSalud, minutos: number) => {
    setDuraciones(prev => ({
      ...prev,
      [metrica]: minutos * 60 * 1000, // convertir a milisegundos
    }));
  };

  const actualizarExpreso = (metrica: MetricaSalud, value: boolean) => {
    setExpresos(prev => ({
      ...prev,
      [metrica]: value,
    }));
  };

  const aplicarCambios = () => {
    const nuevosConsentimientos: Consentimiento[] = [];
    
    metricasSeleccionadas.forEach(metrica => {
      const duracionMs = duraciones[metrica];
      const expreso = expresos[metrica];
      
      // Para ámbito público, el consentimiento expreso es requerido
      const esExpresoRequerido = ambitoSesion === "publica" ? expreso : undefined;
      
      const consentimiento: Consentimiento = {
        metrica,
        ambitoMax: ambitoSesion,
        expreso: esExpresoRequerido,
        concedidoPor: usuarioId,
        concedidoEn: ahora,
        caducaEn: duracionMs > 0 ? ahora + duracionMs : undefined,
      };
      
      nuevosConsentimientos.push(consentimiento);
    });
    
    onCambiarConsentimiento(nuevosConsentimientos);
    toast.success("Consentimientos actualizados");
  };

  // Verificar qué métricas pueden difundirse actualmente según los consentimientos
  const puedeDifundir = (metrica: MetricaSalud): boolean => {
    // Buscar si hay un consentimiento válido para esta métrica y usuario
    const consentimientoValido = consentimientos.find(
      c => c.metrica === metrica && c.concedidoPor === usuarioId
    );
    
    if (!consentimientoValido) return false;
    
    // Usar la función de permisos para decidir si puede difundirse
    const decision = decidirSalud(
      metrica,
      ambitoSesion,
      consentimientos,
      usuarioId,
      ahora
    );
    
    return decision.difundir;
  };

   return (
     <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.5 8.25h9M7.5 13.5h9" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-foreground">AVISO DE SALUD</h3>
              <p className="text-sm text-muted-foreground">
                {AVISO_SALUD}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {METRICAS_SALUD.map(metrica => (
            <div key={metrica} className="border rounded-lg p-4">
              <div className="flex items-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-foreground">{NOMBRES_METRICAS[metrica]}</h4>
                    <span className="text-xs text-muted-foreground">({UNIDADES_METRICAS[metrica]})</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {DESCRIPCIONES_METRICAS[metrica]}
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={metricasSeleccionadas.has(metrica)}
                        onChange={(e) => toggleConsentimiento(metrica)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2"
                      />
                      {metricasSeleccionadas.has(metrica) ? "Conceder consentimiento" : "Solicitar consentimiento"}
                    </label>
                  </div>
                  
                  {metricasSeleccionadas.has(metrica) && (
                    <>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="text-sm font-medium">Duración:</label>
                        <select
                          value={duraciones[metrica] ? Math.round(duraciones[metrica] / (60 * 1000)) : 0}
                          onChange={(e) => actualizarDuracion(metrica, Number(e.target.value))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value={0}>Indefinida</option>
                          <option value={15}>15 minutos</option>
                          <option value={30}>30 minutos</option>
                          <option value={60}>1 hora</option>
                          <option value={240}>4 horas</option>
                          <option value={1440}>24 horas</option>
                        </select>
                      </div>
                      
                      {ambitoSesion === "publica" && (
                        <div className="flex items-center gap-2 mt-2">
                          <label className="cursor-pointer flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={expresos[metrica] ?? false}
                              onChange={(e) => actualizarExpreso(metrica, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2"
                            />
                            Consentimiento explícito requerido para sesión pública
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-muted-foreground/20 flex items-center gap-3 text-xs">
                <div className="flex-1">
                  <span className="font-medium">
                    {puedeDifundir(metrica) ? "Puede difundirse" : "Solo local"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    // Simular verificación detallada
                    const decision = decidirSalud(
                      metrica,
                      ambitoSesion,
                      consentimientos,
                      usuarioId,
                      ahora
                    );
                    toast.info(decision.motivo, {
                      description: decision.difundir 
                        ? "Esta métrica puede compartirse en la sesión actual" 
                        : "Esta métrica permanecerá solo en su dispositivo"
                    });
                  }}
                  className="cursor-pointer inline-flex items-center gap-1.5 text-xs rounded-border hover:bg-muted"
                >
                  Ver detalle
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5h6M9 11h6M9 17h6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={aplicarCambios}
            className="btn-primary px-6 py-2"
          >
            Aplicar cambios
          </button>
        </div>
      </div>
  );
}

export default ConsentimientosSalud;