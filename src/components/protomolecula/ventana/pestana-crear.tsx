"use client";
/**
 * Ventana de la Protomolécula · pestaña «Crear» (la principal). Se le puede pedir cualquier cosa —un objeto 3D
 * animado, un cambio directo o en una rama, el diseño o las funciones de lo que tienes delante— sin salir del
 * contexto: chip de lo que hay delante, barra de petición (texto y voz), vista previa del plan con el gobierno
 * que aplica, herramientas que cambian con el contexto y las peticiones recientes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContextoProto, ModoEdicion } from "@/lib/protomolecula/peticion/contrato";
import { BarraPeticion } from "./barra-peticion";
import { ChipContexto } from "./chip-contexto";
import { entidadGobernante, etiquetaContexto } from "./contexto";
import { herramientasPara, sugerenciaPara } from "./herramientas";
import { borrarHistorial, leerHistorial, recordarPeticion } from "./historial";
import { ListaHistorial } from "./lista-historial";
import { RejillaHerramientas } from "./rejilla-herramientas";
import { type EntradaHistorial, type HerramientaVentana, type PestanaVentana } from "./tipos";
import { usePeticion } from "./use-peticion";
import { Cargando, ErrorPeticion, Resultado } from "./vista-estado";
import { VistaPlan } from "./vista-plan";
import { VistaPropuesta } from "./vista-propuesta";

export interface PestanaCrearProps {
  contexto: ContextoProto;
  alAbrirLienzo: () => void;
  irAPestana: (p: PestanaVentana) => void;
}

export function PestanaCrear({ contexto, alAbrirLienzo, irAPestana }: PestanaCrearProps) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<ModoEdicion>("directo");
  const [historial, setHistorial] = useState<EntradaHistorial[]>(() => leerHistorial());
  const [aviso, setAviso] = useState<string | null>(null);
  const [foco, setFoco] = useState(0);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const { estado, ocupado, pedir, lanzarPlan, confirmar, volverAlPlan, cancelar, deshacer, reglasLocales } = usePeticion(contexto);
  const herramientas = useMemo(() => herramientasPara(contexto), [contexto]);
  const gobierna = entidadGobernante(contexto);

  // Enfocar la barra y dejar el cursor al final cuando una herramienta rellena la frase.
  useEffect(() => {
    if (foco === 0) return;
    const el = entrada.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [foco]);

  const enviar = useCallback((t: string) => {
    setAviso(null);
    setHistorial(recordarPeticion({ texto: t, modo, ruta: contexto.ruta, donde: etiquetaContexto(contexto), en: Date.now() }));
    setTexto("");
    void pedir(t, modo);
  }, [contexto, modo, pedir]);

  /** Cierra la espera, el plan o el error y devuelve a la barra lo que se había escrito, para no perderlo. */
  const cerrar = useCallback(() => {
    if ((estado.fase === "planificando" || estado.fase === "plan" || estado.fase === "error") && estado.texto) setTexto(estado.texto);
    cancelar();
  }, [estado, cancelar]);

  const elegir = useCallback((h: HerramientaVentana) => {
    setAviso(null);
    const a = h.accion;
    if (a.tipo === "plan") { lanzarPlan(a.plan, "humano"); return; }
    if (a.tipo === "lienzo") { alAbrirLienzo(); return; }
    if (a.tipo === "pestana") { irAPestana(a.destino); return; }
    if (estado.fase !== "reposo") cancelar();
    setTexto(a.texto);
    if (a.modo) setModo(a.modo);
    setFoco((n) => n + 1);
  }, [alAbrirLienzo, cancelar, estado.fase, irAPestana, lanzarPlan]);

  const rehacerDesdeHistorial = (e: EntradaHistorial) => {
    if (estado.fase !== "reposo") cancelar();
    setTexto(e.texto);
    setModo(e.modo);
    setFoco((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <ChipContexto contexto={contexto} />
      <BarraPeticion
        valor={texto}
        alCambiar={setTexto}
        modo={modo}
        alCambiarModo={setModo}
        alEnviar={enviar}
        ocupado={ocupado}
        placeholder={sugerenciaPara(contexto)}
        entradaRef={entrada}
      />

      {estado.fase === "planificando" && <Cargando texto="Astraura está pensando el plan…" alCancelar={cerrar} />}
      {estado.fase === "ejecutando" && <Cargando texto="Aplicando el plan…" />}
      {estado.fase === "plan" && (
        <VistaPlan plan={estado.plan} veredicto={estado.veredicto} texto={estado.texto} alConfirmar={confirmar} alCancelar={cerrar} />
      )}
      {estado.fase === "propuesta" && (
        <VistaPropuesta
          plan={estado.plan}
          veredicto={estado.veredicto}
          gobierna={gobierna}
          alVolver={volverAlPlan}
          alCrear={() => { cancelar(); setAviso("Propuesta creada: la decidirá el gobierno de la entidad según sus reglas."); }}
        />
      )}
      {estado.fase === "hecho" && <Resultado estado={estado} alDeshacer={() => void deshacer()} alCerrar={cancelar} />}
      {estado.fase === "error" && (
        <ErrorPeticion
          estado={estado}
          alReintentar={() => void pedir(estado.texto, modo)}
          alUsarReglasLocales={() => reglasLocales(estado.texto)}
          alCerrar={cerrar}
        />
      )}
      {aviso && <p role="status" className="rounded-2xl border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 text-xs">{aviso}</p>}

      <RejillaHerramientas herramientas={herramientas} alElegir={elegir} deshabilitadas={ocupado} />
      <ListaHistorial entradas={historial} alElegir={rehacerDesdeHistorial} alBorrar={() => { borrarHistorial(); setHistorial([]); }} />
    </div>
  );
}

export default PestanaCrear;
