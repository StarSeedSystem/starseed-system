export interface NeuronaCandidata {
  id: string;
  online: boolean;
  usoReciente: number;
  elegida?: boolean;
}

export function elegirCanaria(ns: readonly NeuronaCandidata[]): string | null {
     const online = ns.filter(n => n.online);
     if (online.length === 0) {
       return null;
     }
     const elegida = online.find(n => n.elegida === true);
     if (elegida) {
       return elegida.id;
     }
     return online.reduce((best, current) => {
       if (current.usoReciente > best.usoReciente) {
         return current;
       } else if (current.usoReciente === best.usoReciente) {
         return current.id < best.id ? current : best;
       } else {
         return best;
       }
     }, online[0]).id;
   }

export interface ResultadoHumo {
  paginaCarga: boolean;
  servicios: Record<string, boolean>;
}

export function evaluarHumo(r: ResultadoHumo): { ok: boolean; fallos: string[] } {
   const fallos: string[] = [];
   if (!r.paginaCarga) {
     fallos.push("paginaCarga");
   }
   for (const [servicio, estado] of Object.entries(r.servicios)) {
     if (!estado) {
       fallos.push(servicio);
     }
   }
   return { ok: fallos.length === 0, fallos };
 }

export type EstadoDespliegue = 
  | "pendiente"
  | "canaria"
  | "propagando"
  | "hecho"
  | "revirtiendo"
  | "revertido";

export type EventoDespliegue =
  | { tipo: "aplicada-en-canaria" }
  | { tipo: "humo"; ok: boolean }
  | { tipo: "propagada" }
  | { tipo: "revertida" };

export function siguienteEstado(e: EstadoDespliegue, ev: EventoDespliegue): EstadoDespliegue {
   switch (ev.tipo) {
     case "aplicada-en-canaria":
       if (e === "pendiente") return "canaria";
       break;
     case "humo":
       if (e === "canaria") {
         return ev.ok ? "propagando" : "revirtiendo";
       }
       break;
     case "propagada":
       if (e === "propagando") return "hecho";
       break;
     case "revertida":
       if (e === "revirtiendo") return "revertido";
       break;
   }
   return e;
 }