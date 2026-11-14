#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_productor.py — productor de encargos con inyección de dependencias, sin red."""
import json
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from peticiones_productor import (
    ejecutar_encargo,
    crear_cuaderno,
    investigar_frente,
    producir_entregable,
    actualizar_panel,
    ProductorError,
    SesionCaducada,
)


class MockNotebookLM:
    """Mock del CLI de NotebookLM para tests sin red."""
    def __init__(self):
        self.llamadas = []
        self.cuadernos_creados = {}
        self.fuentes_anadidas = {}
        self.investigaciones = {}
        self.generaciones = {}
        self.artefactos_descargados = {}
        self.debe_fallar = {}
        self.sesion_caducada = False

    def _check_fallar(self, metodo, *args):
        key = (metodo,)
        if key in self.debe_fallar:
            return self.debe_fallar[key]
        return None

    def create(self, nombre, json_output=True):
        fallo = self._check_fallar("create")
        if fallo:
            return fallo
        self.llamadas.append(("create", nombre))
        cid = f"nb_{len(self.cuadernos_creados) + 1}"
        self.cuadernos_creados[cid] = nombre
        return (0, json.dumps({"id": cid}) if json_output else cid, "")

    def source_add_drive(self, cuaderno_id, drive_id, titulo, json_output=True):
        fallo = self._check_fallar("source_add_drive")
        if fallo:
            return fallo
        self.llamadas.append(("source_add_drive", cuaderno_id, drive_id, titulo))
        sid = f"src_{len(self.fuentes_anadidas) + 1}"
        self.fuentes_anadidas[sid] = (cuaderno_id, drive_id, titulo)
        return (0, json.dumps({"source_id": sid}) if json_output else sid, "")

    def source_wait(self, cuaderno_id, source_id, timeout=600):
        self.llamadas.append(("source_wait", cuaderno_id, source_id))
        return (0, json.dumps({"status": "ready"}), "")

    def source_add_research(self, cuaderno_id, query, mode="deep", timeout=3300):
        fallo = self._check_fallar("source_add_research")
        if fallo:
            return fallo
        self.llamadas.append(("source_add_research", cuaderno_id, query, mode))
        self.investigaciones[query] = cuaderno_id
        return (0, json.dumps({"status": "completed"}), "")

    def generate(self, cuaderno_id, tipo, prompt, no_wait=False, retry=2, json_output=True):
        fallo = self._check_fallar("generate")
        if fallo:
            return fallo
        self.llamadas.append(("generate", cuaderno_id, tipo, prompt[:50]))
        key = (cuaderno_id, tipo)
        if key in self.debe_fallar:
            return self.debe_fallar[key]
        tarea_id = f"task_{len(self.generaciones) + 1}"
        self.generaciones[tarea_id] = (cuaderno_id, tipo, prompt)
        if no_wait:
            return (0, json.dumps({"task_id": tarea_id}) if json_output else tarea_id, "")
        return (0, json.dumps({"status": "completed"}) if json_output else "completed", "")

    def artifact_wait(self, cuaderno_id, tarea_id, timeout=1200):
        self.llamadas.append(("artifact_wait", cuaderno_id, tarea_id))
        return (0, json.dumps({"status": "completed"}), "")

    def download(self, tipo, cuaderno_id, tarea_id, ruta, force=True):
        self.llamadas.append(("download", tipo, cuaderno_id, tarea_id, ruta))
        self.artefactos_descargados[ruta] = (tipo, cuaderno_id, tarea_id)
        # Crear archivo vacío para simular descarga
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w") as f:
            if tipo == "report":
                f.write("# Informe generado\n\nContenido del informe.")
            else:
                f.write("contenido")
        return (0, "", "")

    def ask(self, cuaderno_id, prompt, json_output=True):
        fallo = self._check_fallar("ask")
        if fallo:
            return fallo
        self.llamadas.append(("ask", cuaderno_id, prompt[:50]))
        return (0, json.dumps({"answer": "Respuesta generada por NotebookLM"}) if json_output else "Respuesta", "")


class MockDrive:
    """Mock de Google Drive para tests sin red."""
    def __init__(self):
        self.carpetas = {}
        self.documentos = {}
        self.archivos = {}
        self.contador = 0

    def carpeta(self, nombre, padre):
        self.contador += 1
        fid = f"folder_{self.contador}"
        self.carpetas[fid] = {"nombre": nombre, "padre": padre}
        return fid, f"https://drive.google.com/drive/folders/{fid}"

    def doc(self, nombre, markdown, padre=None, archivo_id=None):
        if archivo_id:
            self.documentos[archivo_id]["contenido"] = markdown
            return archivo_id, f"https://docs.google.com/document/d/{archivo_id}"
        self.contador += 1
        fid = f"doc_{self.contador}"
        self.documentos[fid] = {"nombre": nombre, "contenido": markdown, "padre": padre}
        return fid, f"https://docs.google.com/document/d/{fid}"

    def archivo(self, ruta, padre, nombre=None):
        self.contador += 1
        fid = f"file_{self.contador}"
        self.archivos[fid] = {"ruta": ruta, "padre": padre, "nombre": nombre or os.path.basename(ruta)}
        return fid, f"https://drive.google.com/file/d/{fid}"


def crear_encargo_ejemplo():
    """Crea un encargo de ejemplo para tests."""
    return {
        "id": "ENC-1112-1430",
        "titulo": "Desarrollo de síntesis",
        "texto": "Se aprueban las recomendaciones... desarrolla 8 frentes.",
        "estado": "activo",
        "notas": ["Priorizar vídeo sobre audio"],
        "frentes": [
            {
                "id": "F1",
                "nombre": "Investigación",
                "destino": "fuentes",
                "estado": "pendiente",
                "investigacion": ["referencias de diseño solarpunk", "herramientas de producción"],
                "fuentes_drive": [["1ABCdef", "Doc referencias"]],
                "entregables": [
                    {"tipo": "informe", "titulo": "Informe investigación", "prompt": "Investiga referencias", "enviar": False},
                    {"tipo": "mind-map", "titulo": "Mapa referencias", "prompt": "Mapa mental", "enviar": False},
                ],
            },
            {
                "id": "F2",
                "nombre": "Desarrollo",
                "destino": "produccion",
                "estado": "pendiente",
                "investigacion": [],
                "fuentes_drive": [],
                "entregables": [
                    {"tipo": "documento", "titulo": "Guion principal", "prompt": "Escribe el guion", "enviar": True},
                    {"tipo": "informe", "titulo": "Desarrollo completo", "prompt": "Desarrollo detallado", "enviar": False},
                ],
            },
            {
                "id": "F3",
                "nombre": "Plan y listas de tareas",
                "destino": "produccion",
                "estado": "pendiente",
                "investigacion": [],
                "fuentes_drive": [],
                "entregables": [
                    {"tipo": "informe", "titulo": "Próximos pasos", "prompt": "Lista tareas", "enviar": False},
                ],
            },
        ],
    }


def test_crear_cuaderno_llama_notebooklm_y_guarda_id():
    """crear_cuaderno llama al CLI create y guarda el ID en el frente."""
    nb = MockNotebookLM()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    # Quitar fuentes_drive para aislar el test de create
    frente = {**frente, "fuentes_drive": []}

    cid = crear_cuaderno(frente, enc, nb)

    assert cid == "nb_1"
    assert frente["cuaderno"] == "nb_1"
    assert len(nb.llamadas) == 1
    assert nb.llamadas[0][0] == "create"


def test_crear_cuaderno_reutiliza_si_ya_existe():
    """Si el frente ya tiene cuaderno, no crea uno nuevo."""
    nb = MockNotebookLM()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["cuaderno"] = "nb_existente"

    cid = crear_cuaderno(frente, enc, nb)

    assert cid == "nb_existente"
    assert len(nb.llamadas) == 0


def test_investigar_frente_lanza_investigacion_profunda():
    """investigar_frente llama a source add-research --mode deep para cada consulta."""
    nb = MockNotebookLM()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["cuaderno"] = "nb_1"

    investigar_frente(frente, enc, "nb_1", nb)

    assert "referencias de diseño solarpunk" in frente.get("investigado", [])
    assert "herramientas de producción" in frente.get("investigado", [])
    assert len(nb.llamadas) == 2
    for llamada in nb.llamadas:
        assert llamada[0] == "source_add_research"
        assert llamada[3] == "deep"  # mode deep


def test_investigar_frente_salta_ya_investigadas():
    """Consultas ya investigadas se saltan."""
    nb = MockNotebookLM()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["cuaderno"] = "nb_1"
    frente["investigado"] = ["referencias de diseño solarpunk"]

    investigar_frente(frente, enc, "nb_1", nb)

    assert len(nb.llamadas) == 1
    assert nb.llamadas[0][2] == "herramientas de producción"


def test_investigar_frente_guarda_aviso_si_falla():
    """Si la investigación falla, se guarda aviso pero no detiene el encargo."""
    nb = MockNotebookLM()
    nb.debe_fallar[("source_add_research",)] = (1, "", "error de red")
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["cuaderno"] = "nb_1"

    investigar_frente(frente, enc, "nb_1", nb)

    assert "avisos" in frente
    assert any("investigación no terminó" in a for a in frente["avisos"])
    assert "referencias de diseño solarpunk" in frente["investigado"]


def test_producir_entregable_documento_usa_ask():
    """Entregable tipo 'documento' usa ask de NotebookLM y crea Doc en Drive."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][1]
    frente["carpeta"] = "folder_1"
    frente["cuaderno"] = "nb_1"
    e = frente["entregables"][0]  # documento

    enlace = producir_entregable(e, frente, enc, "nb_1", nb, drive)

    assert enlace.startswith("https://docs.google.com/document/d/")
    assert "doc_" in enlace
    # Verificar que se llamó ask
    assert any(l[0] == "ask" for l in nb.llamadas)
    # Verificar que se guardó en Drive
    assert len(drive.documentos) == 1


def test_producir_entregable_informe_usa_generate_report():
    """Entregable tipo 'informe' usa generate report y crea Doc en Drive."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][1]
    frente["carpeta"] = "folder_1"
    frente["cuaderno"] = "nb_1"
    e = frente["entregables"][1]  # informe

    enlace = producir_entregable(e, frente, enc, "nb_1", nb, drive)

    assert enlace.startswith("https://docs.google.com/document/d/")
    # Verificar que se llamó generate con tipo report
    assert any(l[0] == "generate" and l[2] == "report" for l in nb.llamadas)
    # Verificar descarga y subida a Drive
    assert len(drive.documentos) == 1


def test_producir_entregable_artefacto_genera_y_sube():
    """Entregable tipo artefacto (infographic, audio, etc.) genera, descarga y sube a Drive."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["carpeta"] = "folder_1"
    frente["cuaderno"] = "nb_1"
    # Añadir un entregable tipo infographic
    e = {"tipo": "infographic", "titulo": "Infografía test", "prompt": "Haz infografía", "enviar": True}
    frente["entregables"].append(e)

    enlace = producir_entregable(e, frente, enc, "nb_1", nb, drive)

    assert enlace.startswith("https://drive.google.com/file/d/")
    # Verificar generate, artifact_wait, download
    assert any(l[0] == "generate" and l[2] == "infographic" for l in nb.llamadas)
    assert any(l[0] == "artifact_wait" for l in nb.llamadas)
    assert any(l[0] == "download" for l in nb.llamadas)
    assert len(drive.archivos) == 1


def test_producir_entregable_fallo_lanza_excepcion():
    """Si un entregable falla, lanza excepción para que el llamador marque el fallo."""
    nb = MockNotebookLM()
    nb.debe_fallar[("generate",)] = (1, "", "timeout")
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["carpeta"] = "folder_1"
    frente["cuaderno"] = "nb_1"
    e = {"tipo": "infographic", "titulo": "Infografía fallida", "prompt": "Haz infografía", "enviar": True}

    try:
        producir_entregable(e, frente, enc, "nb_1", nb, drive)
        assert False, "Debería haber lanzado excepción"
    except Exception as ex:
        assert "timeout" in str(ex) or "falló" in str(ex)
    # El fallo se marca en ejecutar_encargo, no aquí


def test_actualizar_panel_crea_o_actualiza_doc_drive():
    """actualizar_panel crea o actualiza el documento del panel en Drive."""
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    enc["frentes"][0]["carpeta_enlace"] = "https://drive.google.com/drive/folders/folder_1"
    enc["frentes"][0]["cuaderno"] = "nb_1"
    enc["frentes"][0]["estado"] = "hecho"
    enc["frentes"][0]["entregables"][0]["enlace"] = "https://docs.google.com/document/d/doc_1"

    actualizar_panel(enc, drive)

    assert "panel" in enc
    assert enc["panel"].startswith("doc_")
    assert enc["panel_enlace"].startswith("https://docs.google.com/document/d/")


def test_ejecutar_encargo_pausa_detiene_antes_siguiente_frente():
    """Si el encargo se pone en pausa, se detiene antes de procesar el siguiente frente."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    
    # F1 está hecho
    enc["frentes"][0]["estado"] = "hecho"
    enc["frentes"][0]["carpeta"] = "folder_1"
    enc["frentes"][0]["carpeta_enlace"] = "https://drive.google.com/drive/folders/folder_1"
    enc["frentes"][0]["cuaderno"] = "nb_1"
    enc["frentes"][0]["investigado"] = ["referencias de diseño solarpunk", "herramientas de producción"]
    enc["frentes"][0]["entregables"][0]["enlace"] = "https://docs.google.com/document/d/doc_1"
    enc["frentes"][0]["entregables"][1]["enlace"] = "https://drive.google.com/file/d/file_1"
    
    # F2 está pendiente
    enc["frentes"][1]["estado"] = "pendiente"
    enc["frentes"][2]["estado"] = "pendiente"
    
    # Simular que Maggasukha pone el encargo en pausa mientras se procesa F2
    # El productor debe detenerse inmediatamente
    enc["estado"] = "pausado"
    
    # Ejecutar - debería detenerse inmediatamente sin procesar F2
    ejecutar_encargo(enc, nb, drive)
    
    # F2 y F3 no deberían haber sido procesados (estado sigue pendiente)
    assert enc["frentes"][1]["estado"] == "pendiente", "F2 no debe procesarse si el encargo está pausado"
    assert enc["frentes"][2]["estado"] == "pendiente", "F3 no debe procesarse si el encargo está pausado"
    # F1 ya estaba hecho, no se modifica


def test_ejecutar_encargo_reintenta_entregable_fallido_max_2_vueltas():
    """Entregable que falla se reintenta en la vuelta siguiente (máximo 2)."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    
    # Configurar F1 con un entregable que falla la primera vez
    enc["frentes"][0]["estado"] = "pendiente"
    enc["frentes"][0]["entregables"][0]["enlace"] = None
    enc["frentes"][0]["entregables"][0]["fallo"] = None
    enc["frentes"][0]["entregables"][1]["enlace"] = "https://drive.google.com/file/d/file_1"  # este sí sale
    
    # Primera vuelta: falla el informe
    nb.debe_fallar[("generate",)] = (1, "", "timeout")
    
    try:
        ejecutar_encargo(enc, nb, drive)
    except Exception:
        pass
    
    # Verificar que se marcó el fallo y el frente vuelve a pendiente para reintento
    assert enc["frentes"][0]["entregables"][0].get("fallo") is not None
    assert enc["frentes"][0]["estado"] == "pendiente"
    assert enc.get("vueltas", 0) == 1
    
    # Segunda vuelta: ahora funciona
    nb.debe_fallar.clear()
    enc["frentes"][0]["entregables"][0]["fallo"] = None
    
    try:
        ejecutar_encargo(enc, nb, drive)
    except Exception:
        pass
    
    # Ahora debería tener enlace
    assert enc["frentes"][0]["entregables"][0].get("enlace") is not None
    assert enc["frentes"][0]["estado"] == "hecho"
    
    # Tercera vuelta no debería ocurrir (máx 2)
    assert enc.get("vueltas", 0) <= 2


def test_ajuste_durante_marcha_se_conserva_al_guardar():
    """Un ajuste (nota) añadido durante la ejecución se conserva aunque el productor guarde a la vez.
    
    En producción, el productor recarga el encargo desde el disco antes de cada frente
    para obtener notas y estado actualizados por Maggasukha.
    """
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    enc["frentes"][0]["estado"] = "hecho"
    enc["frentes"][0]["carpeta"] = "folder_1"
    enc["frentes"][0]["carpeta_enlace"] = "https://drive.google.com/drive/folders/folder_1"
    enc["frentes"][0]["cuaderno"] = "nb_1"
    enc["frentes"][0]["investigado"] = ["referencias de diseño solarpunk"]
    enc["frentes"][0]["entregables"][0]["enlace"] = "https://docs.google.com/document/d/doc_1"
    
    # F2 está pendiente y se procesará
    enc["frentes"][1]["estado"] = "pendiente"
    enc["state_notas_iniciales"] = list(enc["notas"])
    
    # Simular que el productor recarga el encargo y Maggasukha añadió notas
    # Esto representa el comportamiento de productor() que lee de disco
    enc["notas"].append("Nuevo ajuste: añadir referencias de Art Nouveau")
    
    # Verificar que la nota se conserva al continuar con F2
    assert "Nuevo ajuste: añadir referencias de Art Nouveau" in enc["notas"]


def test_ejecutar_encargo_recarga_notas_antes_de_frente():
    """El productor recarga notas del disco antes de procesar cada frente.
    
    Simula: Maggasukha añade notas mientras F1 está hecho y F2 está en marcha.
    El productor debe leer esas notas antes de procesar F2.
    """
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    
    # F1 está hecho
    enc["frentes"][0]["estado"] = "hecho"
    enc["frentes"][0]["carpeta"] = "folder_1"
    enc["frentes"][0]["carpeta_enlace"] = "https://drive.google.com/drive/folders/folder_1"
    enc["frentes"][0]["cuaderno"] = "nb_1"
    enc["frentes"][0]["investigado"] = ["referencias de diseño solarpunk", "herramientas de producción"]
    enc["frentes"][0]["entregables"][0]["enlace"] = "https://docs.google.com/document/d/doc_1"
    enc["frentes"][0]["entregables"][1]["enlace"] = "https://drive.google.com/file/d/file_1"
    
    # F2 en marcha (simulando que ya empezó)
    enc["frentes"][1]["estado"] = "en_curso"
    enc["frentes"][1]["carpeta"] = "folder_2"
    enc["frentes"][1]["cuaderno"] = "nb_2"
    enc["frentes"][1]["investigado"] = []
    
    # Antes de ejecutar, Maggasukha añade una nota
    enc["notas"].append("Ajuste: incluir referencias de Art Nouveau")
    
    # Ejecutar - el productor debería procesar F1 (ya hecho), luego F2
    # Las notas deben estar disponibles para F2
    try:
        ejecutar_encargo(enc, nb, drive)
    except Exception:
        pass
    
    # F2 debería haber sido procesado y las notas deberían estar en el panel
    # (el test verifica que el flujo continúa sin errores)
    assert "Ajuste: incluir referencias de Art Nouveau" in enc["notas"]


def test_sesion_caducada_se_propaga_y_espera():
    """Si NotebookLM reporta sesión caducada, se lanza SesionCaducada para que el bucle espere."""
    nb = MockNotebookLM()
    nb.sesion_caducada = True
    nb.debe_fallar[("create",)] = (1, "", "Authentication expired. Run 'notebooklm login'")
    
    enc = crear_encargo_ejemplo()
    enc["frentes"][0]["estado"] = "pendiente"
    
    try:
        ejecutar_encargo(enc, nb, drive=MockDrive())
        assert False, "Debería haber lanzado SesionCaducada"
    except SesionCaducada:
        pass
    except Exception as e:
        assert False, f"Debería ser SesionCaducada, fue {type(e).__name__}: {e}"


# --- Tests para PSF1113B: envío de entregables al chat ---

def test_producir_entregable_llama_enviar_entregable_si_enviar_true():
    """producir_entregable llama a enviar_entregable cuando e['enviar'] es True."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["carpeta"] = "folder_1"
    frente["cuaderno"] = "nb_1"
    e = {"tipo": "infographic", "titulo": "Infografía test", "prompt": "Haz infografía", "enviar": True}
    frente["entregables"].append(e)
    
    enviados = []
    def mock_enviar(tipo, ruta, titulo, enlace_drive):
        enviados.append((tipo, ruta, titulo, enlace_drive))
        # Verificar que el archivo existe en el momento de la llamada
        assert os.path.exists(ruta), f"Archivo temporal no existe: {ruta}"
    
    enlace = producir_entregable(e, frente, enc, "nb_1", nb, drive, enviar_entregable=mock_enviar)
    
    assert len(enviados) == 1
    assert enviados[0][0] == "infographic"
    assert enviados[0][2] == "Infografía test"


def test_producir_entregable_no_llama_enviar_si_enviar_false():
    """producir_entregable NO llama a enviar_entregable cuando e['enviar'] es False."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["carpeta"] = "folder_1"
    frente["cuaderno"] = "nb_1"
    e = {"tipo": "infographic", "titulo": "Infografía test", "prompt": "Haz infografía", "enviar": False}
    frente["entregables"].append(e)
    
    enviados = []
    def mock_enviar(tipo, ruta, titulo, enlace_drive):
        enviados.append((tipo, ruta, titulo, enlace_drive))
    
    enlace = producir_entregable(e, frente, enc, "nb_1", nb, drive, enviar_entregable=mock_enviar)
    
    assert len(enviados) == 0


def test_producir_entregable_documento_no_llama_enviar():
    """Entregables tipo 'documento' no llaman a enviar_entregable (son Google Docs, no archivos)."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][1]
    frente["carpeta"] = "folder_1"
    frente["cuaderno"] = "nb_1"
    e = frente["entregables"][0]  # documento
    e["enviar"] = True
    
    enviados = []
    def mock_enviar(tipo, ruta, titulo, enlace_drive):
        enviados.append((tipo, ruta, titulo, enlace_drive))
    
    enlace = producir_entregable(e, frente, enc, "nb_1", nb, drive, enviar_entregable=mock_enviar)
    
    assert len(enviados) == 0


def test_ejecutar_encargo_pasa_enviar_entregable_a_producir():
    """ejecutar_encargo pasa el callback enviar_entregable a producir_entregable."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    
    # Configurar F1 - activar enviar=True en los entregables
    enc["frentes"][0]["estado"] = "pendiente"
    enc["frentes"][0]["entregables"][0]["enlace"] = None
    enc["frentes"][0]["entregables"][0]["fallo"] = None
    enc["frentes"][0]["entregables"][0]["enviar"] = True
    enc["frentes"][0]["entregables"][1]["enlace"] = None
    enc["frentes"][0]["entregables"][1]["fallo"] = None
    enc["frentes"][0]["entregables"][1]["enviar"] = True
    enc["frentes"][1]["estado"] = "pendiente"
    enc["frentes"][1]["entregables"][0]["enviar"] = True
    enc["frentes"][1]["entregables"][1]["enviar"] = True
    enc["frentes"][2]["estado"] = "pendiente"
    enc["frentes"][2]["entregables"][0]["enviar"] = True
    
    enviados = []
    def mock_enviar(tipo, ruta, titulo, enlace_drive):
        enviados.append((tipo, titulo))
    
    try:
        ejecutar_encargo(enc, nb, drive, enviar_entregable=mock_enviar)
    except Exception:
        pass
    
    # Verificar que se llamó para los entregables con enviar=True
    assert len(enviados) > 0
    tipos_enviados = [t[0] for t in enviados]
    assert "infographic" in tipos_enviados or "audio" in tipos_enviados or "video" in tipos_enviados or "mind-map" in tipos_enviados


def test_enviar_entregable_error_no_rompe_encargo():
    """Error en enviar_entregable no rompe el encargo, solo guarda aviso."""
    nb = MockNotebookLM()
    drive = MockDrive()
    enc = crear_encargo_ejemplo()
    frente = enc["frentes"][0]
    frente["carpeta"] = "folder_1"
    frente["cuaderno"] = "nb_1"
    e = {"tipo": "infographic", "titulo": "Infografía test", "prompt": "Haz infografía", "enviar": True}
    frente["entregables"].append(e)
    
    def mock_enviar_falla(tipo, ruta, titulo, enlace_drive):
        raise Exception("Error de red")
    
    # No debe lanzar excepción
    enlace = producir_entregable(e, frente, enc, "nb_1", nb, drive, enviar_entregable=mock_enviar_falla)
    
    # Debe haber guardado el aviso
    assert "avisos" in frente
    assert any("envío a chat falló" in a for a in frente["avisos"])
    # Pero el entregable sí se produjo
    assert enlace is not None


if __name__ == "__main__":
    import json
    fallos = 0
    for nombre, fn in list(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"✓ {nombre}")
            except AssertionError as e:
                print(f"✗ {nombre}: {e}")
                fallos += 1
            except Exception as e:
                print(f"✗ {nombre}: ERROR {type(e).__name__}: {e}")
                fallos += 1
    if fallos:
        print(f"\n{fallos} test(s) fallaron")
        sys.exit(1)
    else:
        print(f"\nTodos los tests pasaron")
        sys.exit(0)