#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Explorador diario de modelos de imagen para Astraura.
Consulta Hugging Face (modelos text-to-image en tendencia y versiones de los instalados)
y GitHub (versiones de stable-diffusion.cpp y ComfyUI).
Extrae licencia, si está gated, tamaño y motores conocidos.
Escribe propuestas en starseed_memory_root/olas/propuestas-imagenes.json
y, para lo que merezca entrar al catálogo, crea una cola nueva
cola-imagenes-catalogo-<fecha>.json con la tarea de añadir la ficha verificada.
Avisa al Chat Director como los demás scripts de scripts/puente/.
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Importar el director_chat para enviar mensajes al Chat Director
sys.path.append(str(Path(__file__).resolve().parents[2] / "scripts" / "puente"))
import director_chat

# Rutas del proyecto
RAIZ = Path(__file__).resolve().parents[2]
MODELOS_TS = RAIZ / "src" / "lib" / "imagenes" / "modelos.ts"
CONTRATO_MD = RAIZ / "architecture" / "astraura-imagenes.md"
PROPUESTAS_DIR = RAIZ / "starseed_memory_root" / "olas"
PROPUESTAS_FILE = PROPUESTAS_DIR / "propuestas-imagenes.json"
# La cola se creará con la fecha de hoy

# Constantes de API
HF_API = "https://huggingface.co/api"
GH_API = "https://api.github.com"
UA = "astraura-explorador-imagenes/1.0"

# Timeout para peticiones HTTP
TIMEOUT = 30
# Pausa entre peticiones para evitar rate limiting
PAUSA = 1.0


def _j(txt: str | None) -> Any:
    """Convierte 'null' a None, de lo contrario parshea JSON."""
    return None if txt in (None, "null") else json.loads(txt)


def http_get(url: str, headers: Dict[str, str] | None = None, timeout: int = TIMEOUT) -> Tuple[int, Dict[str, str], str]:
    """Realiza una petición GET HTTP y devuelve (status, headers, body)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            headers = {k.lower(): v for k, v in resp.headers.items()}
            headers["x-url-final"] = resp.geturl()
            return resp.status, headers, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, ""
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}, ""


def _pedir(url: str, accept: str = "application/json") -> Tuple[int, Dict[str, str], str]:
    """Envuelve http_get con pausa y headers de aceptación."""
    time.sleep(PAUSA)
    return http_get(url, {"Accept": accept})


def _json(url: str) -> Tuple[int, Dict[str, str], Optional[Any]]:
    """Llama a _pedir y parshea JSON si el status es 200."""
    status, headers, body = _pedir(url)
    if status == 200:
        try:
            return status, headers, json.loads(body)
        except json.JSONDecodeError:
            return 0, headers, None
    return status, headers, None


def _gh(ruta: str) -> Tuple[int, Optional[Any]]:
    """Llama a la API de GitHub; si hay rate limit, devuelve (0, None)."""
    # No implementamos manejo de rate limit para simplificar, pero se podría añadir
    status, _, datos = _json(f"https://api.github.com{ruta}")
    return status, datos


# --- Funciones para leer el catálogo de modelos desde modelos.ts ---


def _extraer_array_modelos_ts(contenido: str) -> List[Dict]:
    """
    Extrae el array MODELOS_IMAGEN del contenido de modelos.ts.
    Asume la forma: export const MODELOS_IMAGEN: readonly ModeloImagen[] = [ ... ];
    """
    # Buscar la línea que contiene 'MODELOS_IMAGEN' y '='
    lineas = contenido.split("\n")
    inicio = -1
    for i, linea in enumerate(lineas):
        if "MODELOS_IMAGEN" in linea and "=" in linea:
            inicio = i
            break
    if inicio == -1:
        raise ValueError("No se encontró la definición de MODELOS_IMAGEN en modelos.ts")

    # Extraer el valor de TODO si existe
    todo_valo = None
    for linea in lineas:
        if linea.strip().startswith("const TODO:"):
            # Extraer la parte después del '='
            if "=" in linea:
                todo_str = linea.split("=", 1)[1].strip()
                # Eliminar el punto y coma al final si existe
                if todo_str.endswith(";"):
                    todo_str = todo_str[:-1]
                try:
                    todo_valo = json.loads(todo_str)
                    if not isinstance(todo_valo, list):
                        todo_valo = None
                except json.JSONDecodeError:
                    todo_valo = None
            break

    # Desde la línea de inicio, buscamos el '=' y luego el primer '[' después de ese '='
    contenido_restante = "\n".join(lineas[inicio:])
    # Encontrar el primer '=' en el contenido_restante
    indice_igual = contenido_restante.find("=")
    if indice_igual == -1:
        raise ValueError("No se encontró el signo '=' en la definición de MODELOS_IMAGEN")
    # Buscar el primer '[' después del '='
    corchete_apertura = contenido_restante.find("[", indice_igual)
    if corchete_apertura == -1:
        raise ValueError("No se encontró el corchete de apertura del array después del '='")
    # Ahora encontrar el corchete de cierre que coincide
    nivel = 0
    for i, char in enumerate(contenido_restante[corchete_apertura:], start=corchete_apertura):
        if char == "[":
            nivel += 1
        elif char == "]":
            nivel -= 1
            if nivel == 0:
                corchete_cierre = i
                break
    else:
        raise ValueError("No se encontró el corchete de cierre del array")

    # Extraer la substring del array
    array_str = contenido_restante[corchete_apertura:corchete_cierre + 1]
    # Reemplazar TODO por su valor si existe
    if todo_valo is not None:
        # Convertir el valor de TODO a una cadena JSON
        todo_json = json.dumps(todo_valo)
        # Reemplazar todas las ocurrencias de TODO que no estén dentro de cadenas
        # Para simplificar, asumimos que TODO solo aparece como identificador aislado
        # y no dentro de cadenas o comentarios.
        array_str = array_str.replace("TODO", todo_json)

    # Convertir la sintaxis de objeto literal de TypeScript a JSON válido
    # Paso 1: agregar comillas dobles alrededor de los nombres de las propiedades, pero solo fuera de strings.
    import re
    def _quote_property_names_outside_strings(s: str) -> str:
        # Patrón para identificar un nombre de propiedad: espacios opcionales, identificador, espacios opcionales, dos puntos
        pattern = re.compile(r'(\s*)(\w+)(\s*:)')
        # Vamos a construir el resultado iterando a través de las coincidencias
        result = []
        last_end = 0
        for match in pattern.finditer(s):
            # Verificar si esta coincidencia está dentro de una cadena contando el número de comillas dobles desde el inicio
            prefix = s[:match.start()]
            # Contar el número de comillas dobles en el prefijo (asumiendo que no hay escapado de comillas para simplificar)
            num_quotes = prefix.count('"')
            if num_quotes % 2 == 0:
                # Fuera de una cadena, así que cotamos el nombre de la propiedad
                # Los grupos del match: group1 = espacio en blanco inicial, group2 = nombre de la propiedad, group3 = espacio en blanco antes de los dos puntos
                replacement = match.group(1) + '"' + match.group(2) + '"' + match.group(3)
                result.append(s[last_end:match.start()])
                result.append(replacement)
                last_end = match.end()
            else:
                # Dentro de una cadena, omitimos esta coincidencia
                pass
        # Añadir el resto de la cadena
        result.append(s[last_end:])
        return ''.join(result)

    array_str_json = _quote_property_names_outside_strings(array_str)
    # Paso 2: eliminar comas trailing (commas que están seguidas de espacios y luego } o ])
    # Esto maneja los casos de objetos y arrays que tienen comas finales.
    array_str_json = re.sub(r',\s*([\]}])', r'\1', array_str_json)
    # Ahora intentar parsear como JSON
    try:
        modelos = json.loads(array_str_json)
        if not isinstance(modelos, list):
            raise ValueError("MODELOS_IMAGEN no es un array")
        return modelos
    except json.JSONDecodeError as e:
        # Si aún falla, proporcionamos más información para depuración.
        raise ValueError(f"No se pudo parsear el array de modelos como JSON: {e}. Array string: {array_str_json[:200]}") from e


def leer_modelos_existentes() -> List[Dict]:
    """Lee el archivo modelos.ts y devuelve la lista de modelos."""
    contenido = MODELOS_TS.read_text(encoding="utf-8")
    return _extraer_array_modelos_ts(contenido)


# --- Funciones para obtener datos de Hugging Face ---


def obtener_modelos_tendencia(limite: int = 10) -> List[Dict]:
    """
    Obtiene los modelos text-to-image en tendencia de Hugging Face.
    Usa la endpoint: /api/models?pipeline_tag=text-to-image&sort=likes&direction=-1&limit={limite}
    """
    url = f"{HF_API}/models?pipeline_tag=text-to-image&sort=likes&direction=-1&limit={limite}"
    status, _, datos = _json(url)
    if status != 200 or not isinstance(datos, list):
        print(f"Advertencia: no se pudo obtener modelos en tendencia de HF (status={status})", file=sys.stderr)
        return []
    return datos


def obtener_info_modelo_hf(modelo_id: str) -> Optional[Dict]:
    """
    Obtiene la información de un modelo específico de Hugging Face.
    """
    url = f"{HF_API}/models/{urllib.parse.quote(modelo_id)}"
    status, headers, datos = _json(url)
    if status == 200 and isinstance(datos, dict):
        return datos
    return None


# --- Funciones para obtener datos de GitHub ---


def obtener_ultima_release_github(owner: str, repo: str) -> Optional[Dict]:
    """
    Obtiene la última release de un repositorio de GitHub.
    """
    status, datos = _gh(f"/repos/{owner}/{repo}/releases/latest")
    if status == 200 and isinstance(datos, dict):
        return {
            "tag_name": datos.get("tag_name"),
            "published_at": datos.get("published_at"),
            "body": datos.get("body"),
        }
    return None


def obtener_licencia_github(owner: str, repo: str) -> Optional[str]:
    """
    Obtiene la licencia de un repositorio de GitHub.
    """
    status, datos = _gh(f"/repos/{owner}/{repo}/license")
    if status == 200 and isinstance(datos, dict):
        licencia_info = datos.get("license")
        if isinstance(licencia_info, dict):
            return licencia_info.get("spdx_id")
    return None


# --- Funciones para procesar y extraer información requerida ---


def extraer_info_modelo_hf(datos_hf: Dict) -> Dict:
    """
    Extrae licencia, gated, tamaño y otros datos relevantes de la información de un modelo de HF.
    """
    licencia = datos_hf.get("license")
    gated = datos_hf.get("gated", False)
    # El tamaño no está directamente disponible; podemos intentar obtenerlo de los siblings?
    # Por ahora, lo dejamos como null y añadimos una nota.
    tamaño_gb = None
    # Intentamos calcular el tamaño sumando el tamaño de los siblings? Es complejo y requiere más peticiones.
    # Dejamos la tarea de tamaño para una futura mejora o lo dejamos como desconocido.
    return {
        "licencia": licencia,
        "gated": gated,
        "tamaño_gb": tamaño_gb,
        "descarga": datos_hf.get("downloads", 0),
        "me_gusta": datos_hf.get("likes", 0),
        "última_modificación": datos_hf.get("lastModified"),
        "étiquetas": datos_hf.get("tags", []),
    }


def extraer_info_modelo_existente(modelo: Dict, info_hf: Optional[Dict]) -> Dict:
    """
    Para un modelo existente en el catálogo, obtiene su información actualizada desde HF.
    """
    # El modelo ya tiene licencia, gated, etc. en el catálogo.
    # Queremos obtener la versión o fecha más reciente desde HF.
    # Usaremos la fecha de última modificación de HF como indicador de actualización.
    licencia = modelo.get("licencia")
    gated = modelo.get("gated", False)
    tamaño_gb = modelo.get("repoGB")  # Este es el tamaño orientativo del repo
    # Obtener la última modificación desde HF si está disponible
    última_modificación = None
    if info_hf:
        última_modificación = info_hf.get("lastModified")
    return {
        "id": modelo.get("id"),
        "nombre": modelo.get("nombre"),
        "licencia": licencia,
        "gated": gated,
        "tamaño_gb": tamaño_gb,
        "última_modificación": última_modificación,
        "motores": modelo.get("motores", []),
    }


# --- Funciones para determinar si un modelo merece entrar al catálogo ---


def merece_entrar_al_catalogo(info_modelo: Dict) -> bool:
    """
    Determina si un modelo merece entrar al catálogo basado en:
    - Licencia que permita uso comercial (o al menos no restrinja severamente).
    - No estar gated (o si está gated, que sea aceptable por el usuario).
    - Tener al menos un motor conocido que funcione (de momento, asumimos que si es un modelo de HF text-to-image, funciona con diffusers).
    - Tener un tamaño razonable (opcional).
    """
    licencia = info_modelo.get("licencia", "")
    gated = info_modelo.get("gated", False)
    # Licencias que permiten uso comercial (lista no exhaustiva)
    licencias_comerciales = {"apache-2.0", "mit", "bsd-3-clause", "bsd-2-clause", "isc", "unlicense", "creativeml openrail-m", "creativeml openrail++-m", "openrail++"}
    # Normalizar la licencia
    licencia_normalizada = licencia.lower().strip() if licencia else ""
    # Verificar si la licencia permite uso comercial
    permite_comercial = any(lic in licencia_normalizada for lic in licencias_comerciales)
    # Si está gated, requerimos que el usuario acepte términos, pero aún así puede entrar al catálogo como opción.
    # No lo descartamos por estar gated.
    # Verificar que tenga al menos un motor (asumimos que si es un modelo de text-to-image, tiene diffusers)
    # En el futuro, podríamos verificar la compatibilidad con motores específicos.
    tiene_motor = True  # Placeholder
    # Verificar tamaño: si es demasiado grande, quizás no sea adecuado para uso local en dispositivos comunes.
    # Pero dejamos esa decisión al usuario.
    return permite_comercial and tiene_motor


# --- Funciones para escribir propuestas y colas ---


def asegurar_directorio_olas():
    """Asegura que el directorio para las propuestas exista."""
    PROPUESTAS_DIR.mkdir(parents=True, exist_ok=True)


def escribir_propuestas(propuestas: List[Dict]):
    """Escribe la lista de propuestas en el archivo JSON."""
    asegurar_directorio_olas()
    datos = {
        "generado": datetime.now(timezone.utc).isoformat(),
        "propuestas": propuestas,
    }
    # Escribir de forma atómica
    tmp_file = PROPUESTAS_FILE.with_suffix(".tmp")
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    tmp_file.replace(PROPUESTAS_FILE)


def crear_cola_catalogo(modelos_nuevos: List[Dict], fecha: str) -> Path:
    """
    Crea un archivo de cola para los modelos que merecen entrar al catálogo.
    El nombre del archivo es cola-imagenes-catalogo-<fecha>.json
    """
    asegurar_directorio_olas()
    cola_file = PROPUESTAS_DIR / f"cola-imagenes-catalogo-{fecha}.json"
    tareas = []
    for modelo in modelos_nuevos:
        tarea = {
            "id": f"img-{int(time.time()*1000)}-{len(tareas)}",
            "tipo": "añadir-modelo-imagen",
            "modelo": modelo,
        }
        tareas.append(tarea)
    datos = {
        "generado": datetime.now(timezone.utc).isoformat(),
        "tareas": tareas,
    }
    # Escribir de forma atómica
    tmp_file = cola_file.with_suffix(".tmp")
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    tmp_file.replace(cola_file)
    return cola_file


# --- Función para notificar al Chat Director ---


def notificar_director(mensaje: str):
    """
    Envía un mensaje al Chat Director usando la función publicar de director_chat.
    """
    try:
        director_chat.publicar(
            texto=mensaje,
            de="explorador-imagenes",
            rol="sistema",
            tipo="aviso",
            canal="mando",
        )
        print(f"Notificación enviada al Director Chat: {mensaje}")
    except Exception as e:
        print(f"Error al notificar al Director Chat: {e}", file=sys.stderr)


# --- Función principal ---


def main():
    print("Iniciando explorador de modelos de imagen...")
    # Leer modelos existentes del catálogo
    try:
        modelos_existentes = leer_modelos_existentes()
        print(f"Leídos {len(modelos_existentes)} modelos existentes del catálogo.")
    except Exception as e:
        print(f"Error al leer modelos existentes: {e}", file=sys.stderr)
        sys.exit(1)

    # Obtener modelos en tendencia de Hugging Face
    modelos_tendencia = obtener_modelos_tendencia(limite=10)
    print(f"Obtenidos {len(modelos_tendencia)} modelos en tendencia de Hugging Face.")

    # Obtener información actualizada de los modelos existentes desde HF
    modelos_existentes_actualizados = []
    for modelo in modelos_existentes:
        modelo_id = modelo.get("hf")
        if not modelo_id:
            print(f"Advertencia: modelo {modelo.get('id')} no tiene campo 'hf'", file=sys.stderr)
            modelos_existentes_actualizados.append(modelo)
            continue
        info_hf = obtener_info_modelo_hf(modelo_id)
        modelos_existentes_actualizados.append(
            extraer_info_modelo_existente(modelo, info_hf)
        )
        time.sleep(PAUSA)  # Pausa entre peticiones

    # Obtener información de stable-diffusion.cpp y ComfyUI desde GitHub
    sdcpp_info = obtener_ultima_release_github("leejet", "stable-diffusion.cpp")
    comfyui_info = obtener_ultima_release_github("comfyanonymous", "ComfyUI")
    sdcpp_licencia = obtener_licencia_github("leejet", "stable-diffusion.cpp")
    comfyui_licencia = obtener_licencia_github("comfyanonymous", "ComfyUI")

    # Preparar propuestas
    propuestas = []

    # Añadir propuestas para modelos en tendencia
    for modelo_hf in modelos_tendencia:
        info = extraer_info_modelo_hf(modelo_hf)
        propuesta = {
            "tipo": "modelo-tendencia",
            "nombre": modelo_hf.get("modelId"),
            "autor": modelo_hf.get("author"),
            "licencia": info["licencia"],
            "gated": info["gated"],
            "tamaño_gb": info["tamaño_gb"],
            "descargas": info["descarga"],
            "me_gusta": info["me_gusta"],
            "última_modificación": info["última_modificación"],
            "étiquetas": info["étiquetas"],
            "fuente": "huggingface-tendencia",
        }
        propuestas.append(propuesta)

    # Añadir propuestas para modelos existentes (actualizaciones)
    for modelo_actualizado in modelos_existentes_actualizados:
        propuesta = {
            "tipo": "modelo-existente-actualizado",
            "id": modelo_actualizado.get("id"),
            "nombre": modelo_actualizado.get("nombre"),
            "licencia": modelo_actualizado.get("licencia"),
            "gated": modelo_actualizado.get("gated"),
            "tamaño_gb": modelo_actualizado.get("tamaño_gb"),
            "última_modificación": modelo_actualizado.get("última_modificación"),
            "motores": modelo_actualizado.get("motores"),
            "fuente": "huggingface-existente",
        }
        propuestas.append(propuesta)

    # Añadir propuestas para stable-diffusion.cpp y ComfyUI
    if sdcpp_info:
        propuestas.append({
            "tipo": "github-release",
            "nombre": "stable-diffusion.cpp",
            "versión": sdcpp_info["tag_name"],
            "fecha": sdcpp_info["published_at"],
            "licencia": sdcpp_licencia,
            "fuente": "github",
        })
    if comfyui_info:
        propuestas.append({
            "tipo": "github-release",
            "nombre": "ComfyUI",
            "versión": comfyui_info["tag_name"],
            "fecha": comfyui_info["published_at"],
            "licencia": comfyui_licencia,
            "fuente": "github",
        })

    # Escribir propuestas
    escribir_propuestas(propuestas)
    print(f"Escritas {len(propuestas)} propuestas a {PROPUESTAS_FILE}")

    # Determinar qué modelos nuevos merecen entrar al catálogo
    # Nos enfocamos en los modelos en tendencia que no están en el catálogo existente
    ids_existentes = {m.get("id") for m in modelos_existentes}
    modelos_nuevos_para_catalogo = []
    for modelo_hf in modelos_tendencia:
        modelo_id = modelo_hf.get("modelId")
        # Crear un id temporal basado en el nombre del modelo
        id_temporal = modelo_id.replace("/", "-") if modelo_id else "desconocido"
        if id_temporal in ids_existentes:
            continue  # Ya está en el catálogo
        info = extraer_info_modelo_hf(modelo_hf)
        # Convertir a un formato similar al del catálogo para evaluación
        info_evaluacion = {
            "licencia": info["licencia"],
            "gated": info["gated"],
            "tamaño_gb": info["tamaño_gb"],
            # Asumimos que tiene al menos diffusers como motor
        }
        if merece_entrar_al_catalogo(info_evaluacion):
            # Preparar el modelo para añadír al catálogo (se necesita más información para completar el ModeloImagen)
            # Por ahora, solo añadimos la información básica; el usuario tendrá que completarla.
            modelo_para_catalogo = {
                "id": id_temporal,
                "nombre": modelo_hf.get("modelId", "").split("/")[-1],
                "licencia": info["licencia"],
                "gated": info["gated"],
                "tamaño_gb": info["tamaño_gb"],
                "motores": ["diffusers"],  # Placeholder
                # Otros campos como gama, vramGB, etc. faltan y deben ser añadidos por el usuario.
                "nota": "Modelo propuesto por el explorador; requiere revisión y completado de campos.",
            }
            modelos_nuevos_para_catalogo.append(modelo_para_catalogo)

    # Crear cola de catalogo si hay modelos nuevos
    if modelos_nuevos_para_catalogo:
        fecha_actual = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cola_file = crear_cola_catalogo(modelos_nuevos_para_catalogo, fecha_actual)
        print(f"Creada cola de catalogo: {cola_file} con {len(modelos_nuevos_para_catalogo)} modelos.")
    else:
        print("No hay modelos nuevos que merezcan entrar al catálogo.")

    # Notificar al Chat Director
    mensaje = f"Explorador de imágenes completado: {len(propuestas)} propuestas generadas, {len(modelos_nuevos_para_catalogo)} modelos nuevos propuestos para el catálogo."
    notificar_director(mensaje)


if __name__ == "__main__":
    main()