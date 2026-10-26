"use client";
/**
 * Pestaña «Percepción» de la ficha (Ola 1025U · U2): los filtros con los que el agente mira y responde.
 * Deslizadores de rasgos (curiosidad, empatía, escepticismo, humor, foco temático), temas de su foco y sentidos
 * (nunca los íntimos: esos piden el consentimiento de cada persona en el panel del bot). La vista previa es el
 * fragmento REAL que `filtroAPrompt` entrega al modelo.
 */
import { useState } from "react";
import { Eye, Plus, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { NOMBRE_SENTIDO } from "@/components/astraura-bots/sentidos-ui";
import {
  MAX_LARGO_TEMA, MAX_TEMAS, PRESETS_PERCEPCION, RASGOS_PERCEPCION, SENTIDOS_DE_PERCEPCION, ETIQUETA_RASGO, filtroAPrompt, rasgosEfectivos, sanearTema,
  type ConfigAgente, type RasgoPercepcion,
} from "@/lib/avatares/agente/config-agente";
import { Aviso, Bloque, BotonFicha, CLASE_CAMPO, Deslizador, FilaInterruptor, num } from "./ui-ficha";

export interface TabPercepcionProps {
  config: ConfigAgente;
  actualizar: (cambio: (c: ConfigAgente) => ConfigAgente) => void;
}

export function TabPercepcion({ config, actualizar }: TabPercepcionProps) {
  const { percepcion } = config;
  const [tema, setTema] = useState("");
  const [error, setError] = useState<string | null>(null);
  const efectivos = rasgosEfectivos(config);

  const ponerRasgo = (rasgo: RasgoPercepcion, v: number) =>
    actualizar((c) => ({ ...c, percepcion: { ...c.percepcion, rasgos: { ...c.percepcion.rasgos, [rasgo]: Math.max(0, Math.min(1, Math.round(v * 100) / 100)) } } }));

  const anadirTema = () => {
    const limpio = sanearTema(tema);
    if (!limpio) return setError("Escribe un tema.");
    if (percepcion.temas.some((t) => t.toLowerCase() === limpio.toLowerCase())) return setError("Ese tema ya está.");
    if (percepcion.temas.length >= MAX_TEMAS) return setError(`Como mucho ${MAX_TEMAS} temas.`);
    setError(null);
    setTema("");
    actualizar((c) => ({ ...c, percepcion: { ...c.percepcion, temas: [...c.percepcion.temas, limpio] } }));
  };

  return (
    <div className="space-y-3">
      <Bloque
        icono={SlidersHorizontal}
        titulo="Cómo mira y responde"
        estado="ficha"
        ayuda="Estos son los valores que fijas tú. La experiencia puede moverlos un poco con el tiempo (lo ves en Identidad → Desarrollo), pero nunca cambia lo que pones aquí."
      >
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Formas de ser de partida">
          {PRESETS_PERCEPCION.map((p) => (
            <BotonFicha key={p.id} icono={Sparkles} title={p.descripcion} onClick={() => actualizar((c) => ({ ...c, percepcion: { ...c.percepcion, rasgos: { ...p.rasgos } } }))}>
              {p.nombre}
            </BotonFicha>
          ))}
        </div>
        {RASGOS_PERCEPCION.map((r) => {
          const d = config.desarrollo.deriva[r] ?? 0;
          return (
            <Deslizador
              key={r}
              id={`rasgo-${r}`}
              etiqueta={ETIQUETA_RASGO[r].nombre}
              ayuda={d !== 0 ? `${ETIQUETA_RASGO[r].ayuda} Hoy mira con ${num(efectivos[r])} por la experiencia.` : ETIQUETA_RASGO[r].ayuda}
              valor={percepcion.rasgos[r]}
              alCambiar={(v) => ponerRasgo(r, v)}
              formato={num}
            />
          );
        })}
      </Bloque>

      <Bloque icono={Plus} titulo="Foco temático" estado="ficha" ayuda={`De qué le gusta hablar (hasta ${MAX_TEMAS} temas). Cuanto más alto el foco, más se ciñe a ellos.`}>
        {percepcion.temas.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Temas">
            {percepcion.temas.map((t) => (
              <li key={t} className="inline-flex min-h-[44px] max-w-full items-center gap-1 rounded-full border border-white/15 bg-white/5 pl-3">
                <span className="min-w-0 break-words text-sm text-foreground">{t}</span>
                <BotonFicha
                  icono={X}
                  aria-label={`Quitar el tema ${t}`}
                  className="rounded-full border-transparent px-2"
                  onClick={() => actualizar((c) => ({ ...c, percepcion: { ...c.percepcion, temas: c.percepcion.temas.filter((x) => x !== t) } }))}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex min-w-0 gap-2">
          <label htmlFor="tema-nuevo" className="sr-only">Nuevo tema</label>
          <input
            id="tema-nuevo"
            className={CLASE_CAMPO}
            placeholder="Un tema (por ejemplo, huertos urbanos)"
            maxLength={MAX_LARGO_TEMA}
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); anadirTema(); } }}
          />
          <BotonFicha variante="primario" icono={Plus} onClick={anadirTema} className="shrink-0">Añadir</BotonFicha>
        </div>
        {error && <div className="mt-2"><Aviso tono="error">{error}</Aviso></div>}
      </Bloque>

      <Bloque
        icono={Eye}
        titulo="Sentidos"
        estado="ficha"
        ayuda="Lo que el agente atiende. Los sentidos íntimos (cámara, micrófono, correo, ubicación…) no están aquí: cada persona los consiente aparte, en el panel del bot."
      >
        {SENTIDOS_DE_PERCEPCION.map((s) => (
          <FilaInterruptor
            key={s}
            id={`sentido-${s}`}
            etiqueta={NOMBRE_SENTIDO[s].charAt(0).toUpperCase() + NOMBRE_SENTIDO[s].slice(1)}
            marcado={percepcion.sentidos.includes(s)}
            alCambiar={(v) =>
              actualizar((c) => ({
                ...c,
                percepcion: { ...c.percepcion, sentidos: SENTIDOS_DE_PERCEPCION.filter((x) => (x === s ? v : c.percepcion.sentidos.includes(x))) },
              }))
            }
          />
        ))}
      </Bloque>

      <Bloque icono={Sparkles} titulo="Así se lo cuenta al modelo" ayuda="Es el texto exacto del filtro. Siempre acaba igual: ningún rasgo, a ningún valor, apaga los límites honestos.">
        <pre data-testid="vista-previa-filtro" className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs leading-relaxed text-foreground/90">
          {filtroAPrompt(config)}
        </pre>
      </Bloque>
    </div>
  );
}
