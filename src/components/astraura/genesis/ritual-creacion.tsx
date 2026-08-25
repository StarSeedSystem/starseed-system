"use client";

/**
 * ritual-creacion.tsx — el ritual de creación (punto 2 del encargo).
 *
 * Deliberadamente ligero: nombre, rol, esencia, arquetipo, color y dos
 * decisiones de arranque (una carpeta propia, y si piensa solo con modelos
 * gratuitos). El resto del contrato — soberanía a fondo, enrutado completo,
 * habilidades, comunidades, espacio hogar… — se afina justo después en la
 * ficha, a la que este ritual navega en cuanto el ser nace.
 *
 * Cuando lo abre "Engendrar" desde una ficha, `progenitor` llega relleno:
 * usa `spawnGenesisSer` (POST .../{id}/engendrar) en vez de `createGenesisSer`.
 */
import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ENRUTADO_POR_DEFECTO, SOBERANIA_POR_DEFECTO, type Ser, type SolicitudGenesis } from "@/lib/astraura/genesis-types";
import { createGenesisSer, spawnGenesisSer, type GenesisTarget } from "@/lib/astraura/genesis-client";
import { Switch } from "@/components/ui/switch";
import { BTN, BTN_PRIMARY, BusyIcon, CARD, Field, INPUT, SectionTitle, useBusy } from "../s158/shared";
import { slugSuave, validarSolicitudGenesis } from "./genesis-logic";

const ARQUETIPOS_SUGERIDOS = ["aurora", "hermione", "atenea", "hephaestus", "hermes", "architectus", "mnemosyne", "oraculo"];

export interface RitualCreacionProps {
  target: GenesisTarget;
  progenitor?: { id: string; nombre: string } | null;
  onCreado: (ser: Ser) => void;
  onCancelar: () => void;
}

export function RitualCreacion({ target, progenitor, onCreado, onCancelar }: RitualCreacionProps) {
  const { busy, wrap } = useBusy();
  const [form, setForm] = useState({ nombre: "", rol: "", esencia: "", arquetipo: "", color: "" });
  const [carpetaPropia, setCarpetaPropia] = useState(true);
  const [soloGratuitos, setSoloGratuitos] = useState(true);
  const [errorLocal, setErrorLocal] = useState("");

  const slug = slugSuave(form.nombre, "ser");
  const carpeta = `/seres/${slug}`;

  const crear = () => {
    const solicitudBase: SolicitudGenesis = {
      nombre: form.nombre.trim(),
      rol: form.rol.trim() || undefined,
      esencia: form.esencia.trim() || undefined,
      arquetipo: form.arquetipo.trim() || undefined,
      color: form.color.trim() || undefined,
      soberania: { ...SOBERANIA_POR_DEFECTO, dominio: carpetaPropia ? [carpeta] : [] },
      enrutado: { ...ENRUTADO_POR_DEFECTO, soloGratuitos },
    };
    const invalido = validarSolicitudGenesis(solicitudBase);
    if (invalido) { setErrorLocal(invalido); return; }
    setErrorLocal("");
    void wrap("crear", async () => {
      const r = progenitor
        ? await spawnGenesisSer(target, progenitor.id, { nombre: solicitudBase.nombre, rol: solicitudBase.rol, esencia: solicitudBase.esencia, arquetipo: solicitudBase.arquetipo, color: solicitudBase.color, soberania: solicitudBase.soberania, enrutado: solicitudBase.enrutado })
        : await createGenesisSer(target, solicitudBase);
      if (!r.ok) { toast.error(`No se pudo invocar a ${solicitudBase.nombre}`, { description: r.error }); return; }
      toast.success(`${r.data.nombre} ha nacido`, { description: progenitor ? `engendrado por ${progenitor.nombre}` : "primera generación" });
      onCreado(r.data);
    });
  };

  return (
    <div className={cn(CARD, "p-3")}>
      <SectionTitle
        icon={Sparkles}
        title={progenitor ? `${progenitor.nombre} engendra un descendiente` : "Ritual de creación"}
        tone="text-fuchsia-300"
        hint="Lo esencial para invocarlo. La soberanía a fondo, el enrutado completo y todo lo demás se afinan en su ficha, justo después."
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Nombre" hint="Obligatorio.">
          <input className={INPUT} value={form.nombre} disabled={busy !== ""} aria-label="Nombre del nuevo ser" autoFocus
            onChange={(e) => setForm((v) => ({ ...v, nombre: e.target.value }))} />
        </Field>
        <Field label="Rol">
          <input className={INPUT} value={form.rol} disabled={busy !== ""} aria-label="Rol" placeholder="p. ej. jardinera de la biblioteca"
            onChange={(e) => setForm((v) => ({ ...v, rol: e.target.value }))} />
        </Field>
        <Field label="Esencia — cómo se describirá a sí mismo" className="sm:col-span-2">
          <input className={INPUT} value={form.esencia} disabled={busy !== ""} aria-label="Esencia" placeholder="una frase corta, en su voz"
            onChange={(e) => setForm((v) => ({ ...v, esencia: e.target.value }))} />
        </Field>
        <Field label="Arquetipo" hint="Decide su sólido base; libre — deja vacío para que salga de su nombre.">
          <input className={INPUT} value={form.arquetipo} disabled={busy !== ""} list="genesis-ritual-arquetipos" aria-label="Arquetipo"
            onChange={(e) => setForm((v) => ({ ...v, arquetipo: e.target.value }))} />
          <datalist id="genesis-ritual-arquetipos">
            {ARQUETIPOS_SUGERIDOS.map((a) => <option key={a} value={a} />)}
          </datalist>
        </Field>
        <Field label="Color" hint="Hexadecimal opcional, p. ej. #7dd3fc.">
          <div className="flex items-center gap-2">
            <input className={cn(INPUT, "flex-1")} value={form.color} disabled={busy !== ""} aria-label="Color" placeholder="#7dd3fc"
              onChange={(e) => setForm((v) => ({ ...v, color: e.target.value }))} />
            <span className="h-6 w-6 shrink-0 rounded-full border border-white/20" style={{ background: /^#?[0-9a-fA-F]{6}$/.test(form.color.trim()) ? form.color : "transparent" }} aria-hidden="true" />
          </div>
        </Field>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <Switch checked={carpetaPropia} disabled={busy !== ""} aria-label="Darle una carpeta propia" onCheckedChange={setCarpetaPropia} />
            Darle una carpeta propia
          </label>
          <p className="mt-1 text-[10px] leading-snug text-white/50">
            {carpetaPropia ? <>Su dominio inicial será <span className="font-code text-white/70">{carpeta}</span> — ahí escribe, edita y borra sin preguntar. Se puede ampliar luego en su ficha.</> : "Nace sin dominio propio: todo lo que quiera cambiar nacerá como propuesta hasta que le asignes uno en su ficha."}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <Switch checked={soloGratuitos} disabled={busy !== ""} aria-label="Pensar solo con modelos gratuitos" onCheckedChange={setSoloGratuitos} />
            Pensar solo con modelos gratuitos
          </label>
          <p className="mt-1 text-[10px] leading-snug text-white/50">Empieza con la escalera económica de siempre (gratis primero, local después). Se puede verificar y reordenar en su ficha en cuanto nazca.</p>
        </div>
      </div>

      {errorLocal && <p className="mt-2 text-[11px] text-rose-300" role="alert">{errorLocal}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !form.nombre.trim()} aria-label="Invocar al nuevo ser" onClick={crear}>
          <BusyIcon busy={busy === "crear"} icon={Wand2} /> {progenitor ? "Engendrar" : "Invocar"}
        </button>
        <button type="button" className={BTN} disabled={busy !== ""} aria-label="Cancelar el ritual" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

export default RitualCreacion;
