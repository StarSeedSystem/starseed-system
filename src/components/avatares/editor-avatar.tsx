"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MORFOLOGIA, SLOTS_MATERIAL, SLOTS_PIEZA, EXPRESIONES, VISIBILIDADES, type Morfologia, type SlotMaterial, type SlotPieza, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { cambiosDesdeFrase } from "@/lib/avatares/adn/dictado";
import { sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { isDictationSupported, startDictation, type DictationHandle } from "@/lib/aurora/dictation";
import { hayMidi, pedirAccesoMidi, conectarMidi, type AccesoMidi } from "@/lib/protomolecula/adaptador-midi";
import { useEditorAvatar } from "@/lib/avatares/adaptadores/use-editor-avatar";

interface EditorAvatarProps {
  adn: AdnAvatar;
  onCambio?: (adn: AdnAvatar) => void;
  otrosPresentes?: number;
  piezasDisponibles?: Array<{ ref: string; nombre: string; slot?: SlotPieza }>;
  onImportarPieza?: () => void;
  onPedirAstraura?: (texto: string, sinEntender: string[]) => Promise<CambioAvatar[]>;
}

const MORFO_NOMBRES: Record<Morfologia, string> = {
  altura: "Altura",
  complexion: "Complexión",
  cabeza: "Cabeza",
  hombros: "Hombros",
  cintura: "Cintura",
  piernas: "Piernas",
  brazos: "Brazos",
  estilizado: "Estilizado",
};

const MATERIAL_NOMBRES: Record<SlotMaterial, string> = {
  piel: "Piel",
  cabello: "Cabello",
  ojos: "Ojos",
  "ropa-1": "Ropa",
  "ropa-2": "Ropa inferior",
  acento: "Acento",
  aura: "Aura",
};

const PIEZA_NOMBRES: Record<SlotPieza, string> = {
  cabeza: "Cabeza",
  cabello: "Cabello",
  torso: "Torso",
  piernas: "Piernas",
  cara: "Cara",
  pies: "Pies",
  manos: "Manos",
  "accesorio-1": "Accesorio 1",
  espalda: "Espalda",
  "accesorio-2": "Accesorio 2",
  mascota: "Mascota",
};

const EXPRESION_NOMBRES: Record<string, string> = {
  neutral: "Neutral",
  happy: "Feliz",
  angry: "Enfadado",
  sad: "Triste",
  relaxed: "Relajado",
  surprised: "Sorprendido",
};

const MOV_NOMBRES = {
  energia: "Energía",
  amplitud: "Amplitud",
  ritmo: "Ritmo",
  postura: "Postura",
};

export function EditorAvatar({
  adn,
  onCambio,
  otrosPresentes = 0,
  piezasDisponibles = [],
  onImportarPieza,
  onPedirAstraura,
}: EditorAvatarProps) {
  const {
    adnActual,
    aplicarCambio: aplicarCambioHook,
    deshacer,
    rehacer,
    puedeDeshacer,
    puedeRehacer,
    guardarAhora,
    enviarCambiosAhora,
  } = useEditorAvatar({ adnInicial: adn, otrosPresentes, onCambio });

  const [textoDictado, setTextoDictado] = useState("");
  const [escuchando, setEscuchando] = useState(false);
  const dictRef = useRef<DictationHandle | null>(null);
  const [sinEntender, setSinEntender] = useState<string[]>([]);
  const [mensajeAstraura, setMensajeAstraura] = useState<string | null>(null);
  const [cargandoAstraura, setCargandoAstraura] = useState(false);

  const [midiAcceso, setMidiAcceso] = useState<AccesoMidi | null>(null);
  const [midiConectado, setMidiConectado] = useState(false);
  const [midiMotivo, setMidiMotivo] = useState<string | null>(null);
  const [midiMapeo, setMidiMapeo] = useState<Partial<Record<string, Morfologia>>>({});
  const [deslizadorMidiSeleccionado, setDeslizadorMidiSeleccionado] = useState<Morfologia | "">("");

  const midiDesconectarRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dictRef.current?.stop();
      midiDesconectarRef.current?.();
    };
  }, []);

  const alternarMic = useCallback(() => {
    if (escuchando) {
      dictRef.current?.stop();
      dictRef.current = null;
      setEscuchando(false);
      return;
    }
    if (!isDictationSupported()) {
      setMensajeAstraura("El navegador no soporta dictado por voz.");
      return;
    }
    setSinEntender([]);
    setMensajeAstraura(null);
    setTextoDictado("");
    dictRef.current = startDictation({
      onInterim: (t) => setTextoDictado(t),
      onFinal: (t) => {
        setTextoDictado(t);
        procesarDictado(t);
      },
      onEnd: () => {
        setEscuchando(false);
      },
      onError: (m) => {
        setMensajeAstraura(m);
        setEscuchando(false);
      },
    });
    setEscuchando(true);
  }, []);

  const procesarDictado = useCallback(
    async (frase: string) => {
      if (!frase.trim()) return;
      const { cambios, sinEntender: sinEnt } = cambiosDesdeFrase(frase, adnActual);
      if (cambios.length > 0) {
        cambios.forEach((c) => aplicarCambioHook(c));
      }
      setSinEntender(sinEnt);
      if (sinEnt.length > 0) {
        if (!onPedirAstraura) {
          setMensajeAstraura("Sin modelo disponible para traducir lo que no se entiende.");
          return;
        }
        setCargandoAstraura(true);
        setMensajeAstraura(null);
        try {
          const resultado = await onPedirAstraura(frase, sinEnt);
          const cambiosValidos = resultado.map((c) => sanearCambio(c)).filter((c): c is CambioAvatar => c !== null);
          if (cambiosValidos.length === 0) {
            setMensajeAstraura("No se obtuvieron cambios válidos de Astraura.");
          } else {
            cambiosValidos.forEach((c) => aplicarCambioHook(c));
          }
        } catch {
          setMensajeAstraura("Error al pedir traducción a Astraura.");
        } finally {
          setCargandoAstraura(false);
        }
      }
    },
    [adnActual, aplicarCambioHook, onPedirAstraura],
  );

  const procesarTextoManual = useCallback(() => {
    if (!textoDictado.trim()) return;
    procesarDictado(textoDictado);
  }, [textoDictado, procesarDictado]);

  const conectarMidiHandler = useCallback(async () => {
    if (midiConectado) {
      midiDesconectarRef.current?.();
      midiDesconectarRef.current = null;
      setMidiConectado(false);
      setMidiAcceso(null);
      return;
    }
    setMidiMotivo(null);
    const res = await pedirAccesoMidi(typeof navigator !== "undefined" ? (navigator as any) : undefined);
    if (!res.ok) {
      setMidiMotivo(res.motivo);
      return;
    }
    setMidiAcceso(res.acceso);
    midiDesconectarRef.current = conectarMidi(res.acceso, (m) => {
      if (m.fuente.mensaje === "cc" && deslizadorMidiSeleccionado) {
        const val = m.bruto / 127;
        aplicarCambioHook({ op: "morfologia", clave: deslizadorMidiSeleccionado, valor: val });
      }
    });
    setMidiConectado(true);
  }, [midiConectado, deslizadorMidiSeleccionado, aplicarCambioHook]);

  const piezasPorSlot = useMemo(() => {
    const map = new Map<SlotPieza, string>();
    for (const p of adnActual.piezas) {
      map.set(p.slot, p.ref);
    }
    return map;
  }, [adnActual.piezas]);

  const aplicarMorfologia = useCallback(
    (clave: Morfologia, valor: number[]) => {
      aplicarCambioHook({ op: "morfologia", clave, valor: valor[0] });
    },
    [aplicarCambioHook],
  );

  const aplicarMaterialColor = useCallback(
    (slot: SlotMaterial, valor: string) => {
      aplicarCambioHook({ op: "material", slot, campo: "color", valor });
    },
    [aplicarCambioHook],
  );

  const aplicarPieza = useCallback(
    (slot: SlotPieza, ref: string | null) => {
      aplicarCambioHook({ op: "pieza", slot, ref });
    },
    [aplicarCambioHook],
  );

  const aplicarExpresion = useCallback(
    (clave: string, valor: number) => {
      const exprs = EXPRESIONES as readonly string[];
      if (!exprs.includes(clave)) return;
      for (const e of exprs) {
        if (e === clave) {
          aplicarCambioHook({ op: "expresion", clave: e as any, valor });
        } else {
          aplicarCambioHook({ op: "expresion", clave: e as any, valor: 0 });
        }
      }
    },
    [aplicarCambioHook],
  );

  const aplicarAura = useCallback(
    (campo: "tono" | "intensidad", valor: number[]) => {
      aplicarCambioHook({ op: "aura", campo, valor: valor[0] });
    },
    [aplicarCambioHook],
  );

  const aplicarMovimiento = useCallback(
    (campo: keyof typeof MOV_NOMBRES, valor: number[]) => {
      aplicarCambioHook({ op: "movimiento", campo, valor: valor[0] });
    },
    [aplicarCambioHook],
  );

  const aplicarVisibilidad = useCallback(
    (valor: string) => {
      if (VISIBILIDADES.includes(valor as any)) {
        aplicarCambioHook({ op: "visibilidad", valor: valor as any });
      }
    },
    [aplicarCambioHook],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Editor de Avatar</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={deshacer} disabled={!puedeDeshacer}>
            Deshacer
          </Button>
          <Button variant="outline" size="sm" onClick={rehacer} disabled={!puedeRehacer}>
            Rehacer
          </Button>
          <Button variant="outline" size="sm" onClick={enviarCambiosAhora}>
            Enviar ahora
          </Button>
          <Button variant="outline" size="sm" onClick={guardarAhora}>
            Guardar ahora
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voz y texto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={textoDictado}
              onChange={(e) => setTextoDictado(e.target.value)}
              placeholder="Di o escribe: pelo azul, más alto..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  procesarTextoManual();
                }
              }}
            />
            <Button onClick={alternarMic} variant={escuchando ? "destructive" : "outline"} size="icon" aria-label="Micrófono">
              {escuchando ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button onClick={procesarTextoManual} disabled={!textoDictado.trim() || cargandoAstraura}>
              {cargandoAstraura ? "Traduciendo..." : "Aplicar"}
            </Button>
          </div>
          {sinEntender.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span>Sin entender: </span>
              {sinEntender.map((s, i) => (
                <Badge key={i} variant="outline" className="mr-1">
                  {s}
                </Badge>
              ))}
            </div>
          )}
          {mensajeAstraura && <p className="text-xs text-amber-500">{mensajeAstraura}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MIDI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button onClick={conectarMidiHandler} variant={midiConectado ? "destructive" : "outline"}>
              {midiConectado ? "Desconectar MIDI" : "Conectar MIDI"}
            </Button>
            {!hayMidi() && <span className="text-xs text-muted-foreground">Este navegador no ofrece MIDI</span>}
          </div>
          {midiMotivo && <p className="text-xs text-amber-500">{midiMotivo}</p>}
          {midiConectado && (
            <div className="flex items-center gap-2">
              <Label className="text-xs">CC → deslizador</Label>
              <Select value={deslizadorMidiSeleccionado} onValueChange={(v) => setDeslizadorMidiSeleccionado(v as Morfologia)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Elegir deslizador" />
                </SelectTrigger>
                <SelectContent>
                  {MORFOLOGIA.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MORFO_NOMBRES[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Morfología</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {MORFOLOGIA.map((m) => {
            const valor = adnActual.morfologia[m] ?? 0.5;
            return (
              <div key={m} className="space-y-1">
                <div className="flex justify-between">
                  <Label className="text-xs">{MORFO_NOMBRES[m]}</Label>
                  <span className="text-xs text-muted-foreground">{valor.toFixed(2)}</span>
                </div>
                <Slider value={[valor]} min={0} max={1} step={0.01} onValueChange={(v) => aplicarMorfologia(m, v)} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Color por ranura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SLOTS_MATERIAL.map((slot) => {
            const color = adnActual.materiales[slot]?.color || "#7c5cff";
            return (
              <div key={slot} className="flex items-center justify-between">
                <Label className="text-xs">{MATERIAL_NOMBRES[slot]}</Label>
                <input type="color" value={color} onChange={(e) => aplicarMaterialColor(slot, e.target.value)} className="h-8 w-16 cursor-pointer rounded border" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Piezas por ranura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SLOTS_PIEZA.map((slot) => {
            const refActual = piezasPorSlot.get(slot) || "";
            return (
              <div key={slot} className="space-y-1">
                <Label className="text-xs">{PIEZA_NOMBRES[slot]}</Label>
                <div className="flex gap-2">
                  <Select value={refActual || "none"} onValueChange={(v) => aplicarPieza(slot, v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin pieza" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin pieza</SelectItem>
                      {piezasDisponibles
                        .filter((p) => !p.slot || p.slot === slot)
                        .map((p) => (
                          <SelectItem key={p.ref} value={p.ref}>
                            {p.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
          {onImportarPieza && (
            <Button variant="outline" size="sm" onClick={onImportarPieza}>
              Importar pieza
            </Button>
          )}
          {piezasDisponibles.length === 0 && (
            <p className="text-xs text-muted-foreground">No hay piezas disponibles. Ofrece importar.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expresiones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {["neutral", "happy", "angry", "sad", "relaxed", "surprised"].map((expr) => {
            const valor = adnActual.expresionBase[expr as any] ?? 0;
            return (
              <div key={expr} className="space-y-1">
                <div className="flex justify-between">
                  <Label className="text-xs">{EXPR_NOMBRES[expr]}</Label>
                  <span className="text-xs text-muted-foreground">{valor.toFixed(2)}</span>
                </div>
                <Slider value={[valor]} min={0} max={1} step={0.01} onValueChange={(v) => aplicarExpresion(expr, v[0])} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between">
              <Label className="text-xs">Tono</Label>
              <span className="text-xs text-muted-foreground">{adnActual.aura.tono}</span>
            </div>
            <Slider value={[adnActual.aura.tono]} min={0} max={360} step={1} onValueChange={(v) => aplicarAura("tono", v)} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <Label className="text-xs">Intensidad</Label>
              <span className="text-xs text-muted-foreground">{adnActual.aura.intensidad.toFixed(2)}</span>
            </div>
            <Slider value={[adnActual.aura.intensidad]} min={0} max={1} step={0.01} onValueChange={(v) => aplicarAura("intensidad", v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carácter del movimiento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(MOV_NOMBRES) as Array<keyof typeof MOV_NOMBRES>).map((campo) => {
            const valor = adnActual.movimiento[campo];
            return (
              <div key={campo} className="space-y-1">
                <div className="flex justify-between">
                  <Label className="text-xs">{MOV_NOMBRES[campo]}</Label>
                  <span className="text-xs text-muted-foreground">{valor.toFixed(2)}</span>
                </div>
                <Slider value={[valor]} min={0} max={1} step={0.01} onValueChange={(v) => aplicarMovimiento(campo, v)} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visibilidad</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={adnActual.visibilidad} onValueChange={aplicarVisibilidad}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILIDADES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}

export default EditorAvatar;
