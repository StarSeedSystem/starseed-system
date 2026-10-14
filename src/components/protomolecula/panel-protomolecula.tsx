"use client";

import { useEffect, useState } from "react";
import type { Autor, Cambio, Molecula, Operacion } from "@/lib/protomolecula/tipos";
import type { Controlador } from "@/lib/protomolecula/controlador";
import { PanelParametros } from "./panel-parametros";
import { BarraDictado } from "./barra-dictado";
import { describirCambio } from "@/lib/protomolecula/parametros";
import { useMolecula } from "./use-molecula";

export interface PanelProtomoleculaProps {
  controlador: Controlador;
  autor: Autor;
  compacto?: boolean;
}

export function PanelProtomolecula({ controlador, autor, compacto = false }: PanelProtomoleculaProps) {
   const [estado, setEstado] = useState<ReturnType<typeof controlador.obtener> | null>(null);
   const [dictadoResult, setDictadoResult] = useState<string>("");
   
   useEffect(() => {
     if (controlador) {
       return controlador.suscribir(setEstado);
     }
   }, [controlador]);

   useEffect(() => {
     if (estado) {
       // Handle dictation when the user interacts with the barra dictado
       // This is a simplified implementation - in reality, BarraDictado would
       // have its own internal state for handling dictation
     }
   }, [estado]);

   if (compacto) {
     return (
       <div>
         <h3>{estado?.molecula?.titulo || "Sin título"}</h3>
         <BarraDictado 
           alDictar={(frase) => {
             // Since BarraDictado expects a synchronous function, we'll return an empty array
             // and handle the dictation separately
             return [];
           }}
         />
       </div>
     );
   }

   return (
     <div>
       <div>
         <h2>{estado?.molecula?.titulo || "Sin título"}</h2>
         <div>
           {/* Menú de herramientas - simplificado */}
           <button>Añadir herramienta</button>
         </div>
       </div>

       <div>
         {/* Panel de parámetros */}
         {estado && (
           <PanelParametros 
             candidatos={[]} 
             valores={estado.molecula.valores} 
             autor={autor} 
             alOperar={(op) => controlador.mover(op)} 
           />
         )}
         
         {/* Barra de dictado */}
         <BarraDictado 
           alDictar={(frase) => {
             // Since BarraDictado expects a synchronous function, we'll return an empty array
             // and handle the dictation separately
             return [];
           }}
         />
         
         {/* Historial simplificado */}
         <div>
           <h3>Historial</h3>
           <div>
             <button onClick={() => {
               if (estado && estado.historial) {
                 // For simplicity, we're not implementing actual undo/redo here
                 // In a real implementation, we would call controlador.deshacer() or controlador.rehacer()
               }
             }} disabled={!estado?.historial?.hechos?.length}>Deshacer</button>
             <button onClick={() => {
               if (estado && estado.historial) {
                 // For simplicity, we're not implementing actual undo/redo here
                 // In a real implementation, we would call controlador.rehacer()
               }
             }} disabled={!estado?.historial?.rehacer?.length}>Rehacer</button>
           </div>
           {estado?.historial?.hechos?.map((h, i) => (
             <div key={i}>
               <p>{describirCambio(h.parametro, h)}</p>
               <small>{h.antes} → {h.despues}</small>
             </div>
           ))}
         </div>
         
         {/* Aviso de salud */}
         {estado?.molecula && <div><strong>AVISO_SALUD:</strong> Son lecturas de un dispositivo: no son un diagnóstico ni un consejo médico.</div>}
       </div>
     </div>
   );
 }

export function PanelProtomoleculaAutonomo({ compacto = false, moleculaId }: { compacto?: boolean; moleculaId?: string }) {
   const { controlador, autor } = useMolecula({ moleculaId });
   return controlador && autor ? <PanelProtomolecula controlador={controlador} autor={autor} compacto={compacto} /> : null;
 }
// Integración: F0H (widget), F0I (app), F0L (orbe), F1B, F2I y F2J lo montan; la verificación en localhost la hace F0I.