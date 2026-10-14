#!/usr/bin/env python3
"""Vigía de actualizaciones para herramientas 3D: UniMate, Filigree3D, BTC3D.

Comprueba una vez al día si hay cambios en:
  - UniMate: desaparición del TODO en el README o aparición de código de inferencia.
  - Filigree3D y BTC3D: aparición de un enlace a código en el abstract de arXiv.

Cuando detecta un cambio, crea una tarea en la cola del orquestador y avisa al Chat Director.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ───────────────────────────── configuración ─────────────────────────────
RAIZ = Path(__file__).resolve().parents[2]
STATE_FILE = Path.home() / ".starseed" / "vigias_3d" / "estado.json"
COLAS_DIR = RAIZ / "starseed_memory_root" / "olas"
AGENTE_VIGIA = "vigia-3d"
PAUSA_PETICION = 1.0
TIMEOUT_HTTP = 10
UA = "starseed-vigia-3d/1.0 (+vigias_3d)"


def http_get(url: str, cabeceras: dict[str, str] | None = None, plazo: int = TIMEOUT_HTTP) -> tuple[int, dict[str, str], str]:
    """Realiza una GET HTTP y devuelve (status, headers, cuerpo).
    Envuelve errores de red y devuelve (0, {}, "") en caso de fallo."""
    peticion = urllib.request.Request(url, headers={"User-Agent": UA, **(cabeceras or {})})
    try:
        with urllib.request.urlopen(peticion, timeout=plazo) as r:
            cab = {k.lower(): v for k, v in r.headers.items()}
            cab["x-url-final"] = r.geturl()  # tras redirecciones
            return r.status, cab, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, ""
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}, ""


def _j(txt: str | None) -> Any:
    return None if txt in (None, "null") else json.loads(txt)


# ───────────────────────────── gestión de estado ─────────────────────────────
@dataclass
class EstadoVigia:
    unimate_todo_presente: bool = True  # True si el TODO está en el README
    unimate_licencia: Optional[str] = None
    filigree3d_enlace: Optional[str] = None
    btc3d_enlace: Optional[str] = None

    @staticmethod
    def desde_archivo(ruta: Path) -> "EstadoVigia":
        if ruta.exists():
            try:
                datos = json.loads(ruta.read_text("utf-8"))
                return EstadoVigia(
                    unimate_todo_presente=datos.get("unimate_todo_presente", True),
                    unimate_licencia=_j(datos.get("unimate_licencia")),
                    filigree3d_enlace=_j(datos.get("filigree3d_enlace")),
                    btc3d_enlace=_j(datos.get("btc3d_enlace")),
                )
            except (OSError, ValueError):
                pass  # Si falla, devolvemos el estado por defecto
        return EstadoVigia()

    def guardar(self, ruta: Path) -> None:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        datos = {
            "unimate_todo_presente": self.unimate_todo_presente,
            "unimate_licencia": self.unimate_licencia,
            "filigree3d_enlace": self.filigree3d_enlace,
            "btc3d_enlace": self.btc3d_enlace,
        }
        ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", "utf-8")


# ───────────────────────────── comprobaciones de fuentes ─────────────────────────────
def comprobar_unite(estado: EstadoVigia) -> Tuple[bool, str]:
    """Devuelve (cambio_detectado, mensaje) para UniMate.
    Cambio: desaparición del TODO en el README o aparición de licencia en HF.
    """
    # 1. Comprobar README de UniMate en GitHub
    url_readme = "https://raw.githubusercontent.com/Friedrich-M/UniMate/main/README.md"
    st, _, cuerpo = http_get(url_readme)
    todo_presente = True
    if st == 200:
        # Buscamos el TODO exacto mencionado en el contrato
        todo_presente = "[TODO] Training and inference code will be released" in cuerpo
    else:
        # Si fallamos, asumimos que no ha cambiado (para no generar falsos positivos)
        pass

    cambio_unimate = False
    mensaje = []
    if not todo_presente and estado.unimate_todo_presente:
        cambio_unimate = True
        mensaje.append("TODO desapareció del README de UniMate")

    # 2. Comprobar licencia en Hugging Face
    url_hf = "https://huggingface.co/api/models/Linzhan/UniMate"
    st, _, cuerpo = http_get(url_hf)
    licencia_actual = None
    if st == 200:
        try:
            datos = json.loads(cuerpo)
            licencia_actual = datos.get("cardData", {}).get("license")
        except (json.JSONDecodeError, KeyError):
            pass

    if licencia_actual != estado.unimate_licencia:
        cambio_unimate = True
        if licencia_actual:
            mensaje.append(f"Licencia detectada en HF: {licencia_actual}")
        else:
            mensaje.append("Licencia en HF cambiada a None")

    return cambio_unimate, " | ".join(mensaje)


def comprobar_filigree3d(estado: EstadoVigia) -> Tuple[bool, str]:
    """Devuelve (cambio_detectado, mensaje) para Filigree3D.
    Cambio: aparición de un enlace a código en el abstract de arXiv.
    """
    url = "https://arxiv.org/abs/2609.34900"
    st, _, cuerpo = http_get(url)
    enlace = None
    if st == 200:
        # Buscamos enlaces que parezcan a repositorios de código
        # Patrones comunes: github.com, gitlab.com, bitbucket.org
        patron = r'https?://(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)/[^\s"<]+'
        coincidencias = re.findall(patron, cuerpo, re.IGNORECASE)
        if coincidencias:
            enlace = coincidencias[0]  # tomamos el primero

    cambio = False
    mensaje = []
    if enlace and not estado.filigree3d_enlace:
        cambio = True
        mensaje.append(f"Enlace a código detectado en Filigree3D: {enlace}")
    elif not enlace and estado.filigree3d_enlace:
        # El enlace desapareció (no debería pasar, pero por si acaso)
        cambio = True
        mensaje.append("Enlace a código desaparecido en Filigree3D")

    return cambio, " | ".join(mensaje)


def comprobar_btc3d(estado: EstadoVigia) -> Tuple[bool, str]:
    """Devuelve (cambio_detectado, mensaje) para BTC3D.
    Cambio: aparición de un enlace a código en el abstract de arXiv.
    """
    url = "https://arxiv.org/abs/2609.39709"
    st, _, cuerpo = http_get(url)
    enlace = None
    if st == 200:
        patron = r'https?://(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)/[^\s"<]+'
        coincidencias = re.findall(patron, cuerpo, re.IGNORECASE)
        if coincidencias:
            enlace = coincidencias[0]

    cambio = False
    mensaje = []
    if enlace and not estado.btc3d_enlace:
        cambio = True
        mensaje.append(f"Enlace a código detectado en BTC3D: {enlace}")
    elif not enlace and estado.btc3d_enlace:
        cambio = True
        mensaje.append("Enlace a código desaparecido en BTC3D")

    return cambio, " | ".join(mensaje)


# ───────────────────────────── creación de tareas y avisos ─────────────────────────────
def crear_tarea_vigia(cambio_detectado: bool, fuente: str, mensaje: str) -> Optional[Dict[str, Any]]:
    """Si hubo cambio, devuelve un diccionario representando la tarea para la cola.
    Sin cambio, devuelve None.
    """
    if not cambio_detectado:
        return None

    # Generamos un ID único basado en timestamp y fuente
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    id_tarea = f"{fuente}-{timestamp}"

    # La tarea es: instalar el servicio local y escribir su adaptador
    # Para UniMate: motor del nivel «vivo» para esqueletos libres
    # Para Filigree3D y BTC3D: etapa opcional «detallar» (según contrato)
    if fuente == "unimate":
        titulo = "Instalar UniMate y escribir adaptador de movimiento para esqueletos libres"
        archivos = [
            "src/lib/avatares/movimiento/adaptador_unimate.ts",  # creado por la tarea
            "src/lib/avatares/movimiento/niveles.ts",  # quizá necesite actualizar?
        ]
        prompt = f"""INSTALAR UNIMATE Y ESCRIBIR ADAPTADOR
Se ha detectado que UniMate ha publicado su código de inferencia o ha cambiado su licencia.
Detalles: {mensaje}

Tarea:
1. Instalar UniMate como servicio local (seguir instrucciones de su README).
2. Escribir el adaptador de movimiento para el nivel «vivo» siguiendo la preparación conocida:
   - articulaciones en orden de anchura
   - escala por el diámetro de la topología
   - marco canónico y-arriba con la raíz en el origen mirando a +z
   - rotaciones relativas a la pose de reposo
3. El adaptador debe integrarse con el motor único de movimiento en `src/lib/avatares/movimiento/`.
4. Añadir tests puros para el adaptador en `src/lib/avatares/movimiento/__tests__/`.

Reglas:
- Sin `any`.
- Textos de UI y comentarios en español con acentos.
- El motor único de movimiento ya existe (niveles: vivo, fluido, ligero, quieto).
- El adaptador debe ser un módulo puro que pueda ser usado por el nivel «vivo».
- No modificar el núcleo puro de ADN, etc.
"""
    elif fuente in ("filigree3d", "btc3d"):
        titulo = f"Instalar {fuente.upper()} y escribir adaptador de detalle"
        archivos = [
            f"src/lib/avatares/movimiento/adaptador_{fuente}.ts",  # creado por la tarea
        ]
        prompt = f"""INSTALAR {fuente.upper()} Y ESCRIBIR ADAPTADOR DE DETALLE
Se ha detectado que {fuente} ha publicado un enlace a código.
Detalles: {mensaje}

Tarea:
1. Instalar {fuente} como servicio local (si es necesario) o preparar su uso.
2. Escribir el adaptador para la etapa opcional «detallar» del taller de avatares.
3. Integrar el adaptador en el flujo de generación de avatares 3D.
4. Añadir tests puros para el adaptador.

Reglas:
- Sin `any`.
- Textos de UI y comentarios en español con acentos.
"""
    else:
        return None

    tarea = {
        "id": id_tarea,
        "ola": f"ola/vigia-3d-{id_tarea}",  # identificador de ola única
        "titulo": titulo,
        "archivos": archivos,
        "depende": [],  # no depende de otras tareas
        "prompt": prompt,
        "aprobacion": False,  # requiere aprobación humana
        "modelo": "llm7/minimax-m2.7:free",  # usando un modelo gratuito de OpenRouter
    }
    return tarea


def escribir_cola(tarea: Dict[str, Any]) -> Path:
    """Escribe la tarea en un archivo de cola en starseed_memory_root/olas/."""
    COLAS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    nombre_cola = f"cola-vigia-3d-{tarea['id']}-{timestamp}.json"
    ruta_cola = COLAS_DIR / nombre_cola
    # Estructura de la cola: { "ola": ..., "tareas": [ ... ] }
    datos_cola = {
        "ola": tarea["ola"],
        "tareas": [tarea],
    }
    ruta_cola.write_text(json.dumps(datos_cola, ensure_ascii=False, indent=2) + "\n", "utf-8")
    return ruta_cola


def avisar_chat_director(mensaje: str) -> None:
    """Envía un mensaje al Chat Director usando starseed-puente decir."""
    # Usamos el comando: starseed-puente decir "<mensaje>" --de vigia-3d --tipo aviso --tarea vigia-3d
    # Pero como estamos en Python, podemos ejecutar el comando o usar la función de puente si existe.
    # Por simplicidad, ejecutamos el comando.
    cmd = [
        "starseed-puente",
        "decir",
        mensaje,
        "--de",
        AGENTE_VIGIA,
        "--tipo",
        "aviso",
        "--tarea",
        "vigia-3d",
    ]
    try:
        # Ejecutamos el comando y esperamos a que termine
        result = os.system(" ".join(cmd))
        if result != 0:
            print(f"Warning: starseed-puente decir devolvió código {result}", file=sys.stderr)
    except Exception as e:
        print(f"Error al avisar al Chat Director: {e}", file=sys.stderr)


def actualizar_estado() -> EstadoVigia:
    """Obtiene el estado actual consultando todas las fuentes."""
    estado = EstadoVigia()
    # UniMate
    st_readme, _, cuerpo_readme = http_get("https://raw.githubusercontent.com/Friedrich-M/UniMate/main/README.md")
    todo_presente_actual = True
    if st_readme == 200:
        todo_presente_actual = "[TODO] Training and inference code will be released" in cuerpo_readme
    estado.unimate_todo_presente = todo_presente_actual
    st_hf, _, cuerpo_hf = http_get("https://huggingface.co/api/models/Linzhan/UniMate")
    licencia_actual = None
    if st_hf == 200:
        try:
            datos = json.loads(cuerpo_hf)
            licencia_actual = datos.get("cardData", {}).get("license")
        except (json.JSONDecodeError, KeyError):
            pass
    estado.unimate_licencia = licencia_actual
    # Filigree3D
    st_fili, _, cuerpo_fili = http_get("https://arxiv.org/abs/2609.34900")
    enlace_fili = None
    if st_fili == 200:
        patron = r'https?://(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)/[^\s"<]+'
        coincidencias = re.findall(patron, cuerpo_fili, re.IGNORECASE)
        if coincidencias:
            enlace_fili = coincidencias[0]
    estado.filigree3d_enlace = enlace_fili
    # BTC3D
    st_btc, _, cuerpo_btc = http_get("https://arxiv.org/abs/2609.39709")
    enlace_btc = None
    if st_btc == 200:
        patron = r'https?://(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)/[^\s"<]+'
        coincidencias = re.findall(patron, cuerpo_btc, re.IGNORECASE)
        if coincidencias:
            enlace_btc = coincidencias[0]
    estado.btc3d_enlace = enlace_btc
    return estado


def main() -> int:
    """Función principal del vigía."""
    # Cargamos el estado anterior
    estado_anterior = EstadoVigia.desde_archivo(STATE_FILE)

    # Comprobamos cada fuente
    cambios = []
    mensajes = []

    # UniMate
    cambio_unimate, msg_unimate = comprobar_unite(estado_anterior)
    if cambio_unimate:
        cambios.append(("unimate", msg_unimate))
        mensajes.append(msg_unimate)

    # Filigree3D
    cambio_filigree3d, msg_filigree3d = comprobar_filigree3d(estado_anterior)
    if cambio_filigree3d:
        cambios.append(("filigree3d", msg_filigree3d))
        mensajes.append(msg_filigree3d)

    # BTC3D
    cambio_btc3d, msg_btc3d = comprobar_btc3d(estado_anterior)
    if cambio_btc3d:
        cambios.append(("btc3d", msg_btc3d))
        mensajes.append(msg_btc3d)

    # Si hubo algún cambio, creamos la tarea y avisamos
    if cambios:
        # Para simplificar, creamos una tarea por cada cambio detectado
        for fuente, mensaje in cambios:
            tarea = crear_tarea_vigia(True, fuente, mensaje)
            if tarea:
                ruta_cola = escribir_cola(tarea)
                print(f"Tarea escrita en: {ruta_cola}")

        # Unimos todos los mensajes para el aviso al Chat Director
        mensaje_completo = "Vigía 3D detectó cambios: " + " | ".join(mensajes)
        avisar_chat_director(mensaje_completo)

        # Actualizamos el estado con los nuevos valores
        estado_actual = actualizar_estado()
        estado_actual.guardar(STATE_FILE)
    else:
        print("No se detectaron cambios.")

    return 0


if __name__ == "__main__":
    sys.exit(main())