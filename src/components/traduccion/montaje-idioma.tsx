import { useEffect } from "react";
import { useAccount } from "@/context/account-context";
import { registrarEntradaMenuTexto } from "@/components/traduccion/menu-texto";
import { capturarSeleccionEditable, reemplazar } from "@/components/traduccion/reemplazar-seleccion";
import { crearMotores } from "@/components/traduccion/traducir-texto";
import { crearTraductor } from "@/lib/traduccion/motor";
import { leer as leerPreferencias } from "@/lib/traduccion/preferencias";

export function MontajeIdioma() {
  const { user } = useAccount();
  useEffect(() => {
    registrarEntradaMenuTexto({
      id: "reemplazar-traduccion",
      etiqueta: "Reemplazar por la traducción",
      visible: (c: any) => Boolean(c.seleccionEditable),
      ejecutar: async (c: any) => {
        if (!c.seleccionEditable) return;
        const seleccion = c.seleccionEditable;

        const motores = () => crearMotores({ protocolo: location.protocol, maquina: location.hostname, translator: (window as { Translator?: unknown }).Translator });
        const prefs = await leerPreferencias(user?.id ?? "", typeof navigator === "undefined" ? undefined : navigator.language);
        const traductor = crearTraductor(motores());
        
        try {
          const [r] = await traductor.traducir([seleccion.texto], "auto", prefs.idioma);
          reemplazar(seleccion, r.texto);
          // TODO: Implementar aviso con "Deshacer"
        } catch (e) {
          console.error("Error al traducir:", e);
        }
      },
    });
  }, [user?.id]);

  return null;
}

// montar junto a <TraducirTexto /> en src/app/(app)/app-globals.tsx
