import { useState, useCallback } from "react";
import { Cloud, WifiOff, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Interruptor de privacidad "Oído en la nube".
 * Guarda en localStorage["starseed.oido.nube"] ("1" encendido, "0" apagado).
 */
export function OidoNubeAjuste({ className }: { className?: string }) {
  const [encendido, setEncendido] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("starseed.oido.nube") !== "0";
  });

  const toggle = useCallback(() => {
    const nuevo = !encendido;
    setEncendido(nuevo);
    localStorage.setItem("starseed.oido.nube", nuevo ? "1" : "0");
  }, [encendido]);

  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-400" />
            Oído en la nube
          </h4>
          <p className="text-[11px] text-muted-foreground max-w-sm">
            Si está activado, el audio se envía a transcribir (Groq/Gemini). 
            <span className="text-foreground/70 font-medium"> No se guarda nada.</span>
          </p>
        </div>
        <Button 
          variant={encendido ? "default" : "outline"}
          size="sm"
          onClick={toggle}
          className="w-20"
        >
          {encendido ? "Activado" : "Apagado"}
        </Button>
      </div>
      <div className="text-[10px] text-muted-foreground/60 border-t border-white/5 pt-2">
        Estado actual: Oído por <span className="text-foreground/80">Groq Whisper Large</span> · 
        Última voz: <span className="text-foreground/80">Aurora (k2-fsa)</span>
      </div>
    </div>
  );
}
