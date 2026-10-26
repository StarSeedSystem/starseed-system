"use client";
/**
 * Pestaña «Herramientas» de la ficha (Ola 1025U · U2): las familias de herramientas y las habilidades de la Biblioteca
 * que este agente puede usar. Solo se ofrecen las que existen (el manifiesto de capacidades de Astraura y las familias
 * de herramientas de las personalidades). «Todas» es el valor por defecto: lo que se añada más adelante entra solo.
 * Los módulos grandes se cargan al abrir la pestaña, no antes.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Library, Wrench } from "lucide-react";
import {
  alternarFamilia, alternarHabilidad, alternarTodasFamilias, alternarTodasHabilidades, depurarHerramientas, familiaElegida, habilidadElegida,
  todasLasFamilias, todasLasHabilidades, type ConfigAgente,
} from "@/lib/avatares/agente/config-agente";
import { Aviso, Bloque, FilaInterruptor } from "./ui-ficha";

export interface TabHerramientasProps {
  config: ConfigAgente;
  actualizar: (cambio: (c: ConfigAgente) => ConfigAgente) => void;
}

interface Existentes {
  familias: Array<{ id: string; label: string }>;
  habilidades: Array<{ id: string; label: string; activa: boolean }>;
}

export function TabHerramientas({ config, actualizar }: TabHerramientasProps) {
  const [existentes, setExistentes] = useState<Existentes | null>(null);
  const [error, setError] = useState(false);
  const { herramientas } = config;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [pers, skills] = await Promise.all([import("@/lib/aurora/personalities"), import("@/ai/astraura/skills")]);
        let activas = new Set<string>();
        try { activas = new Set(skills.activeCapabilityIds()); } catch { /* sin almacén: se muestran sin marcar */ }
        if (!vivo) return;
        setExistentes({
          familias: pers.PERSONALITY_TOOL_KINDS.map((k) => ({ id: k.id, label: k.label })),
          habilidades: skills.SKILL_CAPABILITIES.map((c) => ({ id: c.id, label: c.label, activa: activas.has(c.id) })),
        });
      } catch {
        if (vivo) setError(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const idsFamilias = useMemo(() => existentes?.familias.map((f) => f.id) ?? [], [existentes]);
  const idsHabilidades = useMemo(() => existentes?.habilidades.map((h) => h.id) ?? [], [existentes]);

  // Lo guardado que ya no existe en la Biblioteca se quita al abrir la pestaña (y solo si de verdad cambia algo).
  useEffect(() => {
    if (!existentes) return;
    const limpio = depurarHerramientas(herramientas, { familias: idsFamilias, habilidades: idsHabilidades });
    if (JSON.stringify(limpio) !== JSON.stringify(herramientas)) actualizar((c) => ({ ...c, herramientas: limpio }));
  }, [existentes, herramientas, idsFamilias, idsHabilidades, actualizar]);

  return (
    <div className="space-y-3">
      {error && <Aviso tono="error">No se pudo cargar la lista de herramientas. Cierra y vuelve a abrir la ficha.</Aviso>}
      {!existentes && !error && <p role="status" className="text-xs text-muted-foreground">Cargando herramientas…</p>}

      {existentes && (
        <>
          <Bloque
            icono={Wrench}
            titulo="Familias de herramientas"
            estado="ficha"
            ayuda="Qué tipos de herramientas puede usar. «Todas» incluye también las que se añadan más adelante."
          >
            <FilaInterruptor
              id="herr-familias-todas"
              etiqueta="Todas"
              marcado={todasLasFamilias(herramientas, idsFamilias)}
              alCambiar={() => actualizar((c) => ({ ...c, herramientas: alternarTodasFamilias(c.herramientas, idsFamilias) }))}
            />
            {existentes.familias.map((f) => (
              <FilaInterruptor
                key={f.id}
                id={`herr-familia-${f.id}`}
                etiqueta={f.label}
                marcado={familiaElegida(herramientas, f.id)}
                alCambiar={() => actualizar((c) => ({ ...c, herramientas: alternarFamilia(c.herramientas, idsFamilias, f.id) }))}
              />
            ))}
          </Bloque>

          <Bloque
            icono={Library}
            titulo="Habilidades de la Biblioteca"
            estado="ficha"
            ayuda={
              <>
                Las capacidades que existen en la Biblioteca de StarSeed. Una habilidad elegida solo funciona si está activa en tu Biblioteca;
                las que no lo están lo dicen. Instálalas en <Link href="/library" className="cursor-pointer underline underline-offset-2">Biblioteca</Link>.
              </>
            }
          >
            <FilaInterruptor
              id="herr-habilidades-todas"
              etiqueta="Todas"
              marcado={todasLasHabilidades(herramientas, idsHabilidades)}
              alCambiar={() => actualizar((c) => ({ ...c, herramientas: alternarTodasHabilidades(c.herramientas, idsHabilidades) }))}
            />
            {existentes.habilidades.map((h) => (
              <FilaInterruptor
                key={h.id}
                id={`herr-habilidad-${h.id}`}
                etiqueta={h.label}
                ayuda={h.activa ? "Activa en tu Biblioteca." : "No está activa en tu Biblioteca."}
                marcado={habilidadElegida(herramientas, h.id)}
                alCambiar={() => actualizar((c) => ({ ...c, herramientas: alternarHabilidad(c.herramientas, idsHabilidades, h.id) }))}
              />
            ))}
          </Bloque>
        </>
      )}
    </div>
  );
}
