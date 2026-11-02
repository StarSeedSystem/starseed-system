"use client";
/**
 * Avatares 3D · EDITOR DEL AVATAR (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3 y §12.
 *
 * Panel en tiempo real: morfología (8 deslizadores), color por ranura, piezas por ranura, expresiones,
 * aura, carácter del movimiento y visibilidad; más voz y texto (dictado del OS + Astraura para lo que
 * no se entendió) y MIDI (mapeo de la Protomolécula, o Web MIDI con permiso explícito). Toda entrada
 * produce el MISMO `CambioAvatar`: el estado y los ritmos viven en `useEditorAvatar` (use-editor-avatar.ts).
 *
 * Honestidad: la Biblioteca aún no guarda piezas de avatar (tipo de ítem «avatar», pendiente, §12): se
 * dice ahí mismo. Sin Web MIDI, sin dictado o sin modelo, también se dice el motivo y nada se finge.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Ear, Eraser, Mic, RotateCcw, Save, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { startDictation, isDictationSupported } from "@/lib/aurora/dictation";
import { hayMidi, pedirAccesoMidi, conectarMidi } from "@/lib/protomolecula/adaptador-midi";
import { EXPRESIONES, MORFOLOGIA, SLOTS_MATERIAL, SLOTS_PIEZA, VISIBILIDADES, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { chat } from "@/ai/client/chat";
import { saveAdnToLibrary } from "@/lib/avatares/adaptadores/almacen-adn";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import {
  useEditorAvatar, EMOCIONES, ETIQUETAS_EXPRESION, ETIQUETAS_MATERIAL, ETIQUETAS_MORFOLOGIA,
  ETIQUETAS_MOVIMIENTO, ETIQUETAS_PIEZA, CONTROLES_MIDI, etiquetaControl,
  type ClaveControl,
} from "@/lib/avatares/adaptadores/use-editor-avatar";
import type { CambioAvatar } from "@/lib/avatares/adn/cambios";
import type { Vinculo } from "@/lib/protomolecula/vinculos-control";

export interface EditorAvatarProps {
  /** El ADN que entra al editor (el de la Biblioteca para este dueño); el editor lo lleva de aquí en adelante. */
  adn: AdnAvatar;
  /** Almacén de AV1011D; por defecto `saveAdnToLibrary`. */
  guardar?: (adn: AdnAvatar) => Promise<unknown> | unknown;
  /** Canal de la escena compartida: los lotes de cambios para las demás personas. */
  emitir?: (cambios: CambioAvatar[]) => void;
  otrosPresentes?: () => number;
  /** Vínculos MIDI ya aprendidos por la Protomolécula: si traen deslizadores del avatar, se usan. */
  vinculosProtomolecula?: readonly Vinculo[];
  /** Modelo que traduce lo que el dictado no entendió (Astraura). Omitido = se dice que no hay modelo. */
  pedirAstraura?: (instruccion: string) => Promise<unknown>;
  /** Avisa con el ADN en curso después de cada cambio aplicado. */
  onAdn?: (adn: AdnAvatar) => void;
}

/** Deslizador 0…1 con etiqueta y valor en porcentaje: teclado accesible y suave a la vez. */
function Deslizador({ etiqueta, valor, alMover }: { etiqueta: string; valor?: number; alMover: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0">{etiqueta}</span>
      <Slider
        className="cursor-pointer transition-all"
        aria-label={etiqueta}
        value={[valor ?? 0.5]}
        min={0} max={1} step={0.01}
        getAriaValueText={(v) => `${Math.round(v * 100)} %`}
        onValueChange={(v) => alMover(v[0])}
      />
      <span className="w-10 text-right tabular-nums text-muted-foreground">{Math.round((valor ?? 0.5) * 100)}</span>
    </label>
  );
}

const ARRIBA = "cursor-pointer transition-all duration-150";

export default function EditorAvatar(props: EditorAvatarProps) {
  const { adn, emitir, otrosPresentes, vinculosProtomolecula, onAdn } = props;
  const guardarRef = useRef(props.guardar);
  guardarRef.current = props.guardar;
  const pedirAstrauraRef = useRef(props.pedirAstraura);
  pedirAstrauraRef.current = props.pedirAstraura;
  const onAdnRef = useRef(props.onAdn);
  onAdnRef.current = props.onAdn;
  const [cargandoModelo, setCargandoModelo] = useState(false);

  /** Sin modelo declarado: se intenta por el relé comunitario de OpenRouter (SOLAMENTE modelos :free). */
  const pedirAstraura = useCallback(async (instruccion: string): Promise<unknown> => {
    setCargandoModelo(true);
    try {
      const res = await chat({
        messages: [
          { role: "system", content: "Eres una utilidad. Solo devuelves la lista JSON pedida, sin texto de más." },
          { role: "user", content: instruccion },
        ],
        providerOverride: { providerId: "openai-compatible", baseUrl: "/api/ai/openrouter", model: "openrouter/free" },
        temperature: 0.2,
        maxTokens: 600,
      });
      return res.text?.trim() || null;
    } catch {
      return null;
    } finally {
      setCargandoModelo(false);
    }
  }, []);

  const ed = useEditorAvatar(adn, {
    guardar: guardarRef.current
      ? (a) => guardarRef.current(a)
      : (a) => saveAdnToLibrary(a, a.visibilidad),
    emitir,
    otrosPresentes,
    pedirAstraura: pedirAstrauraRef.current ? pedirAstraura : undefined,
    vinculosProtomolecula,
  });

  useEffect(() => ed.suscribir(() => { onAdnRef.current?.(ed.estado().adn); }), [ed]);
  useEffect(() => { const parar = () => { void ed.cerrar(); }; return parar; }, [ed]);

  /* ── Voz: dictado de rellenar campo del OS; lo entendido se aplica al instante ── */
  const [frase, setFrase] = useState("");
  const [escuchando, setEscuchando] = useState(false);
  const [dictadoOk, setDictadoOk] = useState(true);
  const escuchar = () => {
    setDictadoOk(true);
    setEscuchando(true);
    startDictation({
      onInterim: setFrase,
      onFinal: (t) => { setFrase(t); ed.dictar(t); },
      onEnd: () => setEscuchando(false),
      onError: () => { setEscuchando(false); setDictadoOk(false); },
    });
  };

  /* ── MIDI: la Protomolécula primero; si no, Web MIDI con permiso explícito ── */
  const [claveMidi, setClaveMidi] = useState<ClaveControl>("morfologia:altura");
  const [midiAbierto, setMidiAbierto] = useState(false);
  const [midiTexto, setMidiTexto] = useState("");
  const [aprendiendo, setAprendiendo] = useState(false);
  const aprendiendoRef = useRef(false);
  const claveRef = useRef(claveMidi);
  claveRef.current = claveMidi;

  const abrirMidi = useCallback(async () => {
    if (!hayMidi(navigator)) { setMidiTexto("Este navegador no ofrece MIDI: el editor sigue funcionando con el ratón y el teclado."); return; }
    const r = await pedirAccesoMidi(navigator);
    if (!r.ok) { setMidiTexto(r.motivo); return; }
    setMidiTexto("Mando MIDI conectado: mueve un control y mueve su deslizador.");
    conectarMidi(
      r.acceso,
      (m) => {
        if (m.fuente.mensaje !== "cc" || m.fuente.numero === undefined) return;
        if (aprendiendoRef.current) {
          ed.fijaMidi(m.fuente.numero, claveRef.current);
          aprendiendoRef.current = false;
          setAprendiendo(false);
          setMidiTexto(`CC ${m.fuente.numero} ligado a ${etiquetaControl(claveRef.current)}.`);
        } else { ed.midi(m.fuente.numero, m.bruto); setMidiTexto(`CC ${m.fuente.numero}: ${Math.round((m.bruto / 127) * 100)} %`); }
      },
      (nombres) => { if (nombres.length) setMidiTexto(`Mandos MIDI: ${nombres.join(", ")}`); },
    );
  }, [ed]);

  const e = ed.estado();
  const adnActivo = e.adn;
  const guardarAhora = async () => { await ed.cerrar(); };

  return (
    <div className="space-y-4" aria-label="Editor del avatar en tiempo real">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Editor del avatar</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Deshacer el último cambio" disabled={!e.puedeDeshacer} onClick={() => ed.deshacer()} className={ARRIBA}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" aria-label="Rehacer el cambio deshecho" disabled={!e.puedeRehacer} onClick={() => ed.rehacer()} className={ARRIBA}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={guardarAhora} disabled={!e.sinGuardar || e.guardando} className={ARRIBA}>
            <Save className="h-4 w-4" /> {e.guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {e.nota ?? (e.sinGuardar ? "Cambios sin guardar: se guardan con 5 s de calma." : "Guardado.")}
        </span>
        <Badge variant="secondary">revisión {adnActivo.rev}</Badge>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mx-auto mb-3 aspect-square max-w-[220px]">
          <AvatarVivo adn={adnActivo} tamano={220} />
        </div>
        <p className="text-center text-xs text-muted-foreground">Lo que ves en tu pantalla se ve al momento; a las demás personas les llega agrupado y solo si están mirando.</p>
      </div>

      <section aria-label="Morfología" className="space-y-2">
        <h4 className="text-sm font-medium">Morfología</h4>
        {MORFOLOGIA.map((k) => (
          <Deslizador key={k} etiqueta={ETIQUETAS_MORFOLOGIA[k]} valor={adnActivo.morfologia[k]} alMover={(v) => ed.aplicar({ op: "morfologia", clave: k, valor: v })} />
        ))}
      </section>

      <section aria-label="Color por ranura" className="space-y-2">
        <h4 className="text-sm font-medium">Colores</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SLOTS_MATERIAL.map((s) => (
            <label key={s} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm cursor-pointer">
              <span>{ETIQUETAS_MATERIAL[s]}</span>
              <input type="color" aria-label={`Color de ${ETIQUETAS_MATERIAL[s]}`} value={adnActivo.materiales[s]?.color ?? "#7c5cff"} className="h-8 w-10 cursor-pointer"
                onChange={(ev) => ed.aplicar({ op: "material", slot: s, campo: "color", valor: ev.target.value })} />
            </label>
          ))}
        </div>
      </section>

      <section aria-label="Expresiones" className="space-y-2">
        <h4 className="text-sm font-medium">Expresión base</h4>
        <div className="flex flex-wrap gap-2">
          {EMOCIONES.map((x) => (
            <Button key={x} type="button" variant="outline" size="sm" aria-pressed={adnActivo.expresionBase[x] === 1} className={ARRIBA}
              onClick={() => { for (const em of EMOCIONES) ed.aplicar({ op: "expresion", clave: em, valor: em === x ? 1 : 0 }); }}>
              {ETIQUETAS_EXPRESION[x]}
            </Button>
          ))}
        </div>
      </section>

      <section aria-label="Aura" className="space-y-2">
        <h4 className="text-sm font-medium">Aura</h4>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0">Tono</span>
          <Slider aria-label="Tono del aura" className={ARRIBA} value={[adnActivo.aura.tono]} min={0} max={359} step={1}
            getAriaValueText={(v) => `${v} grados`} onValueChange={(v) => ed.aplicar({ op: "aura", campo: "tono", valor: v[0] })} />
          <span className="w-10 text-right tabular-nums text-muted-foreground">{Math.round(adnActivo.aura.tono)}</span>
        </label>
        <Deslizador etiqueta="Brillo" valor={adnActivo.aura.intensidad} alMover={(v) => ed.aplicar({ op: "aura", campo: "intensidad", valor: v })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={adnActivo.aura.ligadaEmocion} className="cursor-pointer"
            onChange={(ev) => ed.aplicar({ op: "aura", campo: "ligadaEmocion", valor: ev.target.checked })} />
          Atar el aura a la emoción del momento
        </label>
      </section>


