"use client";
/**
 * Imágenes de Astraura · HOOK DE LA TARJETA DE OPCIONES (IMG1011C). Contrato: architecture/astraura-imagenes.md §6.
 *
 * La GENERACIÓN NO se duplica (regla de oro intacta): `generateImage` de media-gen reparte por
 * capas con el proveedor «neuronas» (IMG1011B) y devuelve la galería con modelo, licencia y
 * atribución por opción. Aquí solo se guarda el estado (lógica pura en `estado-tarjeta.ts`) y se
 * ejecutan las acciones sobre la opción elegida: elegir, variar (otra semilla), editar en la
 * Protomolécula, ampliar, usar como referencia 3D, guardar en la Biblioteca y borrador de
 * publicación. Nada publica ni sondea Supabase. El generador es inyectable para probar sin red.
 */
import { useCallback, useState } from "react";
import { generateImage } from "@/ai/astraura/media/media-gen";
import { MODELOS_IMAGEN } from "@/lib/imagenes/modelos";
import { saveResource } from "@/lib/library-store";
import { abrirImagenEnProtomolecula } from "@/lib/protomolecula/editor";
import { borradorDePublicacion } from "@/lib/publicacion/borrador";
import { guardarReferencia3D } from "@/lib/avatares/referencia3d";
import { estadoInicial, opcionesDeMedia, opcionesDeResultado, opcionesTrasVariar, providerDeCapa, type DependenciasTarjeta, type EstadoTarjeta, type PeticionTarjeta } from "./estado-tarjeta";
import type { OpcionGaleria } from "@/ai/astraura/media/proveedor-neuronas";

/** Modelo por su nombre (la galería cifra el modelo en su NAME visible): id para pedir la variación. */
export function modeloIdDeNombre(nombre: string | null): string | undefined {
  if (!nombre) return undefined;
  return MODELOS_IMAGEN.find((m) => m.nombre === nombre)?.id;
}

const sinImagen = (s: EstadoTarjeta, texto: string): EstadoTarjeta => ({ ...s, error: texto });

export function useTarjetaImagenes(d: DependenciasTarjeta = {}) {
  const generador = d.generar ?? generateImage;
  const [peticion, setPeticion] = useState<PeticionTarjeta | null>(null);
  const [estado, setEstado] = useState<EstadoTarjeta>(estadoInicial);

  const generarOpciones = useCallback(async (p: PeticionTarjeta) => {
    setPeticion(p);
    setEstado({ ...estadoInicial, cargando: true });
    try {
      const r = await generador(opcionesDeMedia(p));
      const opciones = opcionesDeResultado(r).slice(0, 8);
      if (!opciones.length) {
        setEstado({ ...estadoInicial, descartes: r.galeria?.descartes ?? [], error: r.error ?? "Ninguna opción respondió ahora mismo; vuelve a intentarlo en unos segundos." });
        return;
      }
      setEstado({ ...estadoInicial, opciones, descartes: r.galeria?.descartes ?? [] });
    } catch (e) {
      setEstado({ ...estadoInicial, error: e instanceof Error && e.message ? e.message : "Error inesperado preparando las opciones." });
    }
  }, [generador]);

  const elegirOpcion = useCallback((op: OpcionGaleria) => {
    setEstado((s) => ({ ...s, elegida: s.elegida?.url === op.url && s.elegida.semilla === op.semilla ? null : op, error: null, aviso: null }));
  }, []);

  const variarOpcion = useCallback(async (op: OpcionGaleria) => {
    if (!peticion?.prompt) { setEstado((s) => ({ ...s, error: "Sin el texto no hay variación: repite la petición." })); return; }
    setEstado((s) => ({ ...s, cargando: true, error: null, aviso: null }));
    try {
      const provider = providerDeCapa(op.capa);
      const modeloId = modeloIdDeNombre(op.modelo);
      const r = await generador({
        prompt: peticion.prompt,
        provider,
        seed: (op.semilla || 1) + 4,
        ...(modeloId ? { model: modeloId } : {}),
        comercial: peticion.comercial === true,
        conReferencia: peticion.conReferencia === true,
        permisoRemoto: peticion.permisoRemoto === true,
        opciones: provider === "neuronas" ? 2 : 1,
      });
      const nuevas = opcionesDeResultado(r).filter((o) => o.url);
      if (!nuevas.length) {
        setEstado((s) => ({ ...s, cargando: false, error: "La variación no respondió ahora mismo (los servidores a veces andan ocupados): reinténtalo en unos segundos." }));
        return;
      }
      setEstado((s) => ({ ...s, cargando: false, error: null, aviso: "Otra semilla del mismo modelo añadida al final de la rejilla.", opciones: opcionesTrasVariar(s.opciones, nuevas) }));
    } catch (e) {
      setEstado((s) => ({ ...s, cargando: false, error: e instanceof Error && e.message ? e.message : "Error inesperado al variar." }));
    }
  }, [generador, peticion]);

  const editarEnProtomolecula = useCallback((op: OpcionGaleria) => {
    if (!op.url) { setEstado((s) => sinImagen(s, "Esta opción aún no tiene imagen: la sirve otra neurona y no está lista.")); return; }
    try {
      abrirImagenEnProtomolecula(op.url, window);
      setEstado((s) => ({ ...s, error: null, aviso: "Abrí la Protomolécula con la imagen de la opción elegida." }));
    } catch { setEstado((s) => ({ ...s, error: "No pude abrir la Protomolécula desde aquí." })); }
  }, []);

  const ampliar = useCallback((op: OpcionGaleria) => {
    if (!op.url) { setEstado((s) => sinImagen(s, "Esta opción aún no tiene imagen para ampliar.")); return; }
    const gano = typeof window !== "undefined" ? window.open(op.url, "_blank", "noopener") : null;
    if (!gano) setEstado((s) => ({ ...s, aviso: "Tu navegador bloqueó la pestaña nueva: copia el enlace de la imagen y ábrelo para verla en grande." }));
  }, []);

  const usarComoReferencia3D = useCallback((op: OpcionGaleria) => {
    if (!op.url) { setEstado((s) => sinImagen(s, "Esta opción aún no tiene imagen para llevar al taller 3D.")); return; }
    const r = guardarReferencia3D({ url: op.url, titulo: `Referencia 3D · ${op.modelo ?? "imagen Astraura"}` });
    setEstado((s) => ({ ...s, aviso: r.aviso }));
  }, []);

  const guardarEnBiblioteca = useCallback((op: OpcionGaleria) => {
    if (!op.url) { setEstado((s) => sinImagen(s, "Nada que guardar todavía: esta opción no tiene imagen.")); return; }
    saveResource({ kind: "image", title: `${op.modelo ?? "imagen Astraura"} · semilla ${(op.semilla || 0).toString(36)}`, url: op.url, origin: "imagenes" });
    setEstado((s) => ({ ...s, error: null, aviso: "Guardada en tu Biblioteca." }));
  }, []);

  const crearBorradorPublicacion = useCallback((op: OpcionGaleria) => {
    if (!op.url) { setEstado((s) => sinImagen(s, "Sin imagen no hay borrador: elige una ya terminada (u otra neurona la sirve).")); return; }
    const b = borradorDePublicacion({ url: op.url, tema: peticion?.prompt ?? "", modelo: op.modelo, licencia: op.licencia, atribucion: op.atribucion });
    saveResource({ kind: "borrador-publicacion", title: b.titulo, url: op.url, origin: "imagenes" });
    setEstado((s) => ({ ...s, error: null, aviso: "Borrador en tu Biblioteca: revísalo y publica cuando tú quieras (nunca se publica solo)." }));
  }, [peticion]);

  return { ...estado, peticion, generarOpciones, elegirOpcion, variarOpcion, editarEnProtomolecula, ampliar, usarComoReferencia3D, guardarEnBiblioteca, crearBorradorPublicacion };
}
