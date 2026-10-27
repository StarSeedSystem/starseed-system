"use client";

/**
 * Editor del avatar en tiempo real (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * Panel honesto: lo que se ve es el ADN de verdad (orbe, VRM o GLB con esqueleto), no una
 * maqueta. Los deslizadores y colores se aplican al instante en esta pantalla; los demás
 * presentes reciben los cambios agrupados solo si hay alguien mirando, y el guardado espera
 * 5 s de calma (30 s entre guardados). Las piezas salen de la Biblioteca y, si aún no hay,
 * se dice y se ofrece importar. La voz usa el dictado del OS; lo que no entiende va a Astraura.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { isDictationSupported, startDictation, type DictationHandle } from "@/lib/aurora/dictation";
import {
  EXPRESIONES, MORFOLOGIA, SLOTS_MATERIAL, SLOTS_PIEZA,
  type AdnAvatar, type Expresion, type Morfologia, type SlotMaterial, type SlotPieza, type Visibilidad,
} from "@/lib/avatares/adn/adn";
import type { CambioAvatar } from "@/lib/avatares/adn/cambios";
import {
  hayMidi, pedirAccesoMidi, conectarMidi, SIN_MIDI,
  type AccesoMidi, type NavegadorMidi,
} from "@/lib/protomolecula/adaptador-midi";
import {
  preguntarAAstraura, useEditorAvatar, type DependenciasEditor, type ResultadoVoz,
} from "@/lib/avatares/adaptadores/use-editor-avatar";

export interface PiezaEditor {
  id: string;
  titulo: string;
  /** Referencia interna de la Biblioteca («biblioteca:…»). */
  ref: string;
  /** Ranura a la que encaja; si falta, vale para cualquiera. */
  slot?: SlotPieza;
}

export interface EditorAvatarProps {
  adnInicial: AdnAvatar;
  otrosPresentes?: number;
  emitir?: (cambios: readonly CambioAvatar[]) => void;
  guardar?: DependenciasEditor["guardar"];
  preguntarAstraura?: DependenciasEditor["preguntarAstraura"];
  mapeoMidi?: Readonly<Record<number, Morfologia>>;
  piezas?: readonly PiezaEditor[];
  onImportarPieza?: () => void;
  className?: string;
}

const ETIQUETAS_MORFOLOGIA: Record<Morfologia, string> = {
  altura: "Altura", complexion: "Complexión", cabeza: "Tamaño de cabeza", hombros: "Anchura de hombros",
  cintura: "Cintura", piernas: "Piernas", brazos: "Brazos", estilizado: "Estilizado (realista → caricatura)",
};
const ETIQUETAS_MATERIAL: Record<SlotMaterial, string> = {
  piel: "Piel", cabello: "Cabello", ojos: "Ojos", "ropa-1": "Ropa 1", "ropa-2": "Ropa 2", acento: "Acento", aura: "Aura",
};
const ETIQUETAS_PIEZA: Record<SlotPieza, string> = {
  cabeza: "Cabeza", cabello: "Cabello", torso: "Torso", piernas: "Piernas", cara: "Cara", pies: "Pies",
  manos: "Manos", "accesorio-1": "Accesorio 1", espalda: "Espalda", "accesorio-2": "Accesorio 2", mascota: "Mascota",
};
const EXPRESIONES_EMOCION: readonly Expresion[] = ["neutral", "happy", "sad", "angry", "relaxed", "surprised"];
const ETIQUETAS_EXPRESION: Partial<Record<Expresion, string>> = {
  neutral: "Neutral", happy: "Alegre", sad: "Triste", angry: "Enfadado", relaxed: "Relajado", surprised: "Sorprendido",
};
const ETIQUETAS_MOVIMIENTO: Record<"energia" | "amplitud" | "ritmo" | "postura", string> = {
  energia: "Energía", amplitud: "Amplitud", ritmo: "Ritmo", postura: "Postura",
};
const VISIBILIDADES_UI: Array<{ valor: Visibilidad; etiqueta: string }> = [
  { valor: "privado", etiqueta: "Privado (solo tú)" },
  { valor: "grupo", etiqueta: "Grupo (solo etiqueta)" },
  { valor: "publico", etiqueta: "Público (solo etiqueta)" },
];

function Deslizador(props: {
  id: string; etiqueta: string; valor: number; alCambiar: (valor: number) => void; deshabilitado?: boolean;
}) {
  const porcentaje = Math.round(props.valor * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={props.id}>{props.etiqueta}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{porcentaje}%</span>
      </div>
      <input
        id={props.id} type="range" min={0} max={100} step={1} value={porcentaje}
        disabled={props.deshabilitado}
        aria-valuetext={`${porcentaje} por ciento`}
        onChange={(e) => props.alCambiar(Number(e.target.value) / 100)}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export default function EditorAvatar(props: EditorAvatarProps) {
  const {
    adnInicial, otrosPresentes = 0, emitir, guardar, preguntarAstraura, mapeoMidi,
    piezas = [], onImportarPieza, className,
  } = props;
  const deps: DependenciasEditor = {
    guardar,
    emitir,
    otrosPresentes: () => otrosPresentes,
    preguntarAstraura: preguntarAstraura ?? preguntarAAstraura,
    mapeoMidi: () => mapeoMidi,
  };
  const editor = useEditorAvatar(adnInicial, deps);
  const [frase, setFrase] = useState("");
  const [dictando, setDictando] = useState(false);
  const [errorDictado, setErrorDictado] = useState<string | null>(null);
  const [ultimaVoz, setUltimaVoz] = useState<ResultadoVoz | null>(null);
  const [importAviso, setImportAviso] = useState<string | null>(null);
  const dictadoRef = useRef<DictationHandle | null>(null);
  const soltarMidiRef = useRef<(() => void) | null>(null);
  const [midi, setMidi] = useState<{ estado: "apagado" | "conectando" | "conectado" | "error"; motivo?: string; aparatos: string[] }>({
    estado: "apagado", aparatos: [],
  });
  const [soportes, setSoportes] = useState({ dictado: false, midi: false });
  const dictadoSoportado = soportes.dictado, midiSoportado = soportes.midi;
  const { aplicar, deshacer, rehacer, voz, aplicarMidi, fijarDeslizador, limpiarAviso } = editor;

  useEffect(() => {
    setSoportes({
      dictado: isDictationSupported(),
      midi: typeof navigator !== "undefined" && hayMidi(navigator as unknown as NavegadorMidi),
    });
  }, []);

  const enviarFrase = useCallback(async (texto: string) => {
    const limpio = texto.trim();
    if (!limpio) return;
    const resultado = await voz(limpio);
    setUltimaVoz(resultado);
    setFrase("");
  }, [voz]);

  const alternarDictado = useCallback(() => {
    if (dictando) {
      dictadoRef.current?.stop();
      dictadoRef.current = null;
      setDictando(false);
      return;
    }
    setErrorDictado(null);
    setDictando(true);
    dictadoRef.current = startDictation({
      onInterim: (texto) => setFrase(texto),
      onFinal: (texto) => { void enviarFrase(texto); },
      onEnd: () => { setDictando(false); dictadoRef.current = null; },
      onError: (motivo) => setErrorDictado(motivo),
    });
  }, [dictando, enviarFrase]);

  const enviarFormulario = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void enviarFrase(frase);
  }, [enviarFrase, frase]);

  const conectarMando = useCallback(async () => {
    if (midi.estado === "conectado") {
      soltarMidiRef.current?.();
      soltarMidiRef.current = null;
      setMidi({ estado: "apagado", aparatos: [] });
      return;
    }
    setMidi({ estado: "conectando", aparatos: [] });
    const resultado = await pedirAccesoMidi(navigator as unknown as NavegadorMidi);
    if (!resultado.ok) { setMidi({ estado: "error", motivo: resultado.motivo, aparatos: [] }); return; }
    const acceso: AccesoMidi = resultado.acceso;
    soltarMidiRef.current = conectarMidi(acceso, (mensaje) => {
      if (mensaje.fuente.mensaje === "cc" && mensaje.fuente.numero !== undefined) {
        aplicarMidi(mensaje.fuente.numero, mensaje.bruto);
      }
    }, (aparatos) => setMidi((previo) => ({ ...previo, estado: "conectado", aparatos })));
    setMidi({ estado: "conectado", aparatos: [] });
  }, [aplicarMidi, midi.estado]);

  useEffect(() => () => { dictadoRef.current?.stop(); soltarMidiRef.current?.(); }, []);

  const colorDe = (slot: SlotMaterial): string => editor.adn.materiales[slot]?.color ?? "#7c5cff";
  const piezaDe = (slot: SlotPieza) => editor.adn.piezas.find((p) => p.slot === slot);
  const piezasPara = (slot: SlotPieza) => piezas.filter((p) => !p.slot || p.slot === slot);
  const pedirImportacion = () => {
    if (onImportarPieza) { onImportarPieza(); return; }
    setImportAviso("La Biblioteca real todavía no tiene el tipo de ítem «pieza de avatar» (AV1011D): no se puede importar desde aquí. El botón queda preparado para cuando exista.");
  };

  return (
    <section aria-label="Editor del avatar" className={cn("space-y-6", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Editor del avatar</h2>
          <p className="text-sm text-muted-foreground">
            Se ve al instante en esta pantalla. Los demás presentes reciben los cambios agrupados, y solo si hay alguien mirando.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={editor.sinGuardar ? "secondary" : "outline"}>
            {editor.guardando ? "Guardando…" : editor.sinGuardar ? "Cambios sin guardar" : "Guardado"}
          </Badge>
          <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={() => deshacer()} disabled={!editor.puedeDeshacer}>
            Deshacer
          </Button>
          <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={() => rehacer()} disabled={!editor.puedeRehacer}>
            Rehacer
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 space-y-6 lg:order-1">
          <section aria-labelledby="morfologia-titulo" className="space-y-4 rounded-lg border bg-card p-4">
            <h3 id="morfologia-titulo" className="font-medium">Morfología</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {MORFOLOGIA.map((clave) => (
                <Deslizador
                  key={clave} id={`morfologia-${clave}`} etiqueta={ETIQUETAS_MORFOLOGIA[clave]}
                  valor={editor.adn.morfologia[clave] ?? 0.5}
                  alCambiar={(valor) => aplicar({ op: "morfologia", clave, valor })}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="colores-titulo" className="space-y-3 rounded-lg border bg-card p-4">
            <h3 id="colores-titulo" className="font-medium">Color por ranura</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {SLOTS_MATERIAL.map((slot) => {
                const color = colorDe(slot);
                return (
                  <div key={slot} className="flex items-center gap-3">
                    <Label htmlFor={`color-${slot}`} className="min-w-20">{ETIQUETAS_MATERIAL[slot]}</Label>
                    <input
                      id={`color-${slot}`} type="color" value={color}
                      onChange={(e) => aplicar({ op: "material", slot, campo: "color", valor: e.target.value })}
                      className="h-9 w-14 cursor-pointer rounded border border-input bg-background"
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">{color}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="piezas-titulo" className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="piezas-titulo" className="font-medium">Piezas por ranura</h3>
              <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={pedirImportacion}>
                Importar pieza
              </Button>
            </div>
            {piezas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                La Biblioteca todavía no tiene piezas de avatar guardadas. Puedes importarlas cuando exista el tipo de ítem «pieza de avatar»;
                mientras tanto, el avatar usa su malla base.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {SLOTS_PIEZA.map((slot) => {
                  const disponibles = piezasPara(slot);
                  const actual = piezaDe(slot);
                  return (
                    <div key={slot} className="space-y-1">
                      <Label htmlFor={`pieza-${slot}`}>{ETIQUETAS_PIEZA[slot]}</Label>
                      <select
                        id={`pieza-${slot}`} value={actual?.ref ?? ""}
                        onChange={(e) => aplicar({ op: "pieza", slot, ref: e.target.value || null })}
                        className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">Sin pieza</option>
                        {disponibles.map((p) => <option key={p.id} value={p.ref}>{p.titulo}</option>)}
                      </select>
                      {disponibles.length === 0 && <p className="text-xs text-muted-foreground">No hay pieza de Biblioteca para esta ranura.</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {importAviso && <p role="status" className="text-xs text-muted-foreground">{importAviso}</p>}
          </section>

          <section aria-labelledby="expresiones-titulo" className="space-y-3 rounded-lg border bg-card p-4">
            <h3 id="expresiones-titulo" className="font-medium">Expresiones</h3>
            <div className="flex flex-wrap gap-2">
              {EXPRESIONES_EMOCION.map((clave) => {
                const activa = (editor.adn.expresionBase[clave] ?? 0) >= 1;
                return (
                  <Button
                    key={clave} type="button" size="sm" variant={activa ? "default" : "outline"}
                    aria-pressed={activa} className="cursor-pointer"
                    onClick={() => {
                      for (const otra of EXPRESIONES) aplicar({ op: "expresion", clave: otra, valor: otra === clave ? 1 : 0 });
                    }}
                  >
                    {ETIQUETAS_EXPRESION[clave] ?? clave}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Las expresiones son las de VRM 1.0. También puedes dictarlas («sonríe», «más tranquilo»).</p>
          </section>

          <section aria-labelledby="aura-titulo" className="space-y-4 rounded-lg border bg-card p-4">
            <h3 id="aura-titulo" className="font-medium">Aura</h3>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="aura-tono">Tono</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{editor.adn.aura.tono}°</span>
              </div>
              <input
                id="aura-tono" type="range" min={0} max={359} step={1} value={editor.adn.aura.tono}
                aria-valuetext={`${editor.adn.aura.tono} grados`}
                onChange={(e) => aplicar({ op: "aura", campo: "tono", valor: Number(e.target.value) })}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                style={{ background: "linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)" }}
              />
            </div>
            <Deslizador
              id="aura-intensidad" etiqueta="Intensidad" valor={editor.adn.aura.intensidad}
              alCambiar={(valor) => aplicar({ op: "aura", campo: "intensidad", valor })}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox" checked={editor.adn.aura.ligadaEmocion}
                onChange={(e) => aplicar({ op: "aura", campo: "ligadaEmocion", valor: e.target.checked })}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              El aura sigue la emoción del bot
            </label>
          </section>

          <section aria-labelledby="movimiento-avatar-titulo" className="space-y-4 rounded-lg border bg-card p-4">
            <h3 id="movimiento-avatar-titulo" className="font-medium">Carácter del movimiento</h3>
            {(Object.keys(ETIQUETAS_MOVIMIENTO) as Array<keyof typeof ETIQUETAS_MOVIMIENTO>).map((campo) => (
              <Deslizador
                key={campo} id={`movimiento-${campo}`} etiqueta={ETIQUETAS_MOVIMIENTO[campo]}
                valor={editor.adn.movimiento[campo]}
                alCambiar={(valor) => aplicar({ op: "movimiento", campo, valor })}
              />
            ))}
            <p className="text-xs text-muted-foreground">El mismo carácter alimenta el motor único de movimiento (vivo, fluido, ligero o quieto) en todos los equipos.</p>
          </section>

          <section aria-labelledby="visibilidad-titulo" className="space-y-3 rounded-lg border bg-card p-4">
            <h3 id="visibilidad-titulo" className="font-medium">Visibilidad</h3>
            <select
              id="visibilidad" value={editor.adn.visibilidad}
              onChange={(e) => aplicar({ op: "visibilidad", valor: e.target.value as Visibilidad })}
              className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
            >
              {VISIBILIDADES_UI.map((v) => <option key={v.valor} value={v.valor}>{v.etiqueta}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Hoy «grupo» y «público» solo etiquetan: no se publica ni se comparte nada todavía.</p>
          </section>
        </div>
        <aside className="order-1 lg:order-2">
          <div className="sticky top-4 space-y-3 rounded-lg border bg-card p-4">
            <div className="mx-auto aspect-square max-w-[280px]">
              <AvatarVivo adn={editor.adn} tamano="100%" />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {editor.adn.base.tipo === "orbe" ? "Orbe del dueño" : `Base ${editor.adn.base.tipo} · revisión ${editor.adn.rev}`}
            </p>
          </div>
        </aside>
      </div>

      <section aria-labelledby="voz-avatar-titulo" className="space-y-3 rounded-lg border bg-card p-4">
        <h3 id="voz-avatar-titulo" className="font-medium">Voz y texto</h3>
        <form onSubmit={enviarFormulario} className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="frase-avatar">Dile cómo quieres el avatar</Label>
            <Input
              id="frase-avatar" value={frase} onChange={(e) => setFrase(e.target.value)}
              placeholder="«pelo azul, ojos verdes, más alto, sonríe»"
              autoComplete="off"
            />
          </div>
          <Button
            type="button" variant={dictando ? "default" : "outline"} aria-pressed={dictando}
            className="cursor-pointer" onClick={alternarDictado}
            disabled={!dictadoSoportado}
            title={dictadoSoportado ? "Dictar con el micrófono del OS" : "Tu navegador no soporta dictado por voz."}
          >
            {dictando ? "Parar dictado" : "Micrófono"}
          </Button>
          <Button type="submit" className="cursor-pointer" disabled={!frase.trim()}>Aplicar</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          El dictado es el del OS (reutiliza su corrección de términos). Lo que no entiende se manda a Astraura, que solo puede devolver una lista JSON de cambios.
        </p>
        {errorDictado && <p role="alert" className="text-sm text-red-500">{errorDictado}</p>}
        {ultimaVoz && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{ultimaVoz.aplicados === 0 ? "No se aplicó ningún cambio." : `Se aplicaron ${ultimaVoz.aplicados} cambio(s).`}</p>
            {ultimaVoz.sinEntender.length > 0 && <p>No entendió: {ultimaVoz.sinEntender.join(", ")}.</p>}
            {ultimaVoz.aviso && <p role="status">{ultimaVoz.aviso}</p>}
          </div>
        )}
      </section>

      <section aria-labelledby="midi-avatar-titulo" className="space-y-3 rounded-lg border bg-card p-4">
        <h3 id="midi-avatar-titulo" className="font-medium">Mando MIDI</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 space-y-1">
            <Label htmlFor="deslizador-midi">Deslizador que mueve el CC</Label>
            <select
              id="deslizador-midi" value={editor.deslizador}
              onChange={(e) => fijarDeslizador(e.target.value as Morfologia)}
              disabled={Boolean(mapeoMidi)}
              className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {MORFOLOGIA.map((clave) => <option key={clave} value={clave}>{ETIQUETAS_MORFOLOGIA[clave]}</option>)}
            </select>
          </div>
          <Button
            type="button" variant={midi.estado === "conectado" ? "default" : "outline"}
            className="cursor-pointer" onClick={() => { void conectarMando(); }}
            disabled={!midiSoportado || midi.estado === "conectando"}
          >
            {midi.estado === "conectado" ? "Desconectar mando" : midi.estado === "conectando" ? "Pidiendo permiso…" : "Conectar mando MIDI"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {mapeoMidi
            ? "Se usa el mapeo de controles de la Protomolécula."
            : "Sin mapeo de la Protomolécula: el CC mueve el deslizador elegido. El permiso de MIDI solo se pide al pulsar el botón."}
        </p>
        {!midiSoportado && <p className="text-sm text-muted-foreground">{SIN_MIDI}.</p>}
        {midi.estado === "conectado" && (
          <p role="status" className="text-xs text-muted-foreground">
            {midi.aparatos.length ? `Conectado: ${midi.aparatos.join(", ")}.` : "Permiso concedido; esperando a que enchufes un mando."}
          </p>
        )}
        {midi.estado === "error" && <p role="alert" className="text-sm text-red-500">{midi.motivo}</p>}
      </section>

      {editor.aviso && (
        <p role="alert" className="flex items-start justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span>{editor.aviso}</span>
          <button type="button" className="cursor-pointer text-xs underline" onClick={limpiarAviso}>Cerrar</button>
        </p>
      )}
    </section>
  );
}
