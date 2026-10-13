"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { enviarOrden, type AccionOrden } from "@/lib/metagenesis/remoto-nodos-cliente";
import { ACCIONES } from "@/lib/metagenesis/remoto-nodos";
import { textoHace } from "@/lib/metagenesis/remoto";

interface NodoConBotones {
  nodo: string;
  medio: string;
  etiqueta: string;
  vivo: boolean;
  lider: boolean;
  hace_ms: number;
  modo: string;
  orquestadores: string[];
  caidos: string[];
  disco_gb: number | null;
  trabajo: Record<string, string | null>;
  enCurso: Array<{
    id: string;
    fase: string;
    punto: {
      rama: string;
      sha: string;
      t: number;
    };
  }>;
  contenedor: {
    activo: boolean;
    agentes: number;
    apto: true;
    motivo: string;
  };
}

export function ColmenaBotones({ nodo }: { nodo: NodoConBotones }) {
  const [enviando, setEnviando] = useState<AccionOrden | null>(null);
  const [confirmando, setConfirmando] = useState<AccionOrden | null>(null);

  const mandar = async (accion: AccionOrden) => {
    if (ACCIONES[accion].confirmar && confirmando !== accion) {
      setConfirmando(accion);
      return;
    }
    setConfirmando(null);
    setEnviando(accion);
    try {
      await enviarOrden(accion, "lider");
    } finally {
      setEnviando(null);
    }
  };

  // Determine if disconnect button should be shown
  const mostrarDesconectar = nodo.enCurso.length > 0;
  const contarAgentesTrabajo = nodo.enCurso.reduce(
    (total, tarea) => total + 1,
    0
  );

  // Determine if container button should be shown
  const mostrarContenedor =
    nodo.contenedor.activo && nodo.contenedor.apto && nodo.vivo;

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      {/* Información de tarea a medias */}
      {nodo.enCurso.length > 0 && (
        <div className="text-xs text-white/60">
          Último punto hace {textoHace(Date.now() - nodo.enCurso[0].punto.t)}
        </div>
      )}

      {/* Botón de desconectar */}
      {mostrarDesconectar && (
        <Button
          variant="outline"
          size="sm"
          className="w-full cursor-pointer gap-1 px-2 text-xs"
          disabled={enviando === "desconectar" || !nodo.vivo}
          title={
            nodo.vivo
              ? `Guarda el trabajo a medias de sus ${contarAgentesTrabajo} agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet.`
              : "Nodo no disponible"
          }
          data-testid={`mg-nodo-${nodo.nodo.replace(
            /\./g,
            "-"
          )}-desconectar`}
          onClick={() => void mandar("desconectar")}
        >
          {enviando === "desconectar" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            </>
          ) : (
            "Desconectar"
          )}
          {confirmando === "desconectar" && (
            <span className="ml-2 text-xs">¿Seguro? Pulsa otra vez</span>
          )}
        </Button>
      )}

      {/* Botón de contenedor */}
      {mostrarContenedor && (
        <Button
          variant="outline"
          size="sm"
          className="w-full cursor-pointer gap-1 px-2 text-xs"
          disabled={enviando === "contenedor" || !nodo.vivo}
          title="Termina lo que lleva y no coge más."
          data-testid={`mg-nodo-${nodo.nodo.replace(
            /\./g,
            "-"
          )}-contenedor`}
          onClick={() => void mandar("contenedor")}
        >
          {enviando === "contenedor" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            </>
          ) : (
            nodo.contenedor.activo
              ? "Dejar de usar como contenedor"
              : "Usar como contenedor"
          )}
          {confirmando === "contenedor" && (
            <span className="ml-2 text-xs">¿Seguro? Pulsa otra vez</span>
          )}
        </Button>
      )}

      {/* Botón de instalar trabajador */}
      {!nodo.vivo && (
        <Button
          variant="outline"
          size="sm"
          className="w-full cursor-pointer gap-1 px-2 text-xs"
          disabled={enviando === "instalar_trabajador" || nodo.vivo}
          title="Instala un trabajador en este nodo para que pueda unirse al enjambre."
          data-testid={`mg-nodo-${nodo.nodo.replace(
            /\./g,
            "-"
          )}-instalar-trabajador`}
          onClick={() => void mandar("instalar_trabajador")}
        >
          {enviando === "instalar_trabajador" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            </>
          ) : (
            "Instalar trabajador"
          )}
        </Button>
      )}
    </div>
  );
}