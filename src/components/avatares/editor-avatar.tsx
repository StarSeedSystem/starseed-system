"use client";
/**
 * Editor del avatar en tiempo real (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * Panel con morfología (8 deslizadores), color por ranura, piezas por ranura, expresiones, aura,
 * carácter del movimiento, visibilidad, voz (dictado del OS + Astraura) y MIDI (Web MIDI).
 * Basta de ilusiones: la Biblioteca aún no tiene ítems de «pieza de avatar» (contrato §12), así
 * que se lo dice y ofrece el taller 3D con destino «pieza» (G3D1011E) para importar la primera.
 * El deshacer/rehacer, la cola de los demás presentes, el guardado en el almacén de AV1011D y el
 * mapeo MIDI viven en `useEditorAvatar`; este panel solo presenta y llama.
 */
import { useEffect, useId, useRef, useState } from "react";
import { EXPRESIONES, MORFOLOGIA, SLOTS_MATERIAL, type AdnAvatar, type Expresion, type Morfologia, type SlotMaterial, type Visibilidad } from "@/lib/avatares/adn/adn";
import { saveAdnToLibrary } from "@/lib/avatares/adaptadores/almacen-adn";
import { eventoDeLinea } from "@/lib/astraura/conversacion-rapida";
import { isDictationSupported, startDictation, type DictationHandle } from "@/lib/aurora/dictation";
import { Generar3D } from "@/components/avatares/generar-3d";
import { etiquetaObjetivo, objetivoDeEtiqueta, OPCIONES_MIDI, useEditorAvatar, type DependenciasEditor } from "@/lib/avatares/adaptadores/use-editor-avatar";

/** Las emociones del ADN que se presentan con deslizador (los visemas van de correr el orbe). */
const EMOCIONES = ["neutral", "happy", "angry", "sad", "relaxed", "surprised"] as const satisfies readonly Expresion[];
const MOVIMIENTO_CAMPOS = ["energia", "amplitud", "ritmo", "postura"] as const;
const ETIQUETA_MORFO: Record<Morfologia, string> = {
  altura: "Altura", complexion: "Complexión", cabeza: "Cabeza", hombros: "Hombros",
  cintura: "Cintura", piernas: "Piernas", brazos: "Brazos", estilizado: "De realista a caricatura",
};
const ETIQUETA_SLOT: Record<SlotMaterial, string> = {
  piel: "Piel", cabello: "Cabello", ojos: "Ojos", "ropa-1": "Ropa principal", "ropa-2": "Ropa secundaria",
  acento: "Acento y detalles", aura: "Color del aura",
};
const ETIQUETA_MOV: Record<"energia" | "amplitud" | "ritmo" | "postura", string> = {
  energia: "Energía", amplitud: "Amplitud", ritmo: "Ritmo", postura: "Postura",
};

/** Astraura por el canal de conversación real del OS (BitNet local primero, luego lo gratuito: 404 fuera de local). */
async function preguntarAstrauraOS(instruccion: string): Promise<string | null> {
  try {
    const r = await fetch("/api/astraura/conversacion", { method: "POST", body: JSON.stringify({ texto: instruccion }) });
    if (!r.ok || !r.body) return null;
    const lector = r.body.getReader(), dec = new TextDecoder();
    let búfer = "", texto = "";
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      búfer += dec.decode(value, { stream: true });
      const líneas = búfer.split("\n");
      búfer = líneas.pop() ?? "";
      for (const línea of líneas) {
        const e = eventoDeLinea(línea);
        if (e?.t === "token") texto += e.v;
        if (e?.t === "error") return null;
      }
    }
    return texto.length ? texto : null;
  } catch {
    return null;
  }
}

export interface EditorAvatarProps {
  adnInicial: AdnAvatar;
  /** Cuánta gente más mira el avatar (AV1011E aún no lo cuenta solo). */
  otrosPresentes?: number;
  /** Puertas inyectables (pruebas): guardar en AV1011D, emitir a los demás y preguntar a Astraura. */
  deps?: Partial<Pick<DependenciasEditor, "guardar" | "emitir" | "preguntarAstraura" | "almacen" | "ahora">>;
}

export default function EditorAvatar({ adnInicial, otrosPresentes = 0, deps }: EditorAvatarProps) {
  const id = useId();
  const editor = useEditorAvatar(adnInicial, {
    ahora: () => Date.now(),
    guardar: (a) => saveAdnToLibrary(a, a.visibilidad),
    preguntarAstraura: preguntarAstrauraOS,
    ...deps,
  });
  const [frase, setFrase] = useState("");
  const [dictando, setDictando] = useState(false);
  const [avisoMic, setAvisoMic] = useState<string | null>(null);
  const [objetivoSel, setObjetivoSel] = useState(OPCIONES_MIDI[0]);
  const micRef = useRef<DictationHandle | null>(null);
  useEffect(() => () => micRef.current?.stop(), []);
  const etiqueta = (k: string) => { const o = objetivoDeEtiqueta(k); return o ? etiquetaObjetivo(o) : null; };
  const adn = editor.adn;
  const numMorfo = (k: Morfologia) => adn.morfologia[k] ?? 0.5;
  const paso = 0.01;
  const gl = (k: string) => `${id}-${k}`;

  /* fundidos: secciones del panel */
  const seccionesMateriales = SLOTS_MATERIAL.map((slot) => (
    <label key={slot} htmlFor={gl(`mat-${slot}`)} className="flex items-center gap-2">
      <span className="w-36 shrink-0">{ETIQUETA_SLOT[slot]}</span>
      <input id={gl(`mat-${slot}`)} type="color" className="cursor-pointer h-7 w-12 rounded border"
        value={adn.materiales[slot]?.color ?? "#7c5cff"} aria-label={`Color de ${ETIQUETA_SLOT[slot]}`}
        onChange={(e) => editor.cambiar({ op: "material", slot, campo: "color", valor: e.target.value })} />
    </label>
  ));
  const seccionesEmociones = EMOCIONES.map((clave) => (
    <label key={clave} htmlFor={gl(`exp-${clave}`)} className="flex items-center gap-2">
      <span className="w-36 shrink-0">{clave}</span>
      <input id={gl(`exp-${clave}`)} type="range" min={0} max={1} step={paso} value={adn.expresionBase[clave] ?? 0}
        className="cursor-pointer w-full" onChange={(e) => editor.cambiar({ op: "expresion", clave, valor: Number(e.target.value) })} />
    </label>
  ));
  const deslizarMov = MOVIMIENTO_CAMPOS.map((campo) => (
    <label key={campo} htmlFor={gl(`mov-${campo}`)} className="flex items-center gap-2">
      <span className="w-36 shrink-0">{ETIQUETA_MOV[campo]}</span>
      <input id={gl(`mov-${campo}`)} type="range" min={0} max={1} step={paso} value={adn.movimiento[campo]}
        className="cursor-pointer w-full" onChange={(e) => editor.cambiar({ op: "movimiento", campo, valor: Number(e.target.value) })} />
    </label>
  ));
  const deslizarMorfo = MORFOLOGIA.map((clave) => (
    <label key={clave} htmlFor={gl(`mor-${clave}`)} className="flex items-center gap-2">
      <span className="w-36 shrink-0">{ETIQUETA_MORFO[clave]}</span>
      <input id={gl(`mor-${clave}`)} type="range" min={0} max={1} step={paso} value={numMorfo(clave)}
        className="cursor-pointer w-full" onChange={(e) => editor.cambiar({ op: "morfologia", clave, valor: Number(e.target.value) })} />
    </label>
  ));
  const alDictar = (texto: string) => {
    if (!texto.trim()) return;
    setFrase("");
    void editor.dictar(texto.trim());
  };
  const micrófono = () => {
    if (dictando) { micRef.current?.stop(); setDictando(false); return; }
    micRef.current = startDictation({ onFinal: alDictar, onEnd: () => setDictando(false), onError: setAvisoMic });
    setDictando(true);
  };

  return (
    <section aria-label="Editor del avatar" className="space-y-4 text-sm">
      <p>Personaliza <strong>{adn.nombre}</strong> (dueño: {adn.dueno.tipo} {adn.dueno.id}). Los cambios se ven aquí al instante.</p>
      {editor.aviso ? <p role="status" className="text-xs text-amber-600 dark:text-amber-400">{editor.aviso}</p> : null}
      {avisoMic ? <p role="status" className="text-xs text-amber-600 dark:text-amber-400">{avisoMic}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={editor.deshacer} disabled={!editor.puedeDeshacer}
          className="cursor-pointer rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">Deshacer</button>
        <button type="button" onClick={editor.rehacer} disabled={!editor.puedeRehacer}
          className="cursor-pointer rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">Rehacer</button>
      </div>

      <fieldset className="space-y-1 rounded border p-3"><legend>Morfología</legend>{deslizarMorfo}</fieldset>

      <fieldset className="space-y-1 rounded border p-3"><legend>Color por ranura</legend>{seccionesMateriales}</fieldset>

      <fieldset className="space-y-1 rounded border p-3"><legend>Expresiones</legend>{seccionesEmociones}</fieldset>

      <fieldset className="space-y-2 rounded border p-3"><legend>Aura</legend>
        <label htmlFor={gl("aura-tono")} className="flex items-center gap-2"><span className="w-36 shrink-0">Tono</span>
          <input id={gl("aura-tono")} type="range" min={0} max={360} step={1} className="cursor-pointer w-full" value={adn.aura.tono}
            onChange={(e) => editor.cambiar({ op: "aura", campo: "tono", valor: Number(e.target.value) })} /></label>
        <label htmlFor={gl("aura-int")} className="flex items-center gap-2"><span className="w-36 shrink-0">Intensidad</span>
          <input id={gl("aura-int")} type="range" min={0} max={1} step={paso} className="cursor-pointer w-full" value={adn.aura.intensidad}
            onChange={(e) => editor.cambiar({ op: "aura", campo: "intensidad", valor: Number(e.target.value) })} /></label>
        <label htmlFor={gl("aura-emo")} className="flex items-center gap-2 cursor-pointer">
          <input id={gl("aura-emo")} type="checkbox" className="cursor-pointer" checked={adn.aura.ligadaEmocion}
            onChange={(e) => editor.cambiar({ op: "aura", campo: "ligadaEmocion", valor: e.target.checked })} />
          Ligado a la emoción</label>
      </fieldset>

      <fieldset className="space-y-1 rounded border p-3"><legend>Carácter del movimiento</legend>{deslizarMov}</fieldset>

      <fieldset className="space-y-1 rounded border p-3"><legend>Visibilidad</legend>
        <select className="cursor-pointer" value={adn.visibilidad}
          onChange={(e) => editor.cambiar({ op: "visibilidad", valor: e.target.value as Visibilidad })}>
          <option value="privado">Privado</option><option value="grupo">Grupo</option><option value="publico">Público</option>
        </select>
        <p className="text-xs text-slate-500 dark:text-slate-400">«Grupo» y «público» hoy solo etiquetan: aún no se comparte nada (contrato §12).</p>
      </fieldset>

      <fieldset className="space-y-1 rounded border p-3"><legend>Piezas por ranura</legend>
        {adn.piezas.length === 0
          ? <p className="text-xs text-slate-500 dark:text-slate-400">La Biblioteca aún no tiene piezas de avatar: impórtalas con el taller 3D.</p>
          : <ul className="text-xs">{adn.piezas.map((p) => <li key={p.slot}>{p.slot}: {p.ref}</li>)}</ul>}
        <Generar3D destino="pieza" />
      </fieldset>

      <fieldset className="space-y-2 rounded border p-3"><legend>Voz y texto</legend>
        <div className="flex gap-2">
          <input type="text" className="w-2/3 rounded border px-2" placeholder="«pelo azul, más alto, sonríe»" value={frase}
            onChange={(e) => setFrase(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") alDictar(frase); }} aria-label="Frase para personalizar" />
          <button type="button" onClick={micrófono} className="cursor-pointer rounded border px-2 py-1"
            aria-pressed={dictando}>{dictando ? "Escuchando…" : "Dictar"}</button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{isDictationSupported() ? "Dictado por voz del OS (español)." : "Este navegador no da dictado por voz: escribe la frase."}</p>
      </fieldset>

      <fieldset className="space-y-2 rounded border p-3"><legend>Mando MIDI</legend>
        <button type="button" className="cursor-pointer rounded border px-2 py-1" onClick={() => void editor.conectarMidi(navigator)}>Conectar mandos MIDI</button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {editor.midi.estado === "sin-nav" && "Web MIDI aún no está abierto: el permiso se pide solo al pulsar el botón."}
          {editor.midi.estado === "conectado" && "Mandos conectados. Elige un deslizador y mueve un control para mapearlo."}
          {(editor.midi.estado === "denegado" || editor.midi.estado === "sin-soporte") ? editor.midi.motivo : null}
        </p>
        {editor.midi.estado === "conectado" ? (
          <div className="flex items-center gap-2">
            <select className="cursor-pointer" value={objetivoSel} onChange={(e) => setObjetivoSel(e.target.value)} aria-label="Deslizador a mapear">
              {OPCIONES_MIDI.map((k) => (etiqueta(k) ? <option key={k} value={k}>{etiqueta(k)}</option> : null))}
            </select>
            {editor.midi.aprendiendo
              ? <button type="button" className="cursor-pointer rounded border px-2 py-1" onClick={editor.dejarDeAprender}>Cancela la espera de CC</button>
              : <button type="button" className="cursor-pointer rounded border px-2 py-1" onClick={() => editor.fijarObjetivoMidi(objetivoSel)}>Esperar el próximo CC</button>}
          </div>
        ) : null}
        {Object.entries(editor.midi.mapeos).length > 0 ? (
          <ul className="text-xs">
            {Object.entries(editor.midi.mapeos).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2">
                <span>{k} → {etiquetaObjetivo(v)}</span>
                <button type="button" className="cursor-pointer rounded border px-1" onClick={() => editor.quitarMapeoMidi(k)}>Quitar</button>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>
    </section>
  );
}
