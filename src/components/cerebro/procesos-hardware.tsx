import { HardwareServidor, UmbralesProcesos, porcentaje, avisosHardware } from '@/lib/cerebros/procesos';

export function ProcesosHardware({ hardware, umbrales, ocultos }: { 
  hardware: HardwareServidor[]; 
  umbrales: UmbralesProcesos; 
  ocultos?: string[] 
}) {
  const visibleHardware = hardware.filter(h => !ocultos?.includes(h.id));
  const avisos = avisosHardware(visibleHardware, umbrales);
  const avisosPorServidor: Record<string, string[]> = {};
  avisos.forEach(aviso => {
    if (!avisosPorServidor[aviso.servidor]) avisosPorServidor[aviso.servidor] = [];
    avisosPorServidor[aviso.servidor].push(aviso.medida);
  });
  const formatoHora = (t: number | null) => t == null ? 'sin medida' : new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const tipoServidorToString = (t: HardwareServidor['tipo']) => {
    switch (t) {
      case 'mac': return 'Mac';
      case 'a1': return 'A1';
      case 'neurona': return 'Neurona';
      case 'nube': return 'Nube';
      case 'otro': return 'Otro';
      default: return 'Desconocido';
    }
  };
  return (
    <div className="space-y-4">
      {visibleHardware.map(servidor => (
        <div key={servidor.id} className="border rounded-lg p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-medium">{servidor.nombre}</h3>
            <span className="text-sm text-muted-foreground">{tipoServidorToString(servidor.tipo)}</span>
          </div>
          <div className="text-sm space-y-1">
            <div className="flex items-center"><span className="w-20">Hora:</span><span>{formatoHora(servidor.medidoEn)}</span></div>
            <div className="flex items-center"><span className="w-20">Fuente:</span><span>{servidor.fuente}</span></div>
          </div>
          <div className="mt-3 space-y-2">
            {/* CPU */}
            <div className="flex items-center">
              <span className="w-20">CPU:</span>
              <div className="flex-1 space-x-2">
                <span className="flex-1">
                  {servidor.cpuPct !== null ? (
                    <>
                      {servidor.cpuPct}% ({servidor.nucleos ?? 'N/A'} nuclei, carga: {servidor.carga ?? 'N/A'})
                    </>
                  ) : (
                    'sin medida en este aparato'
                  )}
                </span>
                {servidor.cpuPct !== null && (
                  <div className="w-20 bg-muted rounded-h">
                    <div 
                      className={`h-2 rounded ${avisosPorServidor[servidor.nombre]?.includes('cpu') ? 'bg-amber-500' : 'bg-primary'}`} 
                      style={{ width: `${porcentaje(servidor.cpuPct, 100) ?? 0}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
            {/* RAM */}
            <div className="flex items-center">
              <span className="w-20">RAM:</span>
              <div className="flex-1 space-x-2">
                <span className="flex-1">
                  {servidor.ramUsadaMb !== null && servidor.ramTotalMb !== null ? (
                    <>
                      {(servidor.ramUsadaMb / 1024).toFixed(1)} GB / 
                      {(servidor.ramTotalMb / 1024).toFixed(1)} GB ({porcentaje(servidor.ramUsadaMb, servidor.ramTotalMb) ?? null}%)
                    </>
                  ) : (
                    'sin medida en este aparato'
                  )}
                </span>
                {servidor.ramUsadaMb !== null && servidor.ramTotalMb !== null && servidor.ramTotalMb > 0 && (
                  <div className="w-20 bg-muted rounded-h">
                    <div 
                      className={`h-2 rounded ${avisosPorServidor[servidor.nombre]?.includes('ram') ? 'bg-amber-500' : 'bg-primary'}`} 
                      style={{ width: `${porcentaje(servidor.ramUsadaMb, servidor.ramTotalMb) ?? 0}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
                        {/* GPU */}
            <div className="flex items-center">
              <span className="w-20">GPU:</span>
              <div className="flex-1 space-x-2">
                <span className="flex-1">
                  {servidor.gpuPct !== null ? (
                    <>
                      {servidor.gpuPct}% ({servidor.gpuNombre ?? 'Sin nombre'})
                    </>
                  ) : (
                    'sin medida en este aparato'
                  )}
                </span>
                {servidor.gpuPct !== null && (
                  <div className="w-20 bg-muted rounded-h">
                    <div 
                      className={`h-2 rounded ${avisosPorServidor[servidor.nombre]?.includes('gpu') ? 'bg-amber-500' : 'bg-primary'}`} 
                      style={{ width: `${porcentaje(servidor.gpuPct, 100) ?? 0}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
            {/* Disco */}
            <div className="flex items-center">
              <span className="w-20">Disco:</span>
              <div className="flex-1 space-x-2">
                <span className="flex-1">
                  {servidor.discoLibreGb !== null && servidor.discoTotalGb !== null ? (
                    <>
                      {servidor.discoLibreGb} GB libre / 
                      {servidor.discoTotalGb} GB total ({
                        porcentaje(
                          servidor.discoTotalGb - servidor.discoLibreGb, 
                          servidor.discoTotalGb
                        ) ?? null}%
                      )
                    </>
                  ) : (
                    'sin medida en este aparato'
                  )}
                </span>
                {servidor.discoLibreGb !== null && servidor.discoTotalGb !== null && servidor.discoTotalGb > 0 && (
                  <div className="w-20 bg-muted rounded-h">
                    <div 
                      className={`h-2 rounded ${avisosPorServidor[servidor.nombre]?.includes('disco') ? 'bg-amber-500' : 'bg-primary'}`} 
                      style={{ width: `${porcentaje(
                        servidor.discoTotalGb - servidor.discoLibreGb, 
                        servidor.discoTotalGb
                      ) ?? 0}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
                        {/* Batería */}
            <div className="flex items-center">
              <span className="w-20">Batería:</span>
              <div className="flex-1 space-x-2">
                <span className="flex-1">
                  {servidor.bateriaPct !== null ? (
                    <>
                      {servidor.bateriaPct}% ({servidor.cargando ? 'Cargando' : 'Descargando'})
                    </>
                  ) : (
                    'sin medida en este aparato'
                  )}
                </span>
                {servidor.bateriaPct !== null && (
                  <div className="w-20 bg-muted rounded-h">
                    <div 
                      className={`h-2 rounded ${avisosPorServidor[servidor.nombre]?.includes('bateria') ? 'bg-amber-500' : 'bg-primary'}`} 
                      style={{ width: `${porcentaje(servidor.bateriaPct, 100) ?? 0}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ProcesosHardware;