import { useEffect } from "react";
import { registrarEntradaMenuTexto } from "@/lib/menu/registro";
import { capturarSeleccionEditable } from "@/lib/editor/seleccion";
import { puedeLibreTranslate, nombreMotor, crearTraductor } from "@/components/traduccion/traducir-texto";
import { leerPreferencias } from "@/utils/preferencias";

export function MontajeIdioma() {
  useEffect(() => {
    registrarEntradaMenuTexto({
      id: "reemplazar-traduccion",
      titulo: "Reemplazar por la traducción",
      accion: async (ctx) => {
        if (!ctx.editable) return;
        const seleccion = capturarSeleccionEditable();
        if (!seleccion) return;

        const prefs = await leerPreferencias();
        const traductor = crearTraductor({ privado: false });
        
        try {
          const resultado = await traductor.traducir(seleccion.texto, prefs.idioma);
          ctx.editable.reemplazar(seleccion.rango, resultado);
          // TODO: Implementar aviso con "Deshacer"
        } catch (e) {
          console.error("Error al traducir:", e);
        }
      },
    });
  }, []);

  return null;
}

// montar junto a <TraducirTexto /> en src/app/(app)/app-globals.tsx
