"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useGenerar3d } from "@/lib/avatares/adaptadores/use-generar-3d";
import { type Destino3D } from "@/lib/avatares/adn/optimizacion";

interface Generar3dProps {
  destino: Destino3D;
  esqueleto: string;
  onComplete?: (adn: any) => void;
  onCancel?: () => void;
}

export default function Generar3dDialog({
  destino,
  esqueleto,
  onComplete,
  onCancel,
}: Generar3dProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { 
    iniciarGeneracion, 
    cargando, 
    progreso, 
    mensaje, 
    error, 
    resultado,
    reiniciar 
  } = useGenerar3d();

  const handleAbrir = () => {
    setIsOpen(true);
    reiniciar();
  };

  const handleCerrar = () => {
    setIsOpen(false);
    onCancel?.();
  };

  const handleCompletar = async () => {
    try {
      await iniciarGeneracion(destino, esqueleto);
      if (resultado) {
        onComplete?.(resultado);
      }
    } catch (err) {
      // Error is handled by the hook
    } finally {
      setIsOpen(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleAbrir}>
        Crear en 3D desde imagen
      </Button>

      <Dialog open={isOpen} onOpenChange={handleCerrar}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>Crear en 3D desde una imagen</DialogTitle>
            <DialogDescription>
              Selecciona una imagen de tu Biblioteca o dispositivo para generar un modelo 3D
              optimizado para {getNombreDestino(destino)}.
            </DialogDescription>
          </DialogContent>
          
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-border p-4 mb-4">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {resultado && (
            <div className="bg-success/10 text-success rounded-border p-4 mb-4">
              <p className="text-sm">Modelo 3D generado y guardado en tu Biblioteca</p>
            </div>
          )}

          {!cargando && !resultado && (
            <button 
              type="button" 
              onClick={handleAbrir} 
              className="w-full text-left space-y-2"
            >
              <div className="flex items-center">
                <span className="text-sm">Seleccionar imagen...</span>
              </div>
            </button>
          )}

          {cargando && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{mensaje}</p>
                <div className="w-full bg-border rounded-full h-2.5 mt-1">
                  <div 
                    className="bg-primary h-2.5 rounded-full transition-all" 
                    style={{ width: `${progreso}%` }}
                  ></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {progreso}%
                </p>
              </div>
              
              {!resultado && (
                <div className="flex justify-end space-x-3">
                  <Button variant="outline" size="xs" onClick={handleCerrar}>
                    Cancelar
                  </Button>
                  <Button 
                    variant="default" 
                    size="xs" 
                    onClick={handleCompletar}
                    disabled={progreso < 100}
                  >
                    {progreso < 100 ? "Generando..." : "Completar"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function getNombreDestino(destino: Destino3D): string {
  switch (destino) {
    case "protomolecula": return "la Protomolécula";
    case "avatar": return "tu avatar";
    case "bot": return "el cuerpo de tu bot";
    case "pieza": return "una pieza suelta";
    case "impresion": return "impresión 3D";
    default: return destino;
  }
}