"use client";
/**
 * Avatares 3D · PANEL «EDITOR DE AVATAR» (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * Morfología (8 deslizadores), color por ranura, piezas por ranura y expresiones, aura, carácter del
 * movimiento y visibilidad. La lógica vive en el núcleo puro (`src/lib/avatares/adn/`) y el hook
 * `useEditorAvatar`; aquí queda el cableado: deshacer/rehacer, dictado por voz con el micrófono que
 * ya tiene el OS (`src/lib/aurora/dictation.ts`) y mando MIDI por Web MIDI. Piezas: solo elementos de
 * la Biblioteca de tipo pieza de avatar; si no hay, se dice y se ofrece importar con el taller
 * imagen→3D. Sin bucles ni sondeos: el ADN ya lo trae quien monta el panel, y la emisión solo sale si
 * `otrosPresentes > 0` (lo que llega por el hook).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { chat } from "@/ai/client/chat";
import { MORFOLOGIA, SLOTS_MATERIAL, SLOTS_PIEZA, type AdnAvatar, type Expresion, type Morfologia, type SlotMaterial, type SlotPieza, type Visibilidad } from "@/lib/avatares/adn/adn";
import type { CambioAvatar } from "@/lib/avatares/adn/cambios";
import { isDictationSupported, startDictation } from "@/lib/aurora/dictation";
import { saveAdnToLibrary } from "@/lib/avatares/adaptadores/almacen-adn";
import { useEditorAvatar, type DependenciasEditorAvatar } from "@/lib/avatares/adaptadores/use-editor-avatar";

const VISIBILIDAD_TEXTO: Record<Visibilidad, string> = { privado: "Privado", grupo: "Grupo", publico: "Público" };

export interface PiezaOpcion { ref: string; nombre: string }
export interface EditorAvatarProps {
  adn: AdnAvatar;
  otrosPresentes?: number;
  /** Piezas «biblioteca:…» de la Biblioteca; undefined = todavía no se leyó la Biblioteca. */
  piezas?: readonly PiezaOpcion[];
  deps?: Partial<DependenciasEditorAvatar>;
}

/** Astraura por el chat del OS (sistema primario); sin proveedor activo devuelve null y se lo dice. */
function astrauraDelOs(): DependenciasEditorAvatar["astraura"] {
  return async (instruccion, frase) => {
    try {
      const r = await chat({ messages: [{ role: "system", content: instruccion }, { role: "user", content: frase }], temperature: 0, maxTokens: 400 });
      return r.text;
    } catch {
      return null;
    }
  };
}

const EMOCIONES: readonly Expresion[] = ["neutral", "happy", "angry", "sad", "relaxed", "surprised"];
const EMOCION_TEXTO: Record<Expresion, string> = {
  neutral: "Neutral", happy: "Sonríe", angry: "Enfadada", sad: "Triste", relaxed: "Relajada", surprised: "Sorprendida",
  aa: "aa", ih: "ih", ou: "ou", ee: "ee", oh: "oh", blink: "Parpadeo", blinkLeft: "Parpadeo izq.", blinkRight: "Parpadeo der.",
  lookUp: "Mirada arriba", lookDown: "Mirada abajo", lookLeft: "Mirada izq.", lookRight: "Mirada der.",
};
const MORFOLOGIA_TEXTO: Record<Morfologia, string> = {
  altura: "Altura", complexion: "Complexión", cabeza: "Cabeza", hombros: "Hombros", cintura: "Cintura", piernas: "Piernas", brazos: "Brazos", estilizado: "Estilizado",
};
const CAMPOS_MOVIMIENTO: ReadonlyArray<[keyof AdnAvatar["movimiento"], string]> = [
  ["energia", "Energía"], ["amplitud", "Amplitud"], ["ritmo", "Ritmo"], ["postura", "Postura"],
];
/** Nombre a la vista de una clave con guiones: «ropa-1» → «Ropa 1». */
const humano = (s: string): string => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function PiezasRanuras({ a, piezas, aplicar }: { a: AdnAvatar; piezas?: readonly PiezaOpcion[]; aplicar: (c: CambioAvatar) => void }) {
  const hay = piezas?.length ?? 0;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Piezas por ranura</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SLOTS_PIEZA.map((s: SlotPieza) => (
          <div key={s} className="space-y-1">
            <Label htmlFor={`pie-${s}`}>{humano(s)}</Label>
            <select id={`pie-${s}`} className="w-full cursor-pointer rounded-md border bg-transparent px-2 py-1 text-sm"
              value={a.piezas.find((p) => p.slot === s)?.ref ?? ""}
              onChange={(e) => aplicar({ op: "pieza", slot: s, ref: e.target.value.trim() || null })}>
              <option value="">sin pieza</option>
              {(piezas ?? []).filter((p) => p.ref.startsWith("biblioteca:")).map((p) => (
                <option key={p.ref} value={p.ref}>{p.nombre}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {piezas === undefined || hay === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay piezas de avatar en la Biblioteca: puedes importar una con el taller imagen→3D
          (destino «Pieza»); lo que se genere queda referenciado aquí con su procedencia.
        </p>
      ) : null}
    </div>
  );
}

export default function EditorAvatar({ adn: partida, otrosPresentes = 0, piezas, deps }: EditorAvatarProps) {
  const dependencias = useMemo<DependenciasEditorAvatar>(() => ({
    guardar: async (a) => { await saveAdnToLibrary(a, a.visibilidad); },
    astraura: astrauraDelOs(),
    ...deps,
  }), [deps]);
  const ed = useEditorAvatar(partida, otrosPresentes, dependencias);
  const a = ed.adn;
  const aplicar = ed.aplicar;
  const [frase, setFrase] = useState("");
  const [escuchando, setEscuchando] = useState(false);
  const [avisoMic, setAvisoMic] = useState<string | null>(null);
  const dictadoSoportado = isDictationSupported();
  /** Al cerrar el editor se guarda lo pendiente (contrato §3: guardado también al cerrar). */
  useEffect(() => () => ed.cerrar(), [ed.cerrar]);

  const alMic = () => {
    if (escuchando) return;
    setEscuchando(true);
    startDictation({
      onFinal: (t) => { void ed.dictar(t); },
      onError: (m) => setAvisoMic(m),
      onEnd: () => setEscuchando(false),
    });
  };

  return (
    <section className="space-y-4" aria-label="Editor del avatar">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="cursor-pointer" onClick={ed.deshacer} disabled={!ed.puedeDeshacer}>Deshacer</Button>
        <Button variant="outline" size="sm" className="cursor-pointer" onClick={ed.rehacer} disabled={!ed.puedeRehacer}>Rehacer</Button>
        <Button variant="outline" size="sm" className="cursor-pointer" onClick={ed.cerrar}>Guardar cambios</Button>
        <p className="text-sm text-muted-foreground">{a.nombre} · revisión {a.rev}{otrosPresentes > 0 ? ` · ${otrosPresentes} persona(s) viendo en vivo` : " · en vivo solo en tu pantalla"}</p>
      </div>
      <Tabs defaultValue="cuerpo">
        <TabsList>
          <TabsTrigger value="cuerpo" className="cursor-pointer">Cuerpo</TabsTrigger>
          <TabsTrigger value="presencia" className="cursor-pointer">Presencia</TabsTrigger>
          <TabsTrigger value="voz" className="cursor-pointer">Voz y mando</TabsTrigger>
        </TabsList>
        <TabsContent value="cuerpo" className="space-y-4">
          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <legend className="sr-only">Morfología</legend>
            {MORFOLOGIA.map((m) => (
              <div key={m} className="space-y-1">
                <Label htmlFor={`mor-${m}`}>{MORFOLOGIA_TEXTO[m]}</Label>
                <Slider id={`mor-${m}`} className="cursor-pointer" min={0} max={1} step={0.01} value={[a.morfologia[m] ?? 0.5]}
                  onValueChange={([v]) => aplicar({ op: "morfologia", clave: m, valor: v })} aria-label={`Deslizador de ${MORFOLOGIA_TEXTO[m]}`} />
              </div>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            {SLOTS_MATERIAL.map((s: SlotMaterial) => (
              <Label key={s} className="flex items-center gap-2">
                {humano(s)}
                <input type="color" className="size-8 cursor-pointer rounded border" value={a.materiales[s]?.color ?? "#7c5cff"}
                  onChange={(e) => aplicar({ op: "material", slot: s, campo: "color", valor: e.target.value })} aria-label={`Color de ${humano(s)}`} />
              </Label>
            ))}
          </div>
          <PiezasRanuras a={a} piezas={piezas} aplicar={aplicar} />
        </TabsContent>
        <TabsContent value="presencia" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {EMOCIONES.map((e) => (
              <Button key={e} size="sm" variant={a.expresionBase[e] ? "default" : "outline"} className="cursor-pointer"
                onClick={() => { for (const x of EMOCIONES) aplicar({ op: "expresion", clave: x, valor: x === e ? 1 : 0 }); }}>
                {EMOCION_TEXTO[e]}
              </Button>
            ))}
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="aura-tono">Aura · tono</Label>
              <Slider id="aura-tono" className="cursor-pointer" min={0} max={360} step={1} value={[a.aura.tono]} onValueChange={([v]) => aplicar({ op: "aura", campo: "tono", valor: v })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="aura-int">Aura · intensidad</Label>
              <Slider id="aura-int" className="cursor-pointer" min={0} max={1} step={0.01} value={[a.aura.intensidad]} onValueChange={([v]) => aplicar({ op: "aura", campo: "intensidad", valor: v })} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="aura-emocion" className="cursor-pointer" checked={a.aura.ligadaEmocion} onCheckedChange={(c) => aplicar({ op: "aura", campo: "ligadaEmocion", valor: c === true })} />
              <Label htmlFor="aura-emocion" className="cursor-pointer">Aura ligada a la emoción</Label>
            </div>
          </div>
          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <legend className="sr-only">Carácter del movimiento</legend>
            {CAMPOS_MOVIMIENTO.map(([c, texto]) => (
              <div key={c} className="space-y-1">
                <Label htmlFor={`mov-${c}`}>{texto}</Label>
                <Slider id={`mov-${c}`} className="cursor-pointer" min={0} max={1} step={0.01} value={[a.movimiento[c]]} onValueChange={([v]) => aplicar({ op: "movimiento", campo: c, valor: v })} />
              </div>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            {(["privado", "grupo", "publico"] as const).map((v) => (
              <Label key={v} className="flex cursor-pointer items-center gap-1">
                <input type="radio" name="visibilidad-avatar" className="cursor-pointer" checked={a.visibilidad === v}
                  onChange={() => aplicar({ op: "visibilidad", valor: v as Visibilidad })} />
                {VISIBILIDAD_TEXTO[v]}
              </Label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Hoy «grupo» y «público» solo etiquetan el avatar: todavía no se publica ni se comparte con otras personas.</p>
        </TabsContent>
        <TabsContent value="voz" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={frase} onChange={(e) => setFrase(e.target.value)} placeholder="«Pelo azul, ojos verdes, más alto»" aria-label="El avatar por voz"
              onKeyDown={(e) => { if (e.key === "Enter") { void ed.dictar(frase); setFrase(""); } }} className="max-w-md" />
            <Button size="sm" className="cursor-pointer" onClick={() => { void ed.dictar(frase); setFrase(""); }} disabled={!frase.trim()}>Aplicar</Button>
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={alMic} disabled={!dictadoSoportado} aria-label="Dictar por voz">
              {escuchando ? "Escuchando…" : "Micrófono"}
            </Button>
          </div>
          {avisoMic && <p className="text-sm text-destructive">{avisoMic}</p>}
          {ed.mensajeVoz && <p className="text-sm text-muted-foreground" role="status">{ed.mensajeVoz}</p>}
          {!dictadoSoportado && <p className="text-sm text-muted-foreground">Este navegador no soporta dictado por voz: puedes escribir la frase en el campo.</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => { void ed.conectarMidi(); }}>Conectar mando MIDI</Button>
          </div>
          {ed.mensajeMidi && <p className="text-sm text-muted-foreground" role="status">{ed.mensajeMidi}</p>}
          <p className="text-xs text-muted-foreground">Sin mando, los deslizadores de «Cuerpo» van por CC 20–27.</p>
        </TabsContent>
      </Tabs>
    </section>
  );
}
