"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { ResultadoTraductor, ParIdiomas, IdMotor } from "@/lib/traductor/tipos";
import { leerEnVoz, detener } from "@/lib/idiomas/leer-en-voz";

export interface PanelTextoProps {
  servicio: {
    traducir: (texto: string, destino: string) => Promise<ResultadoTraductor>;
  };
  voz: boolean;
  toggleTraducirMientrasEscribe?: boolean;
}

export interface PanelTextoState {
  origen: string;
  destino: string;
  textoOrigen: string;
  textoResultado: string;
  loading: boolean;
  motor: IdMotor | "";
  error: string | "";
  necesitaAviso: boolean;
}

export async function traducirInterno(texto: string, destino: string, servicio: { traducir: (texto: string, destino: string) => Promise<ResultadoTraductor> }): Promise<{texto:string;motor:string}> {
  const r = await servicio.traducir(texto, destino);
  return { texto: r.texto, motor: r.motor };
}

export function PanelTexto({ servicio, voz, toggleTraducirMientrasEscribe = false }: PanelTextoProps) {
  const [state, setState] = useState<PanelTextoState>({
    origen: "auto",
    destino: "",
    textoOrigen: "",
    textoResultado: "",
    loading: false,
    motor: "",
    error: "",
    necesitaAviso: false,
  });

  const [pauseId, setPauseId] = useState<any>(null);
  const [mostrarAviso, setMostrarAviso] = useState(false);

  const searchParams = useSearchParams();
  const textoURL = searchParams.get("texto") || "";
  const deURL = searchParams.get("de") || "";
  const aURL = searchParams.get("a") || "";

  useEffect(() => {
    if (textoURL) setState((s) => ({ ...s, textoOrigen: textoURL }));
    if (deURL) setState((s) => ({ ...s, origen: deURL }));
    if (aURL) setState((s) => ({ ...s, destino: aURL }));
  }, [textoURL, deURL, aURL]);

  const handleTraducir = async () => {
    const { textoOrigen, destino, origen } = state;
    if (!textoOrigen.trim()) {
      setState((s) => ({ ...s, error: "No hay texto para traducir." }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: "", motor: "" }));
    try {
      const resultado = await servicio.traducir(textoOrigen, destino);
      setState((s) => ({
        ...s,
        textoResultado: resultado.texto,
        motor: resultado.motor,
        loading: false,
        error: resultado.aviso ?? "",
      }));
      if (resultado.aviso && voz) {
        setMostrarAviso(true);
        setTimeout(() => setMostrarAviso(false), 5000);
      }
    } catch (e: any) {
      const mensaje = e instanceof Error ? e.message : "Error desconocido";
      setState((s) => ({ ...s, loading: false, error: mensaje }));
    }
  };

  const handleCopiar = () => {
    const texto = state.textoResultado;
    if (!texto) return;
    navigator.clipboard.writeText(texto).catch(() => {});
  };

  const handleLeerEnVoz = () => {
    if (!voz) {
      // Si no hay voz, avisa
      setState((s) => ({ ...s, error: "El motor de voz no está disponible." }));
      return;
    }
    if (!state.textoResultado) return;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) {
      setState((s) => ({ ...s, error: "No hay síntesis de voz en este entorno." }));
      return;
    }
    const utter = new (window.SpeechSynthesisUtterance || (() => {}))(state.textoResultado);
    utter.lang = state.destino || "es";
    synth.speak(utter);
  };

  const handleAviso = () => {
    setMostrarAviso(true);
    const timeout = setTimeout(() => setMostrarAviso(false), 3000);
    setPauseId(timeout);
  };

  useEffect(() => {
    return () => {
      if (pauseId) clearTimeout(pauseId);
    };
  }, [pauseId]);

  // Efecto para leer URL y llenar caja (click‑derecho)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txt = params.get("texto") || "";
    const de = params.get("de") || "";
    const a = params.get("a") || "";
    if (txt || de || a) {
      setState((s) => ({ ...s, textoOrigen: txt, origen: de, destino: a }));
    }
  }, []);

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const valor = e.target.value.slice(0, 5000);
    setState((s) => ({ ...s, textoOrigen: valor }));
    if (toggleTraducirMientrasEscribe) {
      clearTimeout(pauseId ?? 0); // simplificado
      const id = setTimeout(handleTraducir, 600);
      setPauseId(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Caja de origen con contador de caracteres */}
      <div>
        <textarea
          value={state.textoOrigen}
          onChange={onInput}
          maxLength={5000}
          rows={4}
          className="w-full rounded border border-white/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 placeholder-gray-400"
        />
        <div className="text-xs text-gray-500">
          {state.textoOrigen.length}/{5000} caracteres
        </div>
      </div>

      {/* Caja de resultado de solo lectura */}
      <div>
        <p className="w-full rounded border border-white/15 p-3 text-sm text-white/80 bg-gray-900/50"
          {state.textoResultado || "—"}
        </p>
      </div>

      {/* controles */}
      <div className="flex gap-2">
        <button
          onClick={handleTraducir}
          className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-white/10"
          disabled={state.loading}
        >
          Traducir
        </button>
        <button
          onClick={handleCopiar}
          className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-white/10"
        >
          Copiar
        </button>
        <button
          onClick={handleLeerEnVoz}
          className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-white/10"
        >
          {voz ? "Leer en voz" : "Sin voz"}
        </button>
      </div>

      {/* Motor y aviso */}
      <div className="mt-2 text-xs text-gray-400">
        {state.motor && (
          <span>
            Motor: {state.motor} ·{" "}
            <span
              onClick={handleAviso}
              className="underline cursor-pointer"
              title="Abrir diálogo TU20"
            >
              en tu aparato / sale a …
            </span>
          </span>
        )}
        {mostrarAviso && (
          <p className="mt-1 text-white/70">Aviso: {state.error || "traducción completada"}</p>
        )}
      </div>

      {/* Errores en palabras (mostrar si hay) */}
      {state.error && (
        <p className="mt-1 text-red-400 text-xs">Error: {state.error}</p>
      )}
    </div>
  );
}