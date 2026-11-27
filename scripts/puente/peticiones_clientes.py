#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Clientes reales de NotebookLM y Drive para el modo de encargo (PET1121A).

ClienteNotebookLM: wrappers sobre peticiones_notebooklm.nb() con la firma exacta
que espera peticiones_productor._llamar_nb().

ClienteDrive: usa token_google() y API Drive v3 (crear carpeta, subir multipart,
convertir markdown a Documento de Google, actualizar por archivo_id).
"""
import json
import os
import urllib.parse
import urllib.request
from typing import Any
from pathlib import Path

from peticiones_notebooklm import nb, token_google


class ClienteNotebookLM:
    """Cliente NotebookLM: cada método llama a nb() y devuelve (rc, out, err)."""

    def create(self, nombre: str, json_output: bool = True) -> tuple[int, str, str]:
        """Crea un cuaderno nuevo.
        
        Args:
            nombre: Nombre del cuaderno.
            json_output: Si True, añade --json a la llamada.
        """
        args = ["create", nombre]
        if json_output:
            args.append("--json")
        return nb(args)

    def source_add_drive(
        self, cuaderno_id: str, drive_id: str, titulo: str, json_output: bool = True
    ) -> tuple[int, str, str]:
        """Añade un documento de Drive como fuente al cuaderno."""
        args = ["source", "add-drive", "-n", cuaderno_id, drive_id, titulo]
        if json_output:
            args.append("--json")
        return nb(args)

    def source_wait(
        self, cuaderno_id: str, source_id: str, timeout: int = 600
    ) -> tuple[int, str, str]:
        """Espera a que una fuente esté lista."""
        args = ["source", "wait", "-n", cuaderno_id, source_id, "--timeout", str(timeout)]
        return nb(args)

    def source_add_research(
        self,
        cuaderno_id: str,
        query: str,
        mode: str = "deep",
        timeout: int = 3300,
        source_id: str | None = None,
        json_output: bool = True,
    ) -> tuple[int, str, str]:
        """Añade investigación (deep research), lista fuentes o elimina una fuente.
        
        Args:
            cuaderno_id: ID del cuaderno.
            query: Consulta de investigación (vacía para list/delete).
            mode: "deep" | "list" | "delete".
            timeout: Timeout en segundos.
            source_id: ID de fuente a eliminar (solo para mode="delete").
            json_output: Si True, añade --json.
        """
        args = ["source", "add-research", "-n", cuaderno_id]
        if query:
            args.append(query)
        args.extend(["--mode", mode, "--timeout", str(timeout)])
        if source_id:
            args.extend(["--source-id", source_id])
        if json_output:
            args.append("--json")
        return nb(args)

    def generate(
        self,
        cuaderno_id: str,
        tipo: str,
        prompt: str,
        no_wait: bool = False,
        retry: int = 2,
        json_output: bool = True,
    ) -> tuple[int, str, str]:
        """Genera un artefacto en el cuaderno."""
        args = ["generate", tipo, "-n", cuaderno_id]
        if json_output:
            args.append("--json")
        if no_wait:
            args.append("--no-wait")
        args.extend(["--retry", str(retry)])
        args.append(prompt)
        return nb(args)

    def artifact_wait(
        self, cuaderno_id: str, tarea_id: str, timeout: int = 1200
    ) -> tuple[int, str, str]:
        """Espera a que un artefacto generado esté listo."""
        args = ["artifact", "wait", "-n", cuaderno_id, tarea_id, "--timeout", str(timeout), "--json"]
        return nb(args)

    def download(
        self, tipo: str, cuaderno_id: str, tarea_id: str, ruta: str, force: bool = True
    ) -> tuple[int, str, str]:
        """Descarga un artefacto generado a ruta local."""
        args = ["download", tipo, "-n", cuaderno_id, "-a", tarea_id, ruta]
        if force:
            args.append("--force")
        return nb(args)

    def ask(self, cuaderno_id: str, prompt: str, json_output: bool = True) -> tuple[int, str, str]:
        """Pregunta al cuaderno (síncrono, respuesta directa)."""
        args = ["ask", "-n", cuaderno_id, prompt]
        if json_output:
            args.append("--json")
        return nb(args)


class ClienteDrive:
    """Cliente Google Drive: usa token_google() y API Drive v3."""

    def __init__(self):
        self._token_cache: str | None = None

    def _token(self) -> str:
        """Obtiene token de acceso (con caché simple por instancia)."""
        if self._token_cache is None:
            self._token_cache = token_google()
        return self._token_cache

    def _request(
        self, method: str, url: str, headers: dict[str, str] | None = None, data: bytes | None = None
    ) -> dict[str, Any]:
        """Ejecuta una petición HTTP a la API de Drive."""
        h = {"Authorization": f"Bearer {self._token()}"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=data, headers=h, method=method)
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _request_multipart(
        self, url: str, fields: dict[str, str], file_field: str, file_path: str, file_name: str
    ) -> dict[str, Any]:
        """Sube archivo multipart a Drive."""
        import uuid
        frontera = uuid.uuid4().hex
        partes = []
        for k, v in fields.items():
            partes.append(
                f'--{frontera}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
            )
        with open(file_path, "rb") as f:
            contenido = f.read()
        partes.append(
            f'--{frontera}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{file_name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()
            + contenido
            + b"\r\n"
        )
        partes.append(f"--{frontera}--\r\n".encode())
        body = b"".join(partes)
        headers = {"Content-Type": f"multipart/related; boundary={frontera}"}
        return self._request("POST", url, headers=headers, data=body)

    def carpeta(self, nombre: str, padre: str) -> tuple[str, str]:
        """Crea una carpeta en Drive.
        
        Returns:
            Tupla (folder_id, enlace_web).
        """
        metadata = {"name": nombre, "mimeType": "application/vnd.google-apps.folder", "parents": [padre]}
        data = json.dumps(metadata).encode()
        resp = self._request(
            "POST",
            "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
            headers={"Content-Type": "application/json"},
            data=data,
        )
        fid = resp.get("id", "")
        enlace = f"https://drive.google.com/drive/folders/{fid}"
        return fid, enlace

    def doc(
        self,
        nombre: str,
        markdown: str,
        padre: str | None = None,
        archivo_id: str | None = None,
    ) -> tuple[str, str]:
        """Crea o actualiza un Documento de Google a partir de markdown.
        
        Args:
            nombre: Nombre del documento.
            markdown: Contenido en markdown.
            padre: ID de carpeta padre (solo para creación).
            archivo_id: Si se proporciona, actualiza este documento existente.
        
        Returns:
            Tupla (doc_id, enlace_web).
        """
        if archivo_id:
            return self._actualizar_doc(archivo_id, nombre, markdown)
        return self._crear_doc(nombre, markdown, padre)

    def _crear_doc(self, nombre: str, markdown: str, padre: str | None) -> tuple[str, str]:
        """Crea un nuevo Google Doc desde markdown."""
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".md", encoding="utf-8") as tmp:
            tmp.write(markdown)
            tmp_path = tmp.name
        try:
            metadata: dict[str, Any] = {"name": nombre, "mimeType": "application/vnd.google-apps.document"}
            if padre:
                metadata["parents"] = [padre]
            fields = {"metadata": json.dumps(metadata)}
            resp = self._request_multipart(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
                fields,
                "file",
                tmp_path,
                nombre + ".md",
            )
            fid = resp.get("id", "")
            enlace = f"https://docs.google.com/document/d/{fid}"
            return fid, enlace
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def _actualizar_doc(self, archivo_id: str, nombre: str, markdown: str) -> tuple[str, str]:
        """Actualiza un Google Doc existente con nuevo contenido markdown."""
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".md", encoding="utf-8") as tmp:
            tmp.write(markdown)
            tmp_path = tmp.name
        try:
            metadata = {"name": nombre}
            fields = {"metadata": json.dumps(metadata)}
            resp = self._request_multipart(
                f"https://www.googleapis.com/upload/drive/v3/files/{archivo_id}?uploadType=multipart&fields=id,name,webViewLink",
                fields,
                "file",
                tmp_path,
                nombre + ".md",
            )
            fid = resp.get("id", archivo_id)
            enlace = f"https://docs.google.com/document/d/{fid}"
            return fid, enlace
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def archivo(self, ruta: str, padre: str, nombre: str | None = None) -> tuple[str, str]:
        """Sube un archivo a Drive (no convierte a Doc).
        
        Returns:
            Tupla (file_id, enlace_web).
        """
        nombre_final = nombre or os.path.basename(ruta)
        metadata = {"name": nombre_final, "parents": [padre]}
        fields = {"metadata": json.dumps(metadata)}
        resp = self._request_multipart(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
            fields,
            "file",
            ruta,
            nombre_final,
        )
        fid = resp.get("id", "")
        enlace = f"https://drive.google.com/file/d/{fid}"
        return fid, enlace


def verificar_permiso_drive_escritura(alias: str = "alex-docs") -> tuple[bool, str]:
    """Verifica si el token de Google tiene permiso de escritura en Drive.
    
    Usa tokeninfo para comprobar scopes. No imprime ni guarda el token.
    Por defecto verifica la cuenta alex-docs (drive.file).
    
    Returns:
        Tupla (tiene_escritura, mensaje_detalle).
    """
    try:
        tok = token_google(alias)
        url = f"https://www.googleapis.com/oauth2/v3/tokeninfo?access_token={urllib.parse.quote(tok)}"
        with urllib.request.urlopen(url, timeout=30) as resp:
            info = json.loads(resp.read().decode("utf-8"))
        scopes = info.get("scope", "").split()
        drive_scope = "https://www.googleapis.com/auth/drive" in scopes
        drive_file_scope = "https://www.googleapis.com/auth/drive.file" in scopes
        if drive_scope or drive_file_scope:
            return True, f"Permiso de escritura confirmado (drive/drive.file) en cuenta {alias}"
        return False, f"Solo permiso de lectura en cuenta {alias}. Scopes: {', '.join(scopes)}"
    except Exception as e:
        return False, f"No se pudo verificar permiso en cuenta {alias}: {e}"