"use client";
/**
 * Avatares 3D · EDITOR DEL AVATAR EN TIEMPO REAL (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * Panel con: morfología (8 deslizadores), color por ranura, piezas por ranura (de la Biblioteca,
 * carpeta `avatares/piezas`; si no hay, lo dice y ofrece importar), expresiones, aura, carácter del
 * movimiento y visibilidad. Voz y texto: campo + micrófono con el dictado del OS; lo entendido se
 * aplica con `cambiosDesdeFrase`; lo no entendido va a Astraura (`aAstraura`, prop inyectada) con una
 * instrucción que pide SOLO una lista JSON de `CambioAvatar`; sin modelo, se dice. MIDI: si la
 * Protomolécula trae mapeo de mandos (vínculos CC cuyo parámetro coincide con un deslizador), se usa;
 * si no, Web MIDI con permiso explícito hacia el deslizador elegido. Honesto: nada se finge (sin
 * micrófono, sin MIDI, sin modelo o sin piezas se dice con su motivo) y ninguna petición va en bucle
 * (una sola lectura de piezas por sesión).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mic, MicOff } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import type { AdnAvatar, Morfologia, SlotMaterial, SlotPieza, Visibilidad } from "@/lib/avatares/adn/adn";
import { MORFOLOGIA, SLOTS_MATERIAL, SLOTS_PIEZA, VISIBILIDADES } from "@/lib/avatares/adn/adn";
import { cambiosDesdeFrase } from "@/lib/avatares/adn/dictado";
import { sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { cambiosDeModelo, instruccionAstraura, useEditorAvatar } from "@/lib/avatares/adaptadores/use-editor-avatar";
import { startDictation, isDictationSupported } from "@/lib/aurora/dictation";
import { normalizar01, aplicarCurva, CURVA_LINEAL, type Vinculo } from "@/lib/protomolecula/vinculos-control";
import { SIN_MIDI, pedirAccesoMidi, conectarMidi, hayMidi, type NavegadorMidi } from "@/lib/protomolecula/adaptador-midi";
import { listPublicItems, type PublicItem } from "@/lib/library/public-catalog";

export const CARPETA_PIEZAS = "avatares/piezas";
const refPieza = (n: string): string => `biblioteca:${CARPETA_PIEZAS}/${n}`;

export interface ProposEditorAvatar {
  adn: AdnAvatar;
  otrosPresentes?: number;
  emitir: (lote: CambioAvatar[]) => void;
  guardar: (adn: AdnAvatar) => Promise<void>;
  /** Modelo de Astraura: recibe la instrucción (SOLO lista JSON de CambioAvatar) y responde su texto; null/"" = sin modelo ahora mismo. */
  aAstraura?: (instruccion: string) => Promise<string | null>;
  /** Vínculos de la Protomolécula ya cargados por quien monta el editor (si hay, mandan sobre Web MIDI directo). */
  vinculosProtomolecula?: readonly Vinculo[];
}

const EMOCIONES = ["happy", "sad", "angry", "surprised", "relaxed", "neutral"] as const;
const ETIQ: Record<string, string> = {
  altura: "Altura", complexion: "Complexión", cabeza: "Cabeza", hombros: "Hombros", cintura: "Cintura", piernas: "Piernas", brazos: "Brazos", estilizado: "Estilizado",
  energia: "Energía", amplitud: "Amplitud", ritmo: "Ritmo", postura: "Postura",
  piel: "Piel", cabello: "Cabello", ojos: "Ojos", "ropa-1": "Ropa", "ropa-2": "Ropa baja", acento: "Acento", aura: "Aura",
  happy: "Feliz", sad: "Triste", angry: "Enojado", surprised: "Sorprendido", relaxed: "Relajado", neutral: "Neutral",
};
const CASO = <K extends string>(s: string): K => s as K;

/** Línea de deslizador con su etiqueta; en lo clicable, cursor-pointer. */
function Deslizador({ etiqueta, valor, tope = 1, paso = 0.05, onValue }: { etiqueta: string; valor: number; tope?: number; paso?: number; onValue: (n: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{etiqueta}</span>
      <Slider min={0} max={tope} step={paso} value={[valor]} onValueChange={(v) => onValue(v[0] ?? 0)} className="cursor-pointer" aria-label={etiqueta} />
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round((valor / tope) * 100)}</span>
    </label>
  );
}

export default function EditorAvatar({ adn: inicial, otrosPresentes = 0, emitir, guardar, aAstraura, vinculosProtomolecula }: ProposEditorAvatar) {
  const v = useEditorAvatar({ adn: inicial, otrosPresentes, emitir, guardar });
  const [piezas, setPiezas] = useState<PublicItem[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [escuchando, setEscuchando] = useState(false);
  const [ranura, setRanura] = useState<SlotPieza>("cabeza");
  const [claveMidi, setClaveMidi] = useState<Morfologia>("altura");
  const [midi, setMidi] = useState({ ok: false, motivo: "" });
  const sueltaMidi = useRef<(() => void) | null>(null);
  const dictado = useRef<ReturnType<typeof startDictation> | null>(null);

  // Piezas de la Biblioteca: UNA lectura por sesión (contrato §3: nada en bucle ni sondeo).
  useEffect(() => {
    let vivo = true;
    listPublicItems({ folder: CARPETA_PIEZAS }).then((l) => { if (vivo) setPiezas(l); }).catch(() => { if (vivo) setPiezas([]); });
    return () => { vivo = false; };
  }, []);
  useEffect(() => () => sueltaMidi.current?.(), []);

  const morfologia = (k: string, n: number) => v.aplicar({ op: "morfologia", clave: CASO<Morfologia>(k), valor: n });

  const dictar = async (frase: string) => {
    const fin = cambiosDesdeFrase(frase, v.adn);
    if (fin.cambios.length) v.aplicar(fin.cambios);
    if (!fin.sinEntender.length) { setAviso(fin.cambios.length ? `Lo entendido de «${frase}» quedó aplicado.` : `No entendí «${frase}».`); return; }
    if (!aAstraura) { setAviso(`Sin modelo disponible ahora mismo: «${fin.sinEntender.join("» «")}» quedó sin aplicar.`); return; }
    setAviso(`Pidiendo a Astraura… (no entendí: «${fin.sinEntender.join("» «")}»)`);
    try {
      const texto = await aAstraura(instruccionAstraura(fin.sinEntender.join("; ")));
      const cs = texto ? cambiosDeModelo(texto) : [];
      if (cs.length) { v.aplicar(cs); setAviso(`Astraura propuso ${cs.length} cambios y quedaron aplicados.`); return; }
      setAviso(texto === null || !texto.trim()
        ? `Sin modelo disponible ahora mismo: «${fin.sinEntender.join("» «")}» quedó sin aplicar.`
        : "Astraura no contestó con una lista JSON del formato: lo no entendido quedó sin aplicar.");
    } catch { setAviso("Falló la petición a Astraura: lo no entendido quedó sin aplicar."); }
  };

  const alternarMicro = () => {
    if (escuchando) { dictado.current?.stop(); dictado.current = null; setEscuchando(false); return; }
    dictado.current = startDictation({ onFinal: dictar, onEnd: () => { setEscuchando(false); dictado.current = null; }, onError: (m) => setAviso(m) });
    setEscuchando(true);
  };

  // Mapeo de la Protomolécula: vínculos CC activos cuyo parámetro coincide con un deslizador.
  const mapeoMidi = useMemo(() => {
    const out = new Map<string, Morfologia>();
    for (const x of vinculosProtomolecula ?? []) {
      if (!x.activo || x.fuente.tipo !== "midi" || x.fuente.mensaje !== "cc" || typeof x.fuente.numero !== "number") continue;
      if ((MORFOLOGIA as readonly string[]).includes(x.objetivo.parametroId)) out.set(`${x.fuente.canal}:${x.fuente.numero}`, CASO<Morfologia>(x.objetivo.parametroId));
    }
    return out;
  }, [vinculosProtomolecula]);

  const alMidi = (m: { fuente: { mensaje: string; canal: number; numero?: number }; bruto: number }) => {
    if (m.fuente.mensaje !== "cc") return;
    const f = { tipo: "midi" as const, mensaje: "cc" as const, canal: m.fuente.canal, numero: m.fuente.numero ?? 0 };
    morfologia(mapeoMidi.get(`${f.canal}:${f.numero}`) ?? claveMidi, aplicarCurva(normalizar01(f, m.bruto), CURVA_LINEAL, false));
  };
  const conectarMando = async () => {
    sueltaMidi.current?.();
    const res = await pedirAccesoMidi(navigator as NavegadorMidi);
    if (!res.ok) { setMidi({ ok: false, motivo: res.motivo }); return; }
    sueltaMidi.current = conectarMidi(res.acceso, alMidi);
    setMidi({ ok: true, motivo: "" });
  };

  const [frase, setFrase] = useState("");
  const piezaEnRanura = v.adn.piezas.find((p) => p.slot === ranura);
  const puedeMidi = hayMidi(navigator as NavegadorMidi);
  return (
    <div className="space-y-4 rounded-xl border bg-card/40 p-3" aria-label="Editor del avatar en tiempo real">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 cursor-pointer" disabled={!v.puedeDeshacer} onClick={v.deshacer}>Deshacer</Button>
        <Button variant="outline" size="sm" className="h-7 cursor-pointer" disabled={!v.puedeRehacer} onClick={v.rehacer}>Rehacer</Button>
        <Button variant="outline" size="sm" className="h-7 cursor-pointer" onClick={() => void v.guardarAhora()}>Guardar</Button>
        {v.errorGuardado || aviso ? <p className="text-xs text-muted-foreground" role="status">{v.errorGuardado || aviso}</p> : null}
      </div>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Morfología</legend>
        {MORFOLOGIA.map((k) => <Deslizador key={k} etiqueta={ETIQ[k]} valor={v.adn.morfologia[k] ?? 0.5} onValue={(n) => morfologia(k, n)} />)}
      </fieldset>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Color por ranura</legend>
        <div className="flex flex-wrap gap-3">
          {SLOTS_MATERIAL.map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs text-muted-foreground">
              {ETIQ[s]}
              <input type="color" className="h-6 w-8 cursor-pointer rounded" aria-label={`Color de ${ETIQ[s]}`} value={v.adn.materiales[s]?.color ?? "#7c5cff"}
                onChange={(e) => v.aplicar({ op: "material", slot: CASO<SlotMaterial>(s), campo: "color", valor: e.target.value })} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Piezas</legend>
        <div className="flex flex-wrap items-center gap-2">
          <select value={ranura} onChange={(e) => setRanura(e.target.value as SlotPieza)} aria-label="Ranura de pieza" className="cursor-pointer rounded-md border bg-transparent px-2 py-1 text-xs">
            {SLOTS_PIEZA.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select defaultValue="" aria-label="Pieza de la Biblioteca" className="min-w-44 cursor-pointer rounded-md border bg-transparent px-2 py-1 text-xs"
            onChange={(e) => { if (e.target.value) v.aplicar({ op: "pieza", slot: ranura, ref: e.target.value }); }}>
            <option value="">Elige una pieza…</option>
            {(piezas ?? []).map((p) => <option key={p.id} value={refPieza(p.name)}>{p.name}</option>)}
          </select>
          {piezaEnRanura ? <Button variant="outline" size="sm" className="h-7 cursor-pointer" onClick={() => v.aplicar({ op: "pieza", slot: ranura, ref: null })}>Quitar de {ranura}</Button> : null}
        </div>
        {piezaEnRanura ? <p className="text-xs text-muted-foreground">En «{ranura}»: {piezaEnRanura.ref}</p> : null}
        {piezas !== null && piezas.length === 0
          ? <p className="text-xs text-muted-foreground">Aún no hay piezas de avatar en la Biblioteca (carpeta «{CARPETA_PIEZAS}»). <Link href="/library" className="underline">Importar en la Biblioteca</Link></p>
          : null}
      </fieldset>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Expresiones</legend>
        {EMOCIONES.map((k) => <Deslizador key={k} etiqueta={ETIQ[k]} valor={v.adn.expresionBase[k] ?? 0} onValue={(n) => v.aplicar({ op: "expresion", clave: k, valor: n })} />)}
      </fieldset>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Aura</legend>
        <Deslizador etiqueta="Tono" tope={360} paso={5} valor={v.adn.aura.tono} onValue={(n) => v.aplicar({ op: "aura", campo: "tono", valor: n })} />
        <Deslizador etiqueta="Intensidad" valor={v.adn.aura.intensidad} onValue={(n) => v.aplicar({ op: "aura", campo: "intensidad", valor: n })} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="cursor-pointer" checked={v.adn.aura.ligadaEmocion} aria-label="Aura ligada a la emoción" onChange={(e) => v.aplicar({ op: "aura", campo: "ligadaEmocion", valor: e.target.checked })} />
          Ligada a la emoción del bot
        </label>
      </fieldset>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Movimiento</legend>
        {(["energia", "amplitud", "ritmo", "postura"] as const).map((k) => <Deslizador key={k} etiqueta={ETIQ[k]} valor={v.adn.movimiento[k]} onValue={(n) => v.aplicar({ op: "movimiento", campo: k, valor: n })} />)}
      </fieldset>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Visibilidad</legend>
        <select value={v.adn.visibilidad} onChange={(e) => v.aplicar({ op: "visibilidad", valor: e.target.value as Visibilidad })} aria-label="Visibilidad del avatar" className="cursor-pointer rounded-md border bg-transparent px-2 py-1 text-xs">
          {VISIBILIDADES.map((x) => <option key={x} value={x}>{x === "publico" ? "público" : x}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">«grupo» y «público» hoy solo etiquetan: aún no se publica nada.</p>
      </fieldset>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Voz y texto</legend>
        <div className="flex items-center gap-2">
          <input className="w-full cursor-text rounded-md border bg-transparent px-2 py-1 text-xs" placeholder="«pelo azul, ojos verdes y aura dorada»" aria-label="Describe un cambio" value={frase}
            onChange={(e) => setFrase(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && frase.trim()) { setFrase(""); void dictar(frase); } }} />
          <Button variant="outline" size="sm" className="h-7 cursor-pointer" aria-label={escuchando ? "Parar el micrófono" : "Dictar con el micrófono"} disabled={!isDictationSupported()} onClick={alternarMicro}>
            {escuchando ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
        </div>
        {!isDictationSupported() ? <p className="text-xs text-muted-foreground">Tu navegador no soporta dictado por voz: escribe el cambio.</p> : null}
      </fieldset>
      <fieldset className="space-y-1.5 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Mando MIDI</legend>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 cursor-pointer" disabled={!puedeMidi} onClick={() => void conectarMando()}>Conectar mando</Button>
          <select value={claveMidi} onChange={(e) => setClaveMidi(e.target.value as Morfologia)} aria-label="Deslizador para los mandos CC" className="cursor-pointer rounded-md border bg-transparent px-2 py-1 text-xs">
            {MORFOLOGIA.map((k) => <option key={k} value={k}>{ETIQ[k]}</option>)}
          </select>
          <span className="text-xs" role="status">{midi.ok ? "Mando conectado" : midi.motivo || (puedeMidi ? "" : SIN_MIDI)}</span>
        </div>
        {mapeoMidi.size ? <p className="text-xs text-muted-foreground">Se usa el mapeo de la Protomolécula ({mapeoMidi.size} CC).</p> : <p className="text-xs text-muted-foreground">Sin mapeo en la Protomolécula: cada mando CC mueve el deslizador elegido.</p>}
      </fieldset>
    </div>
  );
}
