"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Thermometer, Network, Hash, AlertTriangle } from "lucide-react";

interface Bridge {
  neurona: string;
  destino: string;
  medio: string;
  calidad: number;
  coste: number;
}

interface Estado {
  promedioTemperatura: number;
  esVitreo: boolean;
  esFundido: boolean;
  esSubenfriado: boolean;
  estado: "vitreo" | "fundido" | "subenfriado" | "vacio";
  puentePromedio: number;
  neuronasActivas: number;
  neuronasMax: number;
  hashReticula: string;
  puentes: Bridge[];
  coordPorNeurona: Record<string, number>;
  mismoEnNMDeM: string;
  mensajeVacio: string;
}

interface PanelReticulaProps {
  estado: Estado;
}

export default function PanelReticula({ estado }: PanelReticulaProps) {
  const getEstadoTexto = (estado: Estado) => {
    switch (estado.estado) {
      case "vitreo":
        return "Vítreo: estable y congelada";
      case "fundido":
        return "Fundido: las señales cambian y la red se recoloca";
      case "subenfriado":
        return "Subenfriado: estable pero frágil";
      case "vacio":
        return estado.mensajeVacio;
      default:
        return "Estado desconocido";
    }
  };

  const getEstadoColor = (estado: Estado) => {
    switch (estado.estado) {
      case "vitreo":
        return "bg-blue-50 border-blue-200";
      case "fundido":
        return "bg-red-50 border-red-200";
      case "subenfriado":
        return "bg-yellow-50 border-yellow-200";
      case "vacio":
        return "bg-gray-50 border-gray-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const getEstadoIconColor = (estado: Estado) => {
    switch (estado.estado) {
      case "vitreo":
        return "text-blue-600";
      case "fundido":
        return "text-red-600";
      case "subenfriado":
        return "text-yellow-600";
      case "vacio":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  const getIcon = (estado: Estado) => {
    if (estado.estado === "vacio") {
      return <AlertTriangle className="w-5 h-5 text-gray-500" />;
    }
    return <Activity className="w-5 h-5" />;
  };

  const coordData = Object.entries(estado.coordPorNeurona).map(
    ([neurona, coord]) => ({ neurona, coord })
  );

  const bridgeData = estado.puentes.map((p) => ({
    key: `${p.neurona}-${p.destino}`,
    from: p.neurona,
    to: p.destino,
    medio: p.medio,
    calidad: p.calidad,
    coste: p.coste,
  }));

  return (
    <div className="space-y-6">
      <div className={`p-6 rounded-lg border ${getEstadoColor(estado)} transition-all`}>        <div className="flex items-center gap-3 mb-4">
          {getIcon(estado)}
          <h3 className="text-lg font-semibold">Sólido amorfo en tiempo real</h3>
        </div>

        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium">Estado:</span> {getEstadoTexto(estado)}
          </p>

          <div className="flex items-center gap-4">
            <Thermometer className={`w-4 h-4 ${getEstadoIconColor(estado)}`} />
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span>Temperatura promedio:</span>
                <span className="font-medium">{estado.promedioTemperatura.toFixed(1)}°C</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${estado.esVitreo ? "bg-blue-500" : estado.esFundido ? "bg-red-500" : estado.esSubenfriado ? "bg-yellow-500" : "bg-gray-500"}`}
                  style={{ width: `${Math.min(100, estado.promedioTemperatura)}%` }}
                ></div>
              </div>
            </div>
          </div>

          <p className="text-sm">
            <span className="font-medium">Significado:</span> La temperatura indica la estabilidad de la red:
            {estado.esVitreo && " fría y estable (vitrea)"}
            {estado.esFundido && " caliente y cambiante (fundida)"}
            {estado.esSubenfriado && " templada y potencialmente frágil (subenfriada)"}
            {estado.estado === "vacio" && " no hay señales disponibles"}
          </p>
        </div>
      </div>

      <div className="p-6 rounded-lg border bg-white border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Hash className="w-5 h-5 text-gray-600" />
          <h4 className="font-medium">Misma retícula en {estado.mismoEnNMDeM}</h4>
        </div>
        <p className="text-sm text-gray-600 font-mono break-all">
          {estado.hashReticula}
        </p>
      </div>

      {estado.puentes.length > 0 && (
        <div className="p-6 rounded-lg border bg-white border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Network className="w-5 h-5 text-gray-600" />
            <h4 className="font-medium">Puentes ({estado.puentes.length})</h4>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {estado.puentes.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono">{p.neurona}</span>
                  <span className="text-gray-400">↔</span>
                  <span className="font-mono">{p.destino}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-gray-600">[{p.medio}]</span>
                  <span className={`font-medium ${p.calidad >= 80 ? "text-green-600" : p.calidad >= 60 ? "text-yellow-600" : "text-red-600"}`}>{p.calidad}%</span>
                  <span className="text-gray-500">Coste: {p.coste}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {coordData.length > 0 && (
        <div className="p-6 rounded-lg border bg-white border-gray-200">
          <h4 className="font-medium mb-4">Coordinación por neurona</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coordData}>
                <XAxis dataKey="neurona" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${value}%`, "Coordinación"]} />
                <Bar dataKey="coord" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            {estado.neuronasActivas}/{estado.neuronasMax} activas
          </div>
        </div>
      )}
    </div>
  );
}
