#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Productor de encargos de varias horas: ejecuta frentes con NotebookLM y Drive inyectables."""
import json
import os
import traceback
from typing import Any, Callable, Optional
from peticiones_encargos import validar_plan, texto_panel, ENTREGABLES_VALIDOS, DESTINOS


class ProductorError(Exception):
    """Error general del productor."""
    pass


class SesionCaducada(Exception):
    """Sesión de NotebookLM caducada."""
    pass


# Tipos que usan generate + wait + download (vs ask para documento, report para informe)
TIPOS_GENERATE = {"infographic", "audio", "video", "slide-deck", "mind-map", "quiz", "flashcards", "data-table"}
TIPOS_SYNC = {"mind-map", "quiz", "flashcards"}  # síncronos (no necesitan wait)


def _llamar_nb(nb: Any, metodo: str, *args, **kwargs) -> tuple[int, str, str]:
    """Llama a un método del cliente NotebookLM inyectado, detectando sesión caducada."""
    fn = getattr(nb, metodo)
    rc, out, err = fn(*args, **kwargs)
    if rc != 0 and ("Authentication" in err or "Run 'notebooklm login'" in err or "expired" in err.lower()):
        raise SesionCaducada(err[-300:])
    return rc, out, err


def _json_de(texto: str) -> dict:
    try:
        return json.loads(texto)
    except ValueError:
        return {}


def crear_cuaderno(frente: dict[str, Any], enc: dict[str, Any], nb: Any) -> str:
    """Crea (o reutiliza) un cuaderno de NotebookLM para el frente."""
    if frente.get("cuaderno"):
        return frente["cuaderno"]
    nombre = f"StarSeed · {enc['id']} · {frente['nombre'][:60]}"
    rc, out, err = _llamar_nb(nb, "create", nombre, json_output=True)
    if rc != 0:
        raise ProductorError(f"no pude crear el cuaderno: {err[-200:]}")
    d = _json_de(out)
    cid = d.get("id") or d.get("notebook_id") or d.get("active_notebook_id")
    if not cid:
        raise ProductorError(f"no pude obtener ID del cuaderno: {out[-200:]}")
    frente["cuaderno"] = cid
    # Añadir fuentes base de Drive si las hay
    for fid, titulo in frente.get("fuentes_drive", []):
        try:
            _anadir_fuente_drive(cid, fid, titulo, nb)
        except Exception as e:
            # No fallar por fuentes base; solo avisar
            frente.setdefault("avisos", []).append(f"fuente base {titulo}: {e}")
    return cid


def _anadir_fuente_drive(cuaderno_id: str, drive_id: str, titulo: str, nb: Any) -> str:
    rc, out, err = _llamar_nb(nb, "source_add_drive", cuaderno_id, drive_id, titulo, json_output=True)
    if rc != 0:
        raise ProductorError(f"no pude añadir fuente {titulo}: {err[-200:]}")
    d = _json_de(out)
    sid = d.get("source_id") or d.get("id")
    if not sid:
        raise ProductorError(f"sin source_id al añadir {titulo}: {out[-200:]}")
    _llamar_nb(nb, "source_wait", cuaderno_id, sid, timeout=600)
    return sid


def investigar_frente(frente: dict[str, Any], enc: dict[str, Any], cuaderno_id: str, nb: Any) -> None:
    """Lanza investigación profunda (source add-research --mode deep) para cada consulta del frente."""
    investigadas = set(frente.get("investigado", []))
    for q in frente.get("investigacion", []):
        if q in investigadas:
            continue
        rc, out, err = _llamar_nb(nb, "source_add_research", cuaderno_id, q, mode="deep", timeout=3300)
        if rc != 0:
            frente.setdefault("avisos", []).append(f"investigación no terminó: {q[:80]}")
        investigadas.add(q)
    frente["investigado"] = list(investigadas)


def _instrucciones(enc: dict[str, Any], e: dict[str, Any]) -> str:
    """Construye el prompt completo para NotebookLM."""
    notas = f"\nAjustes de Maggasukha que debes aplicar: {' | '.join(enc['notas'])}" if enc.get("notas") else ""
    from peticiones_encargos import REGLAS_MARCA
    return f"{e['prompt']}\n\n{REGLAS_MARCA}{notas}\nEncargo original: {enc['texto'][:2500]}"


def producir_entregable(
    e: dict[str, Any],
    frente: dict[str, Any],
    enc: dict[str, Any],
    cuaderno_id: str,
    nb: Any,
    drive: Any,
    enviar_entregable: Optional[Callable[[str, str, str, str], None]] = None,
) -> str:
    """Produce un entregable según su tipo. Devuelve el enlace de Drive.
    
    Si enviar_entregable se proporciona y e['enviar'] es True, se llama con
    (tipo, ruta_local, titulo, enlace_drive) antes de borrar el archivo temporal.
    """
    titulo = f"{e['titulo']} · {enc['id']}"
    tipo = e["tipo"]

    if tipo == "documento":
        # Usa ask (síncrono, respuesta directa) - crea un Doc en Drive, no hay archivo local
        rc, out, err = _llamar_nb(nb, "ask", cuaderno_id, _instrucciones(enc, e), json_output=True)
        if rc != 0:
            raise ProductorError(f"NotebookLM no respondió: {err[-200:]}")
        d = _json_de(out)
        respuesta = d.get("answer") or d.get("text") or ""
        if not respuesta:
            raise ProductorError("respuesta vacía de ask")
        doc_id, enlace = drive.doc(titulo, f"# {e['titulo']}\n\n{respuesta}", frente["carpeta"])
        # Documentos no se envían como archivo (son Google Docs)
        return enlace

    if tipo == "informe":
        # Usa generate report (asíncrono)
        tipo_generate = "report"
    else:
        tipo_generate = tipo

    # Lanzar generación
    no_wait = tipo_generate not in TIPOS_SYNC
    rc, out, err = _llamar_nb(nb, "generate", cuaderno_id, tipo_generate, _instrucciones(enc, e), no_wait=no_wait, retry=2, json_output=True)
    if rc != 0:
        raise ProductorError(f"{tipo_generate} no arrancó: {err[-200:]}")

    if no_wait:
        d = _json_de(out)
        tarea_id = d.get("task_id")
        if not tarea_id:
            raise ProductorError(f"sin task_id en generate {tipo_generate}: {out[-200:]}")
        # Esperar y descargar
        _llamar_nb(nb, "artifact_wait", cuaderno_id, tarea_id, timeout=1200)
        # Crear archivo temporal para descarga
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=_extension(tipo_generate)) as tmp:
            tmp_path = tmp.name
        try:
            _llamar_nb(nb, "download", tipo_generate, cuaderno_id, tarea_id, tmp_path, force=True)
            if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
                raise ProductorError(f"descarga vacía de {tipo_generate}")
            # Enviar archivo al chat si corresponde (antes de subir a Drive y borrar)
            if enviar_entregable and e.get("enviar", True):
                try:
                    enviar_entregable(tipo, tmp_path, e['titulo'], "")
                except Exception as ex:
                    # No fallar el encargo por error de envío
                    frente.setdefault("avisos", []).append(f"envío a chat falló: {ex}")
            if tipo_generate == "report":
                with open(tmp_path, encoding="utf-8") as f:
                    contenido = f.read()
                doc_id, enlace = drive.doc(titulo, contenido, frente["carpeta"])
            else:
                fid, enlace = drive.archivo(tmp_path, frente["carpeta"], titulo + _extension(tipo_generate))
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        return enlace
    else:
        # Síncrono: el resultado viene en out
        d = _json_de(out)
        if tipo_generate == "report":
            contenido = d.get("content") or d.get("markdown") or ""
            doc_id, enlace = drive.doc(titulo, contenido, frente["carpeta"])
        else:
            # Para mind-map, quiz, flashcards - guardar JSON como archivo
            import tempfile
            with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json", encoding="utf-8") as tmp:
                json.dump(d, tmp, ensure_ascii=False, indent=1)
                tmp_path = tmp.name
            try:
                if enviar_entregable and e.get("enviar", True):
                    try:
                        enviar_entregable(tipo, tmp_path, e['titulo'], "")
                    except Exception as ex:
                        frente.setdefault("avisos", []).append(f"envío a chat falló: {ex}")
                fid, enlace = drive.archivo(tmp_path, frente["carpeta"], titulo + ".json")
            finally:
                os.unlink(tmp_path)
        return enlace


def _extension(tipo: str) -> str:
    ext_map = {
        "infographic": ".png",
        "audio": ".m4a",
        "video": ".mp4",
        "slide-deck": ".pdf",
        "report": ".md",
        "mind-map": ".json",
        "quiz": ".json",
        "flashcards": ".json",
        "data-table": ".csv",
    }
    return ext_map.get(tipo, ".bin")


def actualizar_panel(enc: dict[str, Any], drive: Any) -> None:
    """Crea o actualiza el documento del panel en Drive."""
    panel_md = texto_panel(enc)
    if enc.get("panel"):
        drive.doc(f"Panel · {enc['titulo']}", panel_md, archivo_id=enc["panel"])
    else:
        panel_id, panel_enlace = drive.doc(f"Panel · {enc['titulo']} ({enc['id']})", panel_md, DESTINOS["produccion"])
        enc["panel"] = panel_id
        enc["panel_enlace"] = panel_enlace


def ejecutar_encargo(
    enc: dict[str, Any],
    nb: Any,
    drive: Any,
    enviar_avance: Optional[Callable[[str], None]] = None,
    enviar_entregable: Optional[Callable[[str, str, str, str], None]] = None,
) -> None:
    """Ejecuta un encargo completo: recorre frentes, investiga, produce entregables, actualiza panel.
    
    Args:
        enc: Diccionario del encargo (se modifica in-place).
        nb: Cliente NotebookLM inyectado (métodos: create, source_add_drive, source_wait, 
            source_add_research, generate, artifact_wait, download, ask).
        drive: Cliente Drive inyectado (métodos: carpeta, doc, archivo).
        enviar_avance: Callback opcional para enviar avances de texto (recibe texto).
        enviar_entregable: Callback opcional para enviar archivos al chat.
            Recibe (tipo, ruta_local, titulo, enlace_drive).
    """
    if not enc.get("anunciado"):
        actualizar_panel(enc, drive)
        if enviar_avance:
            frentes_str = ", ".join(f"{f['id']} {f['nombre']}" for f in enc['frentes'])
            enviar_avance(
                f"Encargo {enc['id']} en marcha: «{enc['titulo']}».\n"
                f"{len(enc['frentes'])} frentes: {frentes_str}.\n"
                f"Panel: {enc.get('panel_enlace', '')}\n"
                "Puedes escribirme ajustes cuando quieras (los aplico en los frentes siguientes) · /pausa · /cancela"
            )
        enc["anunciado"] = True

    for frente in enc["frentes"]:
        # Recargar estado por si hubo ajustes/pausa/cancelación externos
        # (en producción se lee de disco; aquí el dict ya está actualizado)
        if enc["estado"] in ("cancelado", "pausado"):
            return
        if frente.get("estado") == "hecho":
            continue

        frente["estado"] = "en_curso"
        if not frente.get("carpeta"):
            carpeta_id, carpeta_enlace = drive.carpeta(
                f"{frente['id']} · {frente['nombre']} ({enc['id']})",
                DESTINOS[frente["destino"]]
            )
            frente["carpeta"] = carpeta_id
            frente["carpeta_enlace"] = carpeta_enlace

        actualizar_panel(enc, drive)

        # Crear/reutilizar cuaderno
        cid = crear_cuaderno(frente, enc, nb)

        # Investigar
        investigar_frente(frente, enc, cid, nb)

        # Producir entregables
        for e in frente["entregables"]:
            if e.get("enlace"):
                continue
            try:
                enlace = producir_entregable(e, frente, enc, cid, nb, drive, enviar_entregable)
                e["enlace"] = enlace
                e.pop("fallo", None)
            except SesionCaducada:
                raise
            except Exception as ex:
                e["fallo"] = str(ex)[:200]
                # No romper el bucle; continuar con siguiente entregable

            actualizar_panel(enc, drive)

        frente["estado"] = "hecho"
        actualizar_panel(enc, drive)

        # Avance
        hechos = [e for e in frente["entregables"] if e.get("enlace")]
        fallos = [e for e in frente["entregables"] if e.get("fallo")]
        n_hechos = sum(1 for f in enc["frentes"] if f.get("estado") == "hecho")
        if enviar_avance:
            lineas = [
                f"Avance {enc['id']} · {n_hechos}/{len(enc['frentes'])} · {frente['nombre']} ✓",
            ]
            for e in hechos:
                lineas.append(f"• {e['titulo']}: {e['enlace']}")
            if fallos:
                lineas.append("Pendiente de reintentar: " + "; ".join(e["titulo"] for e in fallos))
            lineas.append(f"Carpeta: {frente.get('carpeta_enlace', '')}")
            enviar_avance("\n".join(lineas))

    # Reintentos: si hay entregables fallidos y vueltas < 2, marcar frentes pendientes para otra vuelta
    pendientes = [e for f in enc["frentes"] for e in f["entregables"] if not e.get("enlace")]
    if pendientes and enc.get("vueltas", 0) < 2:
        enc["vueltas"] = enc.get("vueltas", 0) + 1
        for f in enc["frentes"]:
            if any(not e.get("enlace") for e in f["entregables"]):
                f["estado"] = "pendiente"
        actualizar_panel(enc, drive)
        return

    # Todo terminado (o agotados reintentos)
    enc["estado"] = "hecho"
    actualizar_panel(enc, drive)
    total_entregados = sum(1 for f in enc["frentes"] for e in f["entregables"] if e.get("enlace"))
    total_fallidos = len(pendientes)
    if enviar_avance:
        msg = f"Encargo {enc['id']} terminado ✓ «{enc['titulo']}»\n{total_entregados} entregables en Drive"
        if total_fallidos:
            msg += f" · {total_fallidos} no salieron (detalle en el panel)"
        msg += f"\nPanel: {enc.get('panel_enlace', '')}"
        enviar_avance(msg)


# Para compatibilidad con la referencia original
from peticiones_encargos import REGLAS_MARCA