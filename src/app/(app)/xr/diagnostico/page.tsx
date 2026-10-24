"use client";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { construirInforme } from "@/lib/xr/diagnostico";
import type { DatosNavegador, CapacidadesXR, PlanEntrada } from "@/lib/xr/capacidades";
import type { SesionXR, CalidadXR } from "@/lib/xr/diagnostico";
import { useToast } from "@/hooks/use-toast";

interface DiagnosticoPageProps {
  datos?: DatosNavegador;
  capacidades?: CapacidadesXR;
  plan?: PlanEntrada;
  sesion?: SesionXR;
  calidad?: CalidadXR;
  entradas?: string[];
  microfono?: "concedido" | "denegado" | "sin-probar";
}

export default function DiagnosticoPage({
  datos,
  capacidades,
  plan,
  sesion,
  calidad,
  entradas,
  microfono,
}: DiagnosticoPageProps) {
  const [informe, setInforme] = useState<null | ReturnType<typeof construirInforme>>(null);
  const [loading, setLoading] = useState(false);
  const [micTestRequested, setMicTestRequested] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (datos && capacidades && plan) {
      const config = {
        datos,
        capacidades,
        plan,
        sesion,
        calidad,
        entradas,
        microfono,
        ahora: Date.now(),
      };
      const informeGenerado = construirInforme(config);
      setInforme(informeGenerado);
    }
  }, [datos, capacidades, plan, sesion, calidad, entradas, microfono]);

  const handleCopy = async () => {
    if (!informe) return;

    try {
      await navigator.clipboard.writeText(informe.texto);
      toast({
        title: "Éxito",
        description: "Informe copiado al portapapeles",
      });
    } catch (error) {
      const textArea = document.createElement("textarea");
      textArea.value = informe.texto;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast({
        title: "Éxito",
        description: "Informe copiado al portapapeles (método de respaldo)",
      });
    }
  };

  const estadoColor = {
    ok: "bg-green-500/20 text-green-400 border-green-500/30",
    aviso: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    fallo: "bg-red-500/20 text-red-400 border-red-500/30",
    "sin-probar": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  const estadoTexto = {
    ok: "OK",
    aviso: "AVISO",
    fallo: "FALLO",
    "sin-probar": "SIN-PRECISAR",
  };

  if (!datos || !capacidades || !plan) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-violet-400" />
          <p className="mt-4 text-white/70">Cargando capacidades XR...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Diagnóstico del visor</h1>
        <p className="mt-2 text-sm text-white/60">
          Informe de compatibilidad para {capacidades.plataforma}
        </p>
      </header>

      {informe && (
        <div className="rounded-2xl border border-white/10 bg-[#05060f] p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{informe.titulo}</h2>
              <p className="text-sm text-white/50">Generado el {new Date(informe.fecha).toLocaleString()}</p>
            </div>
            <button
              onClick={handleCopy}
              className="cursor-pointer rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Copiar informe
            </button>
          </div>

          <div className="space-y-6">
            {informe.secciones.map((seccion, idx) => (
              <div key={idx} className="space-y-3">
                <h3 className="text-sm font-medium text-white/80">{seccion.nombre}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {seccion.lineas.map((linea, lineaIdx) => (
                    <div
                      key={lineaIdx}
                      className={`cursor-pointer rounded-lg border p-4 transition-all hover:scale-105 ${estadoColor[linea.estado]}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-white">{linea.clave}</span>
                        <span className="text-xs font-semibold">{estadoTexto[linea.estado]}</span>
                      </div>
                      <div className="text-lg font-mono text-white/90">{linea.valor}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {informe.texto && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-medium text-white/80">Informe plano</h3>
                <div className="rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs text-white/70">
                  <pre className="whitespace-pre-wrap">{informe.texto}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!sesion && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-400">
          <p className="text-sm">No hay una sesión XR activa. Algunos elementos pueden mostrar &quot;sin-probar&quot; estado.</p>
        </div>
      )}

      {micTestRequested && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-blue-400">
          <p className="text-sm">Prueba de micrófono iniciada...</p>
          <p className="text-xs text-white/60">Compruebe el ícono del micrófono en su navegador.</p>
        </div>
      )}
    </div>
  );
}
