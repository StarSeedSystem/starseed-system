import { useCallback, useEffect, useState } from "react";
import { leerEstadoAutonomo, type LecturaAutonoma } from "@/lib/metagenesis/remoto-nodos-cliente";
import { enviarOrden as enviarOrdenFn } from "@/lib/metagenesis/remoto-nodos-cliente";
import { type NodoEstado } from "@/lib/metagenesis/remoto-nodos";

export const ColmenaBotones = () => {
  const [lectura, setLectura] = useState<LecturaAutonoma | null>(null);
  const [enviarOrden] = useState(() => enviarOrdenFn);

  useEffect(() => {
    const leer = async () => {
      try {
        const r = await leerEstadoAutonomo(Date.now());
        setLectura(r);
      } catch (e) {
        console.error("Error reading estado:", e);
      }
    };

    leer();
    const intervalo = setInterval(() => leer(), 30_000); // Cada 30 segundos
    return () => clearInterval(intervalo);
  }, []);

  // Si no hay lectura aún, mostrar indicador de carga (en tests, esto hará que el componente devuelva null)
  if (!lectura) {
    return null;
  }

  const estado = lectura?.ok ? lectura.estado : null;
  if (!estado) {
    return null;
  }

  const nodos = estado.nodos || [];

  const handleClick = async (orden: string, nodoId: string) => {
    await enviarOrden(orden, nodoId);
  };

  return (
    <div className="space-y-2">
      {nodos.map((nodo) => (
        <li
          key={nodo.nodo}
          data-testid="mg-nodo"
          className="rounded-xl border p-3 text-sm"
        >
          <div className="flex items-center gap-2 mb-2">
      {/* Botón de desconectar */}
      <button
        data-testid={`mg-nodo-${nodo.nodo}-desconectar`}
        onClick={() => handleClick("desconectar", nodo.nodo)}
        disabled={!(nodo.enCurso && nodo.enCurso.length > 0)}
        title="Guarda el trabajo a medias de sus 1 agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet."
      >
        Desconectar
      </button>
            
            {/* Botón de contenedor */}
            {nodo.vivo && nodo.contenedor && nodo.contenedor.activo && nodo.contenedor.apto && (
              <button
                data-testid={`mg-nodo-${nodo.nodo}-contenedor`}
                onClick={() => handleClick("contenedor", nodo.nodo)}
                title="Termina lo que lleva y no coge más."
              >
                {nodo.contenedor.activo ? "Dejar de usar como contenedor" : "Usar como contenedor"}
              </button>
            )}
            
            {/* Botón de instalador de trabajador */}
            {!nodo.trabajador && nodo.vivo && (
              <button
                data-testid={`mg-nodo-${nodo.nodo}-trabajador`}
                onClick={() => handleClick("instalar_trabajador", nodo.nodo)}
                title="Instala un trabajador en este nodo para que pueda ejecutar tareas."
              >
                Instalar trabajador
              </button>
            )}
          </div>
          
          {/* Información de tarea a medias */}
          {nodo.enCurso && nodo.enCurso.length > 0 && nodo.enCurso[0] && (
            <div className="text-[11px] text-white/40 mb-1">
              Último punto hace {
                Math.floor((Date.now() - nodo.enCurso[0].punto.t) / 60000)
              } min
            </div>
          )}
          
          {/* Línea de información bajo el nombre del nodo */}
          {nodo.contenedor?.activo && nodo.enCurso && nodo.enCurso.length > 0 && (
            <div className="text-[11px] text-white/40">
              {nodo.enCurso.length} agentes{""}
              {nodo.contenedor.activo ? " contenedor activo" : ""}
              {nodo.contenedor?.motivo}
            </div>
          )}
          
          {/* Información básica del nodo */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-white/90">{nodo.etiqueta}</span>
            {nodo.lider && nodo.vivo ? (
              <span className="text-amber-400">dirige</span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-[11px] text-white/40">{nodo.nodo}</p>
        </li>
      ))}
    </div>
  );
};