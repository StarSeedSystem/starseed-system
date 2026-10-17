"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/utils/supabase/client";
import { Bot, RolBot, CambioBot, decidirConfiguracion } from "@/lib/astraura-bots/permisos";
import { toast } from "sonner";

interface Props {
  entidadId: string;
  entidadTipo: "grupo" | "pagina" | "comunidad";
  usuarioRol: RolBot;
  entidadGobierno: "democratico" | "jerarquico" | null;
}

export function BotsEntidad({
  entidadId,
  entidadTipo,
  usuarioRol,
  entidadGobierno,
}: Props) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBots = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from("astraura_bots")
          .select("*")
          .eq("dueno_tipo", entidadTipo)
          .eq("dueno_id", entidadId);

        if (err) throw err;
        setBots(data ?? []);
      } catch (e) {
        console.error("Error fetching bots:", e);
        setError("No se pudieron cargar los bots de la entidad.");
        toast.error("Error al cargar los bots");
      } finally {
        setLoading(false);
      }
    };

    void fetchBots();
  }, [entidadId, entidadTipo]);

  if (loading) return <p>Cargando bots...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (bots.length === 0) return <p>Esta entidad no tiene bots asociados.</p>;

   return (
     <div>
       {bots.map((bot) => (
         <div key={bot.id} className="border p-4 mb-4 rounded-lg">
           <h3 className="font-semibold mb-2">{bot.nombre}</h3>
           <p className="text-sm text-gray-500 mb-2">
             Gobierno: {entidadGobierno === "democratico" ? "Democrático" : entidadGobierno === "jerarquico" ? "Jerárquico" : "Cargando..."}
           </p>
           {/* Configuration options for each bot */}
           <div className="space-y-2">
             {Object.values(CambioBot).map((cambio) => {
               const decision = decidirConfiguracion(bot, usuarioRol, cambio as CambioBot);
               return (
                 <div key={cambio} className="flex items-start gap-3">
                   <span className="w-20 text-[12px]">{cambio}:</span>
                   <span className="flex-1">
                     {decision.permitido ? (
                       <Button
                         variant="outline"
                         size="xs"
                         className="w-full justify-start"
                         onClick={() => {
                           // Apply the change using bot.configurar
                           // For now, we just show a toast
                           toast.success(`Aplicado: ${cambio}`);
                         }}
                       >
                         Aplicar
                       </Button>
                     ) : decision.requiere === "votacion" ? (
                       <Button
                         variant="outline"
                         size="xs"
                         className="w-full justify-start"
                         onClick={() => {
                           // Proponer al grupo
                           toast.info(`Propuesto al grupo: ${cambio}`);
                         }}
                       >
                         Proponer al grupo
                       </Button>
                     ) : decision.requiere === "confirmacion" ? (
                       <Button
                         variant="outline"
                         size="xs"
                         className="w-full justify-start"
                         onClick={() => {
                           // Pedir a un administrador
                           toast.info(`Se requiere confirmación de un administrador para: ${cambio}`);
                         }}
                       >
                         Pedir a un administrador
                       </Button>
                     ) : (
                       <span className="text-red-500 text-[12px]">{decision.motivo}</span>
                     )}
                   </span>
                 </div>
               );
             })}
             {/* Delegar en el bot (riesgo bajo) como propuesta votable */}
             <div className="flex items-start gap-3 mt-2 pt-2 border-t">
               <span className="w-20 text-[12px]">Delegar en el bot (riesgo bajo):</span>
               <span className="flex-1">
                 {entidadGobierno === "democratico" ? (
                   <Button
                     variant="outline"
                     size="xs"
                     className="w-full justify-start"
                     onClick={() => {
                       // Proponer la delegación al grupo
                       toast.info("Propuesta: Delegar en el bot (riesgo bajo)");
                     }}
                   >
                     Proponer al grupo
                   </Button>
                 ) : usuarioRol === "dueno" || usuarioRol === "admin" ? (
                   <Button
                     variant="outline"
                     size="xs"
                     className="w-full justify-start"
                     onClick={() => {
                       // El admin/dueno puede delegar directamente? Pero según el gobierno jerárquico, el admin puede aplicar.
                       // Sin embargo, la delegación es un concepto de gobierno democrático.
                       // En gobierno jerárquico, el admin ya puede aplicar acciones de riesgo bajo sin votar.
                       // Entonces, no necesitamos proponer delegación.
                       toast.info("En gobierno jerárquico, el admin ya puede aplicar acciones de riesgo bajo.");
                     }}
                   >
                     Ya delegado (admin/dueno)
                   </Button>
                 ) : (
                   <Button
                     variant="outline"
                     size="xs"
                     className="w-full justify-start"
                     onClick={() => {
                       toast.info("Solo admins o dueños pueden gestionar la delegación.");
                     }}
                   >
                     No autorizado
                   </Button>
                 )}
               </span>
             </div>
             {/* Siempre visible para miembros: Pausar el bot común */}
             {usuarioRol === "miembro" && (
               <div className="mt-4">
                 <Button
                   variant="destructive"
                   size="xs"
                   className="w-full"
                   onClick={() => {
                     if (window.confirm("¿Estás seguro de que quieres pausar el bot común?")) {
                       // TODO: Actualizar el bot para poner activo: false
                       toast.success("Bot común pausado");
                     }
                   }}
                 >
                   Pausar el bot común
                 </Button>
               </div>
             )}
           </div>
         </div>
       ))}
     </div>
   );
}