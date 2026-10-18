"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Plus, 
  X, 
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CATALOGO_INVITADOS, type EntradaInvitado, crearInvitado } from "@/lib/astraura-bots/invitados";
import { guardarBots } from "@/lib/astraura-bots/adaptadores/almacen-bots";
import { type Bot } from "@/lib/astraura-bots/tipos";

interface AnadirInvitadoProps {
  perfilId: string;
  cuentaId: string;
  onClose: () => void;
}

export function AnadirInvitado({ 
  perfilId, 
  cuentaId, 
  onClose 
}: AnadirInvitadoProps) {
  // Estado del formulario
  const [tipo, setTipo] = useState<EntradaInvitado["tipo"]>("grok");
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [variable, setVariable] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);

  // Manejar envío del formulario
  const handleSubmit = async () => {
    setBusy(true);
    try {
       let entrada: EntradaInvitado;
       if (tipo === "openai-compatible") {
         entrada = { 
           tipo, 
           nombre: nombre.trim(),
           url: url.trim(),
           variable: variable.trim()
         };
       } else if (tipo === "ag-ui") {
         entrada = { 
           tipo, 
           nombre: nombre.trim(),
           endpoint: endpoint.trim()
         };
       } else {
         entrada = { 
           tipo, 
           nombre: nombre.trim()
         };
       }

      const resultado = crearInvitado(entrada, perfilId, cuentaId);
      if ("problemas" in resultado) {
        resultado.problemas.forEach((p) => toast.error(p));
        return;
      }

      const botNuevo = resultado as Bot;
      const botsActuales = await leerBots(perfilId, cuentaId);
      guardarBots([...botsActuales, botNuevo], Date.now());
      toast.success(`Invitado «${botNuevo.nombre}» añadido.`);
      onClose();
    } catch (err) {
      toast.error("Error al crear el invitado.");
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  // Función auxiliar para leer bots (duplicada de panel-bots.tsx, pero podemos importarla?)
  async function leerBots(perfilId: string, cuentaId: string): Promise<Bot[]> {
    if (typeof window === "undefined") return [];
    try {
      const bruto = window.localStorage.getItem(
        `starseed.astraura.bots.${perfilId}.${cuentaId}`
      );
      return bruto ? JSON.parse(bruto) : [];
    } catch {
      return [];
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-[90vw] max-w-2xl max-h-[90vh] bg-primary rounded-xl p-6 space-y-4">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-semibold">Añadir invitado</h2>
          <button 
            type="button" 
            onClick={onClose}
            className="btn-icono rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {/* Selección de tipo de invitado */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <span>Tipo de invitado</span>
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["grok", "Grok (xAI)"],
              ["openai-compatible", "OpenAI compatible"],
              ["ag-ui", "AG-UI"]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                value={value}
                onClick={() => setTipo(value as EntradaInvitado["tipo"])}
                className={cn(
                  "flex items-center justify-between w-full rounded-border p-3 text-left",
                  tipo === value
                    ? "bg-primary/20 text-primary-foreground border border-primary"
                    : "bg-muted/20 text-muted-foreground border border-muted/50"
                )}
              >
                <span className="flex-1">{label}</span>
                <span className="text-xs">{CATALOGO_INVITADOS[value as keyof typeof CATALOGO_INVITADOS].costeOrientativo}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Nombre del invitado */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Nombre obligatorio</label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre descriptivo"
            className="input"
          />
          {!nombre && (
            <p className="text-xs text-destructive">El nombre es obligatorio</p>
          )}
        </div>

        {/* Campos específicos según el tipo */}
        {tipo === "openai-compatible" && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL del endpoint</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="input"
              />
              {!url && (
                <p className="text-xs text-destructive">La URL es obligatoria</p>
              )}
              {url && !/^https?:\/\/.+/.test(url) && (
                <p className="text-xs text-destructive">URL no válida</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de variable de entorno</label>
              <Input
                value={variable}
                onChange={(e) => setVariable(e.target.value)}
                placeholder="XAI_API_KEY (solo el nombre)"
                className="input"
              />
              {!variable && (
                <p className="text-xs text-destructive">El nombre de la variable es obligatorio</p>
              )}
            </div>
          </>
        )}
        {tipo === "ag-ui" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Endpoint AG-UI</label>
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://ag-ui.example.com/endpoint"
              className="input"
            />
            {!endpoint && (
              <p className="text-xs text-destructive">El endpoint es obligatorio</p>
            )}
            {endpoint && !/^https?:\/\/.+/.test(endpoint) && (
              <p className="text-xs text-destructive">Endpoint no válido</p>
            )}
          </div>
        )}

        {/* Aviso informativo */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Información importante</label>
          <p className="text-sm text-muted-foreground">
            {CATALOGO_INVITADOS[tipo]?.aviso || ""}
          </p>
        </div>

        {/* Botón para configurar la clave (solo para tipos que necesitan clave) */}
        {(tipo === "openai-compatible" || tipo === "grok") && (
          <div className="space-y-3">
            <label className="text-sm font-medium">Configuración de claves</label>
            <p className="text-sm text-muted-foreground">
              La clave no se escribe aquí. Configúrela en{" "}
              <Link href="/conexiones" className="underline">
                Conexiones
              </Link>.
            </p>
          </div>
        )}

        {/* Botón de envío */}
        <Button
          variant="default"
          onClick={handleSubmit}
          disabled={busy}
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 size={20} className="mr-2" />
              Añadiendo...
            </>
          ) : (
            <>
              <Plus size={20} className="mr-2" />
              Añadir invitado
            </>
          )}
        </Button>
      </div>
    </div>
  );
}