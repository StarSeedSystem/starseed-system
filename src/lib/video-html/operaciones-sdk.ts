import type { Operacion } from "@/lib/protomolecula/tipos";
import type { ParametroRef } from "@/lib/protomolecula/tipos";
import type { Accion } from "@/lib/protomolecula/tipos>;
import type { ValorParametro } from "@/lib/protomolecula/tipos>;
import type { ModoRelativo } from "@/lib/protomolecula/tipos>;
import type { Autor } from "@/lib/protomolecula/tipos>;
import type { Origen } from "@/lib/protomolecula/tipos>";

/**
 * Traduce una Operacion de la Protomolécula a un comando del SDK de HyperFrames.
 */
export function traducirOperacionASDK(operacion: Operacion): 
  | { tipo: "setText"; target: string; value: string }
  | { tipo: "setStyle"; target: string; styles: Record<string, string> }
  | { tipo: "setTiming"; target: string; start: number; duration: number }
  | { tipo: "setAttribute"; target: string; name: string; value: string }
  | { tipo: "setVariableValue"; id: string; value: ValorParametro }
  | { tipo: "rechazado"; motivo: string } {
  const { objetivo, accion } = operacion;
  const { atomoId, parametroId } = objetivo;
  const target = `${atomoId}::${parametroId}`;

  // Rechazar propiedades no permitidas
  if (/^on/i.test(parametroId)) return { tipo: "rechazado", motivo: `Propiedad no permitida: ${parametroId}` };
  if (parametroId.toLowerCase() === "src" && 
      typeof operacion.valor === "string" && 
      operacion.valor.toLowerCase().includes("javascript:")) 
    return { tipo: "rechazado", motivo: `Propiedad no permitida: ${parametroId}` };

  // Rechazar animaciones GSAP
  if (/^(gsap|setgsaptween|addgsaptween|tween|ease)/i.test(parametroId)) 
    return { tipo: "rechazado", motivo: `Animación GSAP no permitida: ${parametroId}` };

  switch (accion.tipo) {
    case "exacta": {
      const valor = accion.valor;
      
      // Variables
      if (/^\$[a-zA-Z]/i.test(parametroId) || 
          ["title", "description", "author"].includes(parametroId.toLowerCase())) 
        return { tipo: "setVariableValue", id: parametroId, value: valor };
      
      // Texto
      if (/text|content|html|innerhtml|label|placeholder/i.test(parametroId)) 
        return { tipo: "setText", target, value: String(valor) };
      
      // Estilos
      if (/color|background|margin|padding|border|width|height|display|position|font|opacity|transform|transition|animate/i.test(parametroId)) 
        return { 
          tipo: "setStyle", 
          target, 
          target, 
          styles: convertirValorAEstilo(valor, parametroId) 
        };
      
      // Timing
      if (/start|begin|in|duration|delay|end|finish|out/i.test(parametroId)) 
        return { 
          tipo: "setTiming", 
          target, 
          start: +valor, 
          duration: 1 
        };
      
      // Atributos (por defecto)
      return { 
        tipo: "setAttribute", 
        target, 
        name: parametroId, 
        value: String(valor) 
      };
    }
    
    case "relativa":
    case "alternar":
      return { 
        tipo: "rechazado", 
        motivo: `Acciones ${accion.tipo} no implementadas (requieren valor actual)` 
      };
      
    case "disparo": {
      const disparos: Record<string, { name: string; value: string }> = {
        play: { name: "data-action", value: "play" },
        pause: { name: "data-action", value: "pause" },
        restart: { name: "data-action", value: "restart" },
        toggle: { name: "data-action", value: "toggle" }
      };
      
      const disparo = disparos[parametroId.toLowerCase()];
      if (disparo) 
        return { 
          tipo: "setAttribute", 
          target, 
          name: disparo.name, 
          value: disparo.value 
        };
      return { 
        tipo: "rechazado", 
        motivo: `Disparo no mapeado: ${parametroId}` 
      };
    }
  }
}

/**
 * Convierte un valor a un objeto de estilos CSS.
 */
function convertirValorAEstilo(valor: ValorParametro, parametroId: string): Record<string, string> {
  const estilos: Record<string, string> = {};
  
  if (typeof valor === "string") {
    if (valor.startsWith("{") && valor.endsWith("}")) {
      try { Object.assign(estilos, JSON.parse(valor)); } catch {}
    } else if (valor.includes(":")) {
      valor.split(";").forEach(par => {
        const [clabe, val] = par.split(":");
        if (clabe && val) estilos[clabe.trim()] = val.trim();
      });
    } else {
      estilos[parametroId] = valor;
    }
  } else if (typeof valor === "number" || typeof valor === "boolean") {
    estilos[parametroId] = valor.toString();
  }
  
  return estilos;
}