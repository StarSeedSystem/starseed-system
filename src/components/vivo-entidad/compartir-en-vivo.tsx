"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createSpace } from "@/lib/spaces/spaces";
import { crearSesion, construirUrlPublica, origenActual } from "@/lib/mensajeria/sesiones-vivas";
import { usePresentesSesion } from "@/lib/mensajeria/sesiones-vivas";
import type { Canvas } from "@/lib/canvas/canvas";
import { getEdges } from "@/lib/canvas/workcenters";

export interface CompartirEnVivoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId?: string;
  canvasTitle?: string;
  blocks?: unknown[];
  edges?: unknown[];
  /** Si es true, la pizarra ya tiene un espacio compartido (boardSpaceId existe). */
  espacioId?: string | null;
  /** ID de la sesión en vivo si ya existe. */
  sesionId?: string | null;
}

export function CompartirEnVivo({ open, onOpenChange, canvasId, canvasTitle, blocks, edges, espacioId, sesionId }: CompartirEnVivoProps) {
  const [loading, setLoading] = useState(false);
  const [createdEspacioId, setCreatedEspacioId] = useState<string | null>(espacioId ?? null);
  const [createdSesionId, setCreatedSesionId] = useState<string | null>(sesionId ?? null);
  const [url, setUrl] = useState<string | null>(null);

  usePresentesSesion(createdSesionId, !!createdSesionId);

  const handleCompartir = async () => {
    setLoading(true);
    try {
      if (!createdEspacioId) {
        const space = await createSpace({
          kind: "board",
          title: canvasTitle || "Pizarra compartida",
          access: "invite",
          doc: { blocks: blocks ?? [], edges: edges ?? [] },
        });
        if (!space) {
          toast.error("No se pudo crear el espacio compartido. Inicia sesión e inténtalo de nuevo.");
          return;
        }
        setCreatedEspacioId(space.id);
      }

      const espacioIdToUsar = createdEspacioId || espacioId;
      if (!espacioIdToUsar) return;

      const { sesion, error } = await crearSesion({
        tipo: "pizarra",
        titulo: canvasTitle || "Pizarra compartida",
        refId: espacioIdToUsar,
        acceso: { modo: "chat", permiso: "editar" },
      });

      if (!sesion) {
        toast.error(error || "No se pudo abrir la sesión en vivo.");
        return;
      }

      setCreatedSesionId(sesion.id);
      if (sesion.tokenPublico) {
        const urlStr = construirUrlPublica(origenActual(), sesion, sesion.tokenPublico);
        setUrl(urlStr);
      }
      toast.success("Pizarra compartida en vivo");
    } catch (e) {
      toast.error("Error al compartir: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopiar = async () => {
    if (createdEspacioId && url) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace copiado al portapapeles");
      } catch {
        toast.message("Enlace", { description: url });
      }
    }
  };

  const handleCerrar = () => {
    setCreatedEspacioId(espacioId ?? null);
    setCreatedSesionId(sesionId ?? null);
    setUrl(null);
    onOpenChange(false);
  };

  const presentes = usePresentesSesion(createdSesionId, !!createdSesionId);
  const yaCompartida = !!espacioId || !!sesionId;

  return (
    <Dialog open={open} onOpenChange={handleCerrar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir en vivo</DialogTitle>
          <DialogDescription>
            Comparte esta pizarra con otras personas en tiempo real.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {yaCompartida && createdSesionId && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-lg">
              <Badge variant="outline" className="bg-emerald-500/20 text-emerald-700">
                EN VIVO
              </Badge>
              {presentes !== null && (
                <span className="text-sm text-foreground">
                  {presentes} {presentes === 1 ? "persona" : "personas"} dentro
                </span>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium mb-2">Título de la sesión</h3>
            <Input
              defaultValue={canvasTitle || "Pizarra compartida"}
              placeholder="Nombre de la pizarra compartida"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCompartir}
              disabled={loading || yaCompartida}
              className="flex-1"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : yaCompartida ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              {yaCompartida ? "Compartida · ver estado" : "Compartir en vivo"}
            </Button>
            {url && (
              <Button variant="outline" size="icon" onClick={handleCopiar}>
                <Copy className="w-4 h-4" />
              </Button>
            )}
          </div>

          {url && (
            <div className="text-xs text-muted-foreground break-all">
              {url}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}