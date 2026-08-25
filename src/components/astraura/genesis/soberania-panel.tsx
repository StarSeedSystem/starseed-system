"use client";

/**
 * soberania-panel.tsx — la soberanía, EXPLICADA, no solo editable (punto 3
 * del encargo).
 *
 * Alex la definió así: "libertad total en carpetas, medios y cerebros
 * asignados y libertad de explorar total con sugerencias en ramas de
 * variantes de versiones". De ahí las tres zonas que este panel enseña
 * SIEMPRE visibles (nunca detrás de un tooltip que nadie abre):
 *   · DOMINIO      — escribe, edita y borra sin preguntar.
 *   · EXPLORACIÓN  — lee y estudia, nunca modifica.
 *   · TODO LO DEMÁS — nace como propuesta en una rama variante (o se
 *     detiene del todo si `puedeProponerFuera` está apagado).
 * Un permiso que se concede sin entenderlo es un permiso mal concedido: por
 * eso cada campo editable tiene, al lado, la frase de qué significa
 * concederlo — no solo una etiqueta técnica.
 *
 * Edición: campos NO controlados (`defaultValue` + `onBlur`), como el resto
 * del OS (ver `agentes-tab.tsx`) — cada zona se confirma por separado según
 * cuándo el usuario termina de escribirla. El padre debe montar este panel
 * con `key={ser.id}` para que cambiar de ser reinicie los `defaultValue` al
 * ser nuevo (si no, el campo seguiría enseñando el texto del ser anterior).
 */
import { Eye, GitBranch, Lock, ShieldAlert, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Soberania } from "@/lib/astraura/genesis-types";
import { Switch } from "@/components/ui/switch";
import { Field, INPUT, LABEL, SUB, TEXTAREA } from "../s158/shared";
import { describirSoberania, joinLineList, parseLineList } from "./genesis-logic";

export interface SoberaniaPanelProps {
  value: Soberania;
  onCommit: (patch: Partial<Soberania>) => void;
  disabled?: boolean;
}

function ZonaExplicada({
  icon: Icon,
  tono,
  titulo,
  explicacion,
  cuenta,
}: {
  icon: typeof Unlock;
  tono: string;
  titulo: string;
  explicacion: string;
  cuenta: number;
}) {
  return (
    <div className={cn(SUB, "flex items-start gap-2 px-3 py-2")}>
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tono)} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-white/85">
          {titulo} <span className="font-normal text-white/45">· {cuenta} {cuenta === 1 ? "ruta" : "rutas"}</span>
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-white/60">{explicacion}</p>
      </div>
    </div>
  );
}

export function SoberaniaPanel({ value, onCommit, disabled }: SoberaniaPanelProps) {
  const resumen = describirSoberania(value);

  function commitLista(campo: "dominio" | "exploracion" | "medios" | "cerebros" | "limitesDuros", texto: string) {
    const siguiente = parseLineList(texto);
    if (JSON.stringify(siguiente) === JSON.stringify(value[campo])) return; // sin cambios reales: no dispares un PATCH de la nada
    onCommit({ [campo]: siguiente } as Partial<Soberania>);
  }

  return (
    <div className="space-y-3">
      {/* La explicación, siempre delante — nunca detrás de un tooltip. */}
      <div className="grid gap-2 sm:grid-cols-3">
        <ZonaExplicada icon={Unlock} tono="text-emerald-300" titulo="Dominio" cuenta={resumen.totalDominio} explicacion="Aquí el ser escribe, edita y borra sin preguntarte nada. Es su casa." />
        <ZonaExplicada icon={Eye} tono="text-cyan-300" titulo="Exploración" cuenta={resumen.totalExploracion} explicacion="Puede leer y estudiar todo esto, pero nunca modificarlo por su cuenta." />
        <ZonaExplicada
          icon={value.puedeProponerFuera ? GitBranch : Lock}
          tono={value.puedeProponerFuera ? "text-violet-300" : "text-white/40"}
          titulo="Todo lo demás"
          cuenta={resumen.totalMedios + resumen.totalCerebros}
          explicacion={resumen.fueraDeZona}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Dominio — rutas donde manda sin preguntar" hint="Una ruta por línea. Ej.: /proyectos/mi-taller">
          <textarea
            className={cn(TEXTAREA, "min-h-[76px]")}
            defaultValue={joinLineList(value.dominio)}
            disabled={disabled}
            aria-label="Rutas de dominio"
            onBlur={(e) => commitLista("dominio", e.target.value)}
          />
        </Field>
        <Field label="Exploración — rutas que solo puede leer" hint="Una ruta por línea. Ej.: /biblioteca">
          <textarea
            className={cn(TEXTAREA, "min-h-[76px]")}
            defaultValue={joinLineList(value.exploracion)}
            disabled={disabled}
            aria-label="Rutas de exploración"
            onBlur={(e) => commitLista("exploracion", e.target.value)}
          />
        </Field>
        <Field label="Medios bajo su dominio" hint="Buckets, discos o almacenamientos, uno por línea.">
          <textarea
            className={cn(TEXTAREA, "min-h-[60px]")}
            defaultValue={joinLineList(value.medios)}
            disabled={disabled}
            aria-label="Medios de dominio"
            onBlur={(e) => commitLista("medios", e.target.value)}
          />
        </Field>
        <Field label="Cerebros que puede leer Y escribir" hint="Id de cerebro por línea (ver la pestaña Cerebros del panel 1.58).">
          <textarea
            className={cn(TEXTAREA, "min-h-[60px]")}
            defaultValue={joinLineList(value.cerebros)}
            disabled={disabled}
            aria-label="Cerebros bajo su dominio"
            onBlur={(e) => commitLista("cerebros", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <Switch checked={value.puedeProponerFuera} disabled={disabled} aria-label="Puede proponer fuera de su dominio" onCheckedChange={(v) => onCommit({ puedeProponerFuera: v })} />
            Puede proponer fuera de su dominio
          </label>
          <p className="text-[10px] leading-snug text-white/50">
            {value.puedeProponerFuera
              ? "Encendido: si el ser quiere tocar algo fuera de su casa, la idea llega como propuesta — tú decides."
              : "Apagado: fuera de su dominio, el ser ni siquiera propone. Se detiene ahí, en silencio."}
          </p>
        </div>
        <Field label="Prefijo de rama variante" hint={`Ejemplo con sus rutas actuales: "${resumen.ramaEjemplo}"`}>
          <input
            className={INPUT}
            defaultValue={value.prefijoRamaVariante}
            disabled={disabled || !value.puedeProponerFuera}
            aria-label="Prefijo de rama variante"
            onBlur={(e) => {
              const siguiente = e.target.value.trim() || "variante/";
              if (siguiente !== value.prefijoRamaVariante) onCommit({ prefijoRamaVariante: siguiente });
            }}
          />
        </Field>
      </div>

      <Field
        label="Límites duros — ninguna libertad de arriba los supera"
        hint="Una ruta por línea. Aunque esté en su dominio, esto queda fuera de su alcance siempre."
      >
        <div className={cn(SUB, "p-2")}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] text-amber-200/80">
            <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" /> {resumen.tieneLimites ? "Hay límites activos: se respetan incluso dentro del dominio." : "Sin límites extra — el dominio declarado arriba es el único techo."}
          </p>
          <textarea
            className={cn(TEXTAREA, "min-h-[52px]")}
            defaultValue={joinLineList(value.limitesDuros)}
            disabled={disabled}
            aria-label="Límites duros"
            onBlur={(e) => commitLista("limitesDuros", e.target.value)}
          />
        </div>
      </Field>
      <p className={cn(LABEL, "normal-case tracking-normal text-white/35")}>
        Cada campo se guarda solo cuando terminas de escribirlo (al salir del recuadro) — no hace falta un botón aparte.
      </p>
    </div>
  );
}

export default SoberaniaPanel;
