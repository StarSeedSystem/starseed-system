"use client";

import type { Brain } from "@/lib/brains/brains";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Button,
} from "@/components/ui/button";
import {
  useState,
} from "react";

export interface TelepatiaDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  cerebros: Brain[];
  onHecho?: () => void;
}

export default function TelepatiaDialog({
  open,
  onOpenChange,
  cerebro,
}: TelepatiaDialogProps) {
  const [vinculos, setVinculos] = useState<Array<{
    id: string;
    destino: string;
    tipo: string;
    alcance: string;
    direccion: "enviar" | "recibir" | "ambas";
    acceso: "leer" | "escribir";
    estado: "activo" | "pausado" | "pendiente";
    motivo: string;
    creadoEn: string;
    ultimaSync?: string;
  }>>([]);

  const agregarVinculo = () => {
    const id = Math.random().toString(36).substr(2, 9);
    setVinculos([...vinculos, {
      id,
      destino: "Ejemplo de destino",
      tipo: "cerebro",
      alcance: "Memorias, configuraciones",
      direccion: "ambas",
      acceso: "leer",
      estado: "pendiente",
      motivo: "Esperando configuración",
      creadoEn: new Date().toISOString(),
    }]);
  };

  const sincronizarVinculo = (id: string) => {
    setVinculos(vinculos.map(v => 
      v.id === id 
        ? { ...v, estado: "activo", ultimaSync: new Date().toISOString(), motivo: "Sincronizado correctamente" } 
        : v
    ));
  };

  const toggleEstadoVinculo = (id: string) => {
    setVinculos(vinculos.map(v => 
      v.id === id 
        ? { ...v, estado: v.estado === "activo" ? "pausado" : "activo", motivo: v.estado === "activo" ? "Pausado por usuario" : "Sincronización reanudada" } 
        : v
    ));
  };

  const eliminarVinculo = (id: string) => {
    setVinculos(vinculos.filter(v => v.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Telepatía · «{cerebro.name}»
          </DialogTitle>
          <DialogDescription>
            Telepatía vincula y sincroniza sin mezclar: cada cerebro sigue siendo suyo
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {vinculos.length > 0 ? (
            <>
              <h3 className="font-medium mb-2">Vínculos activos</h3>
              <div className="space-y-2">
                {vinculos.map(v => (
                  <div key={v.id} className="border rounded p-3">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 h-3 w-3">
                        <div className={`h-3 w-3 rounded-full ${v.estado === "activo" ? "bg-green-500" : v.estado === "pausado" ? "bg-yellow-500" : "bg-gray-500"}`}></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{v.tipo === "cerebro" ? `Cerebro: ${v.destino}` : v.tipo === "grupo" ? `Grupo: ${v.destino}` : v.tipo === "pagina" ? `Página: ${v.destino}` : `Cuenta externa: ${v.destino}`}</p>
                        <p className="text-xs text-muted-foreground">Alcance: {v.alcance}</p>
                        <p className="text-xs text-muted-foreground">Dirección: {v.direccion} | Acceso: {v.acceso}</p>
                        <p className="text-xs text-muted-foreground">Estado: {v.estado} ({v.motivo})</p>
                        {v.ultimaSync && <p className="text-xs text-muted-foreground">Última sync: {new Date(v.ultimaSync).toLocaleString()}</p>}
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-2">
                      <Button variant="outline" size="icon" onClick={() => sincronizarVinculo(v.id)} className="h-7 w-7" aria-label="Sincronizar ahora">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.001 8.001 0 01-15.357-2m15.357 2h8.582m5.644 2A8.001 8.001 0 0119.418 15H15m-5-5v8"></path></svg>
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => toggleEstadoVinculo(v.id)} className="h-7 w-7" aria-label={v.estado === "activo" ? "Pausar" : "Reanudar"}>
                        {v.estado === "activo" ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 4h3a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2zm8 0h3a2 2 0 012 2v4a2 2 0 01-2 2h-3a2 2 0 01-2 2V6a2 2 0 012-2zm0 0"></path></svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 5l6 6-6 6V5z"></path></svg>
                        )}
                      </Button>
                      <Button variant="destructive" variant="outline" size="icon" onClick={() => eliminarVinculo(v.id)} className="h-7 w-7" aria-label="Quitar vínculo">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">No hay vínculos de telepatía aún. Cree su primer vínculo abajo.</p>
          )}

          <div className="mt-4">
            <Button variant="secondary" onClick={agregarVinculo} className="w-full">
              Nuevo vínculo
            </Button>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            {vinculos.length > 0 && (
              <>
                <Button variant="outline" onClick={() => {
                  vinculos.filter(v => v.estado === "activo" || v.estado === "pausado").forEach(v => sincronizarVinculo(v.id));
                }}>
                  Sincronizar ahora
                </Button>
                <Button onClick={() => {
                  vinculos.forEach(v => toggleEstadoVinculo(v.id));
                }}>
                  {vinculos.some(v => v.estado === "activo") ? "Pausar todo" : "Reanudar todo"}
                </Button>
              </>
            )}
            <Button variant="destructive" onClick={onHecho}>
              Listo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}