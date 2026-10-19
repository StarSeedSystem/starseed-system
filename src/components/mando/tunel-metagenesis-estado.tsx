"use client";

import { useEffect, useState } from "react";
// Del archivo PURO, nunca de `tunel-metagenesis-estado.ts` (abre node:child_process y rompe `next build`).
import { tacharTexto, type EstadoTunelMetaGenesis } from "@/lib/mando/tunel-metagenesis-tipos";

export function TunelMetaGenesisEstado() {
  const [estado, setEstado] = useState<EstadoTunelMetaGenesis | null>(null);

  useEffect(() => {
    let montado = true;
    let intervaloId: NodeJS.Timeout | null = null;

    const obtenerEstado = async () => {
      try {
        const respuesta = await fetch("/api/mando/tunel-metagenesis");
        if (respuesta.ok) {
          const data = await respuesta.json();
          if (montado) {
            setEstado(data);
          }
        }
      } catch (error) {
        console.error("Error al obtener el estado del túnel:", error);
      }
    };

    const manejarCambioVisibilidad = () => {
      if (document.visibilityState === "visible") {
        // Cuando se vuelve visible, obtener estado inmediato y establecer intervalo
        obtenerEstado();
        intervaloId = setInterval(obtenerEstado, 60_000);
      } else {
        // Cuando se oculta, limpiar el intervalo
        if (intervaloId !== null) {
          clearInterval(intervaloId);
          intervaloId = null;
        }
      }
    };

    // Estado inicial
    if (document.visibilityState === "visible") {
      obtenerEstado();
      intervaloId = setInterval(obtenerEstado, 60_000);
    }

    // Escuchar cambios en la visibilidad
    document.addEventListener("visibilitychange", manejarCambioVisibilidad);

    return () => {
      montado = false;
      if (intervaloId !== null) {
        clearInterval(intervaloId);
      }
      document.removeEventListener("visibilitychange", manejarCambioVisibilidad);
    };
  }, []);

  if (!estado) {
    return <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/65">Cargando estado del túnel...</div>
  }

   return (
     <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/65">
       {estado.cargado && estado.pid !== null ? (
         <p className="mb-2">Túnel de MetaGenesis: activo (pid {estado.pid})</p>
       ) : (
         <p className="mb-2">Túnel de MetaGenesis: parado</p>
       )}
         {estado.cargado && estado.pid !== null && estado.ultimasLineas.length > 0 && (
           <div className="mt-2">
             <p className="mb-1 font-medium text-white/80">Últimas líneas:</p>
             <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap bg-black/20 p-2 rounded">
               {estado.ultimasLineas.map((línea, index) => (
                 <span key={index}>
                   {tacharTexto(línea)}{index < estado.ultimasLineas.length - 1 ? "\n" : ""}
                 </span>
               ))}
             </pre>
           </div>
         )}
     </div>
   );
}

export default TunelMetaGenesisEstado;