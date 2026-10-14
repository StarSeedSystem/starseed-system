import * as React from 'react';
import { HardwareServidor, UmbralesProcesos, porcentaje, avisosHardware } from '../../lib/cerebros/procesos';

export function ProcesosHardware({ hardware, umbrales, ocultos }: { hardware: HardwareServidor[]; umbrales: UmbralesProcesos; ocultos?: string[] }) {
  // Filter out ocultos
  const visibles = hardware.filter(h => !ocultos?.includes(h.id));

  // Calculate avisos
  const avisos = avisosHardware(visibles, umbrales);

  return (
    <div className="space-y-6">
      {visibles.map(h => {
        // Determine which avisos apply to this server
        const avisosServidor = avisos.filter(a => a.servidor === h.nombre);
        const esAviso = (medida: string) => avisosServidor.some(a => a.medida === medida);

        return (
          <div key={h.id} className="border rounded-xl p-4 bg-background">
            {/* Header */}
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-lg">{h.nombre}</h3>
                <p className="text-sm text-muted-foreground">{tipoToString(h.tipo)}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>Medido: {new Date(h.medidoEn!).toLocaleString()}</p>
                <p>Fuente: {h.fuente}</p>
              </div>
            </div>

            {/* Rows */}
            <div className="space-y-3">
              {[
                { label: 'CPU', valor: h.cpuPct },
                { label: 'RAM', valor: porcentaje(h.ramUsadaMb, h.ramTotalMb) },
                { label: 'GPU', valor: h.gpuPct },
                { label: 'Disco', valor: null }, // We'll compute used percentage below
                { label: 'Batería', valor: h.bateriaPct },
              ].map(({ label, valor }, index) => {
                const isAviso = esAviso(label.toLowerCase());
                // Compute display valor
                let displayValor: number | null = valor;
                if (label === 'Disco') {
                  if (h.discoLibreGb !== null && h.discoTotalGb !== null && h.discoTotalGb > 0) {
                    const usadoGb = h.discoTotalGb - h.discoLibreGb;
                    displayValor = porcentaje(usadoGb, h.discoTotalGb);
                  } else {
                    displayValor = null;
                  }
                }
                // For other labels, valor is already the percentage we want to display (except GPU which is raw percentage)
                // CPU: h.cpuPct is percentage
                // RAM: porcentaje(...) is percentage
                // GPU: h.gpuPct is percentage
                // Batería: h.bateriaPct is percentage

                // Determine if we should show threshold (only for CPU, RAM, Disco, Batería)
                const thresholdKey = label.toLowerCase() as keyof UmbralesProcesos;
                const hasThreshold = thresholdKey in umbrales;

                return (
                  <div key={index} className="flex items-center space-x-3">
                    <span className="w-20 font-mono">{label}:</span>
                    {/* Value and bar */}
                    <div className="flex-1 flex items-center space-x-2">
                      {/* Bar container */}
                      <div className={`flex-1 h-2 bg-muted rounded ${isAviso && hasThreshold ? 'border-2 border-amber-500' : ''}`}>
                        {/* Bar fill */}
                        <div className={`h-full rounded bg-${isAviso && hasThreshold ? 'amber-500' : 'primary'} transition-all w-[${displayValor !== null ? `${displayValor}%` : '0%'}]`}></div>
                      </div>
                      {/* Value text */}
                      <span className="w-20 text-right font-mono">
                        {displayValor !== null ? `${displayValor}%` : 'sin medida en este aparato'}
                      </span>
                      {/* Show threshold if aviso and has threshold */}
                      {isAviso && hasThreshold && (
                        <span className="text-xs text-amber-500 ml-1">
                          {`(>${umbrales[thresholdKey]}%)`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function tipoToString(tipo: 'mac' | 'a1' | 'neurona' | 'nube' | 'otro'): string {
  switch (tipo) {
    case 'mac': return 'Mac';
    case 'a1': return 'A1';
    case 'neurona': return 'Neurona';
    case 'nube': return 'Nube';
    case 'otro': return 'Otro';
    default: return 'Desconocido';
  }
}

export default ProcesosHardware;