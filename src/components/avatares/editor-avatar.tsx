"use client";

import { act, useCallback, useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEditorAvatar } from "@/lib/avatares/adaptadores/use-editor-avatar";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { cambiarVisibilidad } from "@/lib/avatares/adn/permisos";
import { COLORES } from "@/lib/aurora/voz-starseed/dictado";
import type { Expresion } from "@/lib/avatares/adn/adn";

interface MorfologiaSlider {
  clave: (typeof MORFOLOGIA)[number];
  valor: number;
  paso: number;
}

const MORFOLOGIA: readonly string[] = ["altura", "complexion", "cabeza", "hombros", "cintura", "piernas", "brazos", "estilizado"];
const CAMPOS_MATERIAL = ["color", "metal", "rugosidad", "emisivo"];

function esColor(c: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(c);
}

function usoLicenciaAString(uso: (typeof USOS_LICENCIA)[number]): string {
  switch (uso) {
    case "libre": return "Libre";
    case "atribucion": return "Atribución";
    case "condicionado": return "Condicionado";
    case "no-comercial": return "No comercial";
    case "restringido-region": return "Restringido región";
    default: return String(uso);
  }
}

export default function EditorAvatar() {
  const {
    adn,
    setAdn,
    historial,
    historialIndice,
    visibilidad,
    setVisibilidad,
    aplicarCambio,
    deshacer,
    rehacer,
    guardar,
    cambiarVisibilidad,
    dictado,
    sincronizarLote,
    sincronizarGuardar,
  } = useEditorAvatar(adn);

  const [frase, setFrase] = useState("");
  const [resultadosDictado, setResultadosDictado] = useState<{ cambios: import("@/lib/avatares/adn/cambios").CambioAvatar[]; sinEntender: string[] }>({ cambios: [], sinEntender: [] });
  const [micActivo, setMicActivo] = useState(false);
  const [otrosPresentes, setOtrosPresentes] = useState(0);
  const [ahoraRef, setAhoraRef] = useState(Date.now());

  // Simulate fake clock for tests
  useEffect(() => { setAhoraRef(Date.now()); }, []);

  const manejarCambioFrase = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFrase(e.target.value);
  }, []);

  const ejecutarDictado = useCallback(() => {
    const r = dictado(frase);
    setResultadosDictado(r);
    setFrase("");
  }, [frase, dictado]);

  const aplicarCambiosDictado = useCallback(() => {
    if (resultadosDictado.cambios.length === 0) return;
    const aplicados = resultadosDictado.cambios.every((c) => aplicarCambio(c));
    if (aplicados) {
      setResultadosDictado({ cambios: [], sinEntender: [] });
    }
  }, [resultadosDictado.cambios]);

  // Sincronizar lote cada "frame" simulado
  useEffect(() => {
    const intervalo = setInterval(() => {
      const loteActual = sincronizarLote(otrosPresentes, Date.now());
      if (loteActual && loteActual.length > 0) {
        // Emisión en vivo: aplicar todos los cambios del lote
        loteActual.forEach((c) => aplicarCambio(c));
      }
    }, 100);
    return () => clearInterval(intervalo);
  }, [sincronizarLote, otrosPresentes]);

  // Sincronizar guarda con calma
  useEffect(() => {
    const intervalo = setInterval(() => {
      const p = {
        sinGuardar: sinGuardarRef.current,
        ultimoCambio: ultimaGuardadoRef.current,
        ultimoGuardado: ultimaGuardadoRef.current,
        ahora: Date.now(),
        cerrando: false,
      };
      if (sincronizarGuardar(p)) {
        guardar().then((ok) => {
          if (ok) setResultadosDictado({ cambios: [], sinEntender: [] });
        });
      }
    }, 1000);
    return () => clearInterval(intervalo);
  }, [sincronizarGuardar, guardar]);

  // Historial visual: sliders de morfología
  const morfologiaSliders = useMemo(() => {
    const sliders: MorfologiaSlider[] = [];
    for (const clave of MORFOLOGIA as readonly string[]) {
      const valor = adn?.morfologia?.[clave] ?? 0.5;
      sliders.push({ clave, valor, paso: 0.05 });
    }
    return sliders;
  }, [adn]);

  // Materiales actuales por ranura
  const materialesActuales = useMemo(() => {
    const m: Record<string, string> = {};
    if (!adn) return m;
    for (const slot of ["piel", "cabello", "ojos", "ropa-1", "ropa-2", "acento", "aura"] as const) {
      const mat = adn.materiales?.[slot];
      if (mat && mat.color) m[slot] = mat.color;
    }
    return m;
  }, [adn]);

  // Expresiones actuales
  const expresionesActuales = useMemo(() => {
    const e: Record<string, number> = {};
    if (adn) {
      for (const exp of ["neutral", "happy", "angry", "sad", "relaxed", "surprised"] as const) {
        e[exp] = adn.expresionBase?.[exp] ?? 0;
      }
    }
    return e;
  }, [adn]);

  // Aura actual
  const auraActual = useMemo(() => {
    if (!adn) return { tono: 260, intensidad: 0.6, ligadaEmocion: true };
    return {
      tono: adn.aura.tono,
      intensidad: adn.aura.intensidad,
      ligadaEmocion: adn.aura.ligadaEmocion,
    };
  }, [adn]);

  // Movimiento actual
  const movimientoActual = useMemo(() => {
    if (!adn) return { energia: 0.5, amplitud: 0.5, ritmo: 0.5, postura: 0.5 };
    return { ...adn.movimiento };
  }, [adn]);

  // Piezas actuales
  const piezasActuales = useMemo(() => {
    if (!adn) return [] as const;
    return [...adn.piezas];
  }, [adn]);

  return (
    <div className="space-y-6">
      {/* Visibilidad */}
      <div>
        <h3 className="text-lg font-semibold">Visibilidad</h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={visibilidad === "privado"}
            onClick={() => cambiarVisibilidad("privado")}
            className={cn("cursor-pointer rounded-lg border p-2 transition-all disabled:opacity-50", visibilidad === "privado" ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground")}
          >
            Privado
          </button>
          <button
            type="button"
            disabled={visibilidad === "grupo"}
            onClick={() => cambiarVisibilidad("grupo")}
            className={cn("cursor-pointer rounded-lg border p-2 transition-all disabled:opacity-50", visibilidad === "grupo" ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground")}
          >
            Grupo
          </button>
          <button
            type="button"
            disabled={visibilidad === "publico"}
            onClick={() => cambiarVisibilidad("publico")}
            className={cn("cursor-pointer rounded-lg border p-2 transition-all disabled:opacity-50", visibilidad === "publico" ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground")}
          >
            Público
          </button>
        </div>
      </div>

      {/* Morphology sliders */}
      <div>
        <h3 className="text-lg font-semibold">Morfología</h3>
<div className="grid grid-cols-4 gap-3">
          {MORFOLOGIA.map((clave, i) => (
            <>
              <Slider
                key={clave}
                min={0}
                max={1}
                step={0.05}
                value={adn?.morfologia?.[clave] ?? 0.5}
                onValueChange={(v) => {
                  aplicarCambio({ op: "morfologia", clave: clave as (typeof MORFOLOGIA)[number], valor: v });
                }}
              />
            </>
          ))}
        </div>
      </div>

      {/* Material colors */}
      <div>
        <h3 className="text-lg font-semibold">Colores por ranura</h3>
        <div className="grid grid-cols-7 gap-2">
          {["piel", "cabello", "ojos", "ropa-1", "ropa-2", "acento", "aura"].map((slot) => (
            <div key={slot} className="relative">
              <label
                className="cursor-pointer rounded-lg border p-2 transition-all disabled:opacity-50"
                style={{ background: materialesActuales[slot] || "#fff", color: materialesActuales[slot] || "#000" }}
                onClick={() => {
                  // Cycle through colors
                  const colorActual = materialesActuales[slot];
                  const nuevoColor = Object.keys(COLORES).find((c) => COLORES[c] === colorActual) || Object.keys(COLORES)[0];
                  const indiceActual = Object.keys(COLORES).indexOf(nuevoColor);
                  const siguiente = Object.keys(COLORES)[(indiceActual + 1) % Object.keys(COLORES).length];
                  aplicarCambio({ op: "material", slot: slot as (typeof SLOTS_MATERIAL)[number], campo: "color", valor: COLORES[siguiente] });
                }}
                title="Clic para cambiar color"
                aria-label={`Cambiar color de ${slot}`}
              >
                <span className="absolute right-2 top-2 w-4 h-4 rounded-full" style={{ background: materialesActuales[slot] || "#fff" }} />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Piezas */}
      <div>
        <h3 className="text-lg font-semibold">Piezas por ranura</h3>
        <div className="grid grid-cols-7 gap-1">
          {["cabeza", "cabello", "torso", "piernas", "cara", "pies", "manos", "accesorio-1", "espalda", "accesorio-2", "mascota"].map((slot) => (
            <div key={slot} className="relative flex flex-col items-center gap-1">
              <label
                className="cursor-pointer rounded border p-1 transition-all disabled:opacity-50 select-none"
                style={{
                  background: adn?.piezas?.find((p) => p.slot === slot)?.ref ? COLORES.azul : "#f3f4f6",
                  color: adn?.piezas?.find((p) => p.slot === slot)?.ref ? "#fff" : "#6b7280",
                }}
                title="Pieza"
                aria-label={`Pieza ${slot}`}
              >
                {adn?.piezas?.find((p) => p.slot === slot)?.ref ? "●" : "○"}
              </label>
              <span className="text-xs text-muted-foreground">{slot}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Expressions */}
      <div>
        <h3 className="text-lg font-semibold">Expresiones</h3>
        <div className="grid grid-cols-6 gap-2">
          {"neutral happy angry sad relaxed surprised".split(" ").map((exp) => (
            <div key={exp} className="relative">
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={adn?.expresionBase?.[exp as Expresion] ?? 0}
                onChange={(e) =>
                  aplicarCambio({ op: "expresion", clave: exp as Expresion, valor: Number(e.target.value) })
                }
                className="w-full"
              />
              <span className="absolute right-2 top-1 text-xs text-muted-foreground">{exp}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Aura */}
      <div>
        <h3 className="text-lg font-semibold">Aura</h3>
        <div className="grid grid-cols-3 gap-2">
          <Slider
            min={0}
            max={360}
            step={1}
            value={auraActual.tono}
            onValueChange={(v) => aplicarCambio({ op: "aura", campo: "tono", valor: v })}
            className="w-full"
          />
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={auraActual.intensidad}
            onValueChange={(v) => aplicarCambio({ op: "aura", campo: "intensidad", valor: v })}
            className="w-full"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => aplicarCambio({ op: "aura", campo: "ligadaEmocion", valor: !auraActual.ligadaEmocion })}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm"
            aria-label="Alternar aura ligada a emoción"
          >
            {auraActual.ligadaEmocion ? "Ligado a emoción" : "Independiente"}
          </Button>
        </div>
      </div>

      {/* Movement character */}
      <div>
        <h3 className="text-lg font-semibold">Carácter del movimiento</h3>
        <div className="grid grid-cols-4 gap-2">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={movimientoActual.energia}
            onValueChange={(v) => aplicarCambio({ op: "movimiento", campo: "energia", valor: v })}
            className="w-full"
          />
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={movimientoActual.amplitud}
            onValueChange={(v) => aplicarCambio({ op: "movimiento", campo: "amplitud", valor: v })}
            className="w-full"
          />
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={movimientoActual.ritmo}
            onValueChange={(v) => aplicarCambio({ op: "movimiento", campo: "ritmo", valor: v })}
            className="w-full"
          />
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={movimientoActual.postura}
            onValueChange={(v) => aplicarCambio({ op: "movimiento", campo: "postura", valor: v })}
            className="w-full"
          />
        </div>
      </div>

      {/* Voice dictation */}
      <div>
        <h3 className="text-lg font-semibold">Dictado de voz</h3>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Di algo como 'pelo azul, ojos verdes y aura dorada'"
            value={frase}
            onChange={manejarCambioFrase}
            className="w-full"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={ejecutarDictado}
            disabled={micActivo}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm"
            aria-label="Ejecutar dictado de voz"
          >
            {micActivo ? "Escuchando..." : "Dictado"}
          </Button>
        </div>
        {resultadosDictado.sinEntender.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            No entendido: {" ".join(resultadosDictado.sinEntender)} — se enviará a Astraura para traducción
          </p>
        )}
        {resultadosDictado.cambios.length > 0 && (
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={aplicarCambiosDictado}
              className="cursor-pointer rounded-md px-2 py-1 text-xs"
              aria-label="Aplicar cambios del dictado"
            >
              Aplicar cambios entendidos
            </Button>
          </div>
        )}
      </div>

      {/* Undo/Redo */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={deshacer}
          disabled={historialIndice <= 0}
          className="cursor-pointer rounded-md p-1 hover:bg-muted"
          aria-label="Deshacer cambio"
        >
          ←
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={rehacer}
          disabled={historialIndice >= historial.length || historial.length === 0}
          className="cursor-pointer rounded-md p-1 hover:bg-muted"
          aria-label="Rehacer cambio"
        >
          →
        </Button>
      </div>

      {/* Save */}
      <Button
        onClick={guardar}
        className="w-full"
        aria-label="Guardar avatar en la Biblioteca"
      >
        {guardar ? "Guardando..." : "Guardar avatar"}
      </Button>
    </div>
  );
}