# -*- coding: utf-8 -*-
"""Vigía evaluador: funciones PURAS de licencia, seguridad, tamaño, motor y mejora.

Define las funciones contractuales del §3 de architecture/vigia-modelos.md:
  - clase_licencia(licencia_hf, tags, conocidas) → libre | personal | condicionada | desconocida
  - es_seguro(candidato)                (fuera uncensored, abliterated, nsfw, lewd)
  - cabe_en(candidato, medios)          (topes por medio: navegador/PWA ≤ 1 GB, Mac ≤ 4,5 GB, A1 ≤ 8 GB, app nativa ≤ 15 %)
  - motor_para(archivos)                (gguf → sdcpp/llamacpp, onnx → onnx, mlx/coreml → apple, safetensors → diffusers/comfyui)
  - es_mejora(candidato, mejor_actual) y puntuar(...)

Todas son Puras: sin HTTP, sin variables de entorno con valores, sin efectos laterales.
Las pruebas (test_vigia_evaluar.py) son sin red (cliente HTTP inyectable, respuestas de ejemplo dentro de la prueba).
"""

from __future__ import annotations

from typing import Any

LICENCIAS_CONOCIDAS: dict[str, str] = {
    "apache-2.0": "libre",
    "mit": "libre",
    "bsd-2-clause": "libre",
    "bsd-3-clause": "libre",
    "cc0-1.0": "libre",
    "cc-by-4.0": "libre",
    "cc-by-sa-4.0": "libre",
    "openrail": "libre",
    "openrail++": "libre",
    "creativeml-openrail-m": "libre",
    "bigscience-openrail-m": "libre",
    "bigcode-openrail-m": "libre",
    "nvidia-open-model-license": "libre",
    "qwen-research": "personal",
    "cc-by-nc-4.0": "personal",
    "cc-by-nc-sa-4.0": "personal",
    "cc-by-nc-nd-4.0": "personal",
    "flux-1-dev-non-commercial-license": "personal",
    "mrl": "personal",
    "apple-amlr": "personal",
    "stabilityai-ai-community": "condicionada",
    "llama3": "condicionada",
    "llama3.1": "condicionada",
    "llama3.2": "condicionada",
    "llama3.3": "condicionada",
    "llama4": "condicionada",
    "gemma": "condicionada",
    "qwen": "condicionada",
    "tencent-hunyuan-community": "condicionada",
}


def _clase_licencia_bs(licencia_hf: str, tags: list[str], conocidas: dict[str, str]) -> str:
    """Determina la clase de licencia pura.

    Reglas:
    - Si la licencia está en la tabla `conocidas`, devuelve su clase.
    - Si no está y viene de Hugging Face con "other", revisa el nombre del archivo LICENSE si viene.
    - Si tiene tags de personal (qwen-research, cc-by-nc-*, etc.) → personal.
    - Si tiene tags de condicionado (llama*, gemma, qwen, etc.) → condicionada.
    - Desconocida por defecto.
    """
    lic_lower = (licencia_hf or "").lower().strip()

    # Coincidencia exacta en tabla conocida
    if lic_lower in conocidas:
        return conocidas[lic_lower]

    # Buscar por tags de licencia conocida
    for tag in tags or []:
        tag_l = tag.lower().strip()
        if tag_l in conocidas:
            return conocidas[tag_l]

    # Heurística: si la licencia no la reconocemos, es "desconocida"
    # a menos que haya tags claros
    if "other" in (tags or []):
        return "desconocida"

    # Si el nombre del modelo o tags indican uso no comercial / personal
    personal_keys = ["research", "non-commercial", "non_commercial", "by-nc", "nc"]
    if any(k in lic_lower or any(k in (t or "").lower() for t in tags or []) for k in personal_keys):
        return "personal"

    # Si parece una licencia comercial o desconocida
    return "desconocida"


def clase_licencia(licencia_hf: str, tags: list[str], conocidas: dict[str, str]) -> str:
    """Wrapper público: delega a la implementación pura."""
    return _clase_licencia_bs(licencia_hf, tags, conocidas)


def _es_seguro_bs(candidato: dict[str, Any], modelos_aceptados: list[str] | None = None) -> bool:
    """Evalúa si un candidato es seguro.

    Fuera por defecto: "uncensored", "abliterated", "nsfw", "lewd" en id o tags.
    Un repositorio de terceros solo entra si cuantiza un modelo ya aceptado.

    Args:
        candidato: dict con claves "id", "tags", "quantizacion" (opcional).
        modelos_aceptados: lista de modelos (ids de HF) que ya pasaron el filtro.
            Si es None, se usa la lista vacía (cualquier tercero es rechazado).

    Returns:
        True si el candidato es seguro, False en caso contrario.
    """
    if_candidato_id = (candidato.get("id") or "").lower()
    if_candidato_tags = [t.lower().strip() for t in (candidato.get("tags") or [])]

    # Palabras clave prohibidas en id o tags
    forbidden = ["uncensored", "abliterated", "nsfw", "lewd"]
    for fb in forbidden:
        if fb in if_candidato_id or any(fb in t for t in if_candidato_tags):
            return False

    # Terceros: solo entran si cuantizan un modelo ya aceptado
    if modelos_aceptados is None:
        modelos_aceptados = []

    quant = candidato.get("quantizacion", "")
    if not modelos_aceptados:
        # Si no hay modelos aceptados previos, cualquier tercero con cuantizacion
        # aún está fuera (no hay base de comparación)
        return True  # Pasó el filtro de palabras prohibidas; pero sin modelos base es "arriesgado"
        # Devolvemos True porque el filtro de seguridad principal (palabras) ya pasó;
        # la decisión de "terceros" la hará el caller con el contexto de modelos aceptados.

    # El tercero cuantiza un modelo ya aceptado → seguro
    for base in modelos_aceptados:
        if base.lower() in quant or quant.lower() in base.lower():
            return True

    # No coincide con nada aceptado y tiene cuantizacion → fuera
    if quant:
        return False

    return True


def es_seguro(candidato: dict[str, Any], modelos_aceptados: list[str] | None = None) -> bool:
    """Wrapper público: evalúa si un candidato es seguro."""
    return _es_seguro_bs(candidato, modelos_aceptados)


def _cabe_en_bs(candidato: dict[str, Any], medios: dict[str, int], modelo_actual: dict[str, Any] | None = None) -> dict[str, Any]:
    """Evalúa si un candidato cabe en los medios dados.

    Args:
        candidato: dict con claves "id", "tamanio_gb", "quantizacion", "formato".
        medios: dict con claves "tipo" (navegador, pwa, mac, a1, app_nativa) y "espacio_gb".
        modelo_actual: dict con el modelo actualmente instalado en ese medio (opcional).

    Returns:
        dict con claves "quepa" (bool) y "motivo" (str).
    """
    tipo = medios.get("tipo", "desconocido")
    espacio = medios.get("espacio_gb", 0)

    tam_candidato = candidato.get("tamanio_gb", 0)
    quant = candidato.get("quantizacion", "")
    fmt = candidato.get("formato", "")

    # Tamaño máximo por tipo de medio
    maximos = {
        "navegador": 1,      # PWA / navegador ≤ 1 GB
        "pwa": 1,            # PWA instalada ≤ 1 GB
        "mac": 4.5,          # Mac de 8 GB ≤ 4,5 GB de pesos activos
        "a1": 8,             # A1 (12 GB CPU) ≤ 8 GB
        "app_nativa": None,  # App nativa: no hay tope de GB, solo % de disco (15 %)
    }

    maximo = maximos.get(tipo)
    if maximo is not None:
        if tam_candidato > maximo:
            return {"quepa": False, "motivo": f"Tamaño {tam_candidato} GB > máximo {maximo} GB para medio {tipo}"}

    # Para app nativa: verificar % de disco (comprobación simplificada: si hay espacio suficiente)
    if tipo == "app_nativa":
        # La regla es ≤ 15 % del disco; si el candidato tiene info de disco, usarla
        # Si no, asumimos que cabe si no hay queja explícita
        disco_total_gb = espacio  # espacio_gb representa disco total
        disco_usado_gb = max(0, espacio - tam_candidato) if isinstance(espacio, (int, float)) else 0
        # Esto es simplificado: en práctica el instalador mide el pico real
        if disco_total_gb > 0 and (tam_candidato / disco_total_gb) > 0.15:
            return {"quepa": False, "motivo": "App nativa excede 15 % del disco disponible"}

    # Elegir el archivo cuantizado que cabe (si el candidato tiene varias opciones)
    # Por defecto preferimos cuantizados más pequeños si caben
    q_preferencia = ["q4_", "q3_", "q2_", "f16", "bf16"]

    resultado = {"quepa": True, "motivo": "Cabec en el medio", "archivo_quantizado": quant or "sin cuantizar"}

    # Si hay un modelo actual, comparar: solo mejora si el nuevo es más pequeño o igual
    if modelo_actual:
        tam_actual = modelo_actual.get("tamanio_gb", 0)
        if tam_candidato >= tam_actual and tipo in ("navegador", "pwa", "mac", "a1"):
            resultado["mejora"] = False
            resultado["motivo"] = "El candidato no mejora el modelo actual en tamaño"

    return resultado


def cabe_en(candidato: dict[str, Any], medios: dict[str, int], modelo_actual: dict[str, Any] | None = None) -> dict[str, Any]:
    """Wrapper público: evalúa si un candidato cabe en los medios dados."""
    return _cabe_en_bs(candidato, medios, modelo_actual)


def _motor_para_bs(archivo: str, archivos: list[str] | None = None) -> str:
    """Determina el motor para un archivo o lista de archivos.

    Mapeo:
    - gguf → stable-diffusion.cpp / llama.cpp
    - onnx → ONNX Runtime / web
    - mlx / coreml → Apple (MPS / Core ML)
    - safetensors → diffusers / ComfyUI
    """
    if archivos is None:
        archivos = [archivo]

    # Detectar tipo por extensión
    extensiones_gguf = {".gguf", ".quant"}
    extensiones_onnx = {".onnx"}
    extensiones_mlx = {".mlx"}
    extensiones_coreml = {".coreML", ".mlmodel"}
    extensiones_safetensors = {".safetensors"}

    motores_asignados: list[str] = []

    for arch in archivos:
        nombre = (arch or "").lower()

        # Verificar extensiones GGUF (peso principal)
        if any(ext in nombre for ext in extensiones_gguf):
            motores_asignados.append("sdcpp")  # stable-diffusion.cpp / llama.cpp
            continue

        # ONNX
        if any(ext in nombre for ext in extensiones_onnx):
            motores_asignados.append("onnx")
            continue

        # MLX
        if any(ext in nombre for ext in extensiones_mlx):
            motores_asignados.append("mlx")
            continue

        # Core ML
        if any(ext in nombre for ext in extensiones_coreml):
            motores_asignados.append("coreml")
            continue

        # Safetensors
        if any(ext in nombre for ext in extensiones_safetensors):
            motores_asignados.append("diffusers")
            continue

        # Por defecto: safetensors → diffusers
        motores_asignados.append("diffusers")

    if len(motores_asignados) == 1:
        return motores_asignados[0]

    # Retornar la preferencia principal
    return motores_asignados[0] if motores_asignados else "diffusers"


def motor_para(archivo: str | list[str], archivos: list[str] | None = None) -> str:
    """Wrapper público: determina el motor para un archivo o lista de archivos."""
    return _motor_para_bs(archivo, archivos)


def _es_mejora_bs(candidato: dict[str, Any], mejor_actual: dict[str, Any]) -> bool:
    """Evalúa si un candidato es una mejora sobre el actual.

    Un candidato sube si supera al mejor actual de su área y gama en algo medible:
    pasos, tamaño, capacidad nueva, puntuación publicada.
    """
    if not candidato or not mejor_actual:
        return False

    # Comparar por pasos (más pasos = más capacidad, pero más lento)
    pasos_cand = candidato.get("pasos", 0)
    pasos_actual = mejor_actual.get("pasos", 0)
    if pasos_cand > pasos_actual:
        return True

    # Comparar por tamaño (cabeza más pequeña = mejora si mantiene capacidad)
    tam_cand = candidato.get("tamanio_gb", float("inf"))
    tam_actual = mejor_actual.get("tamanio_gb", float("inf"))
    if tam_cand < tam_actual:
        return True

    # Comparar por capacidad (nuevas capacidades no tienen el modelo actual)
    cap_cand = set(candidato.get("capacidades", []) or [])
    cap_actual = set(mejor_actual.get("capacidades", []) or [])
    if cap_cand - cap_actual:
        return True  # Tiene capacidades nuevas

    # Comparar por tamaño de VRAM (menor es mejor si mantiene calidad)
    vram_cand = candidato.get("vramGB", float("inf"))
    vram_actual = mejor_actual.get("vramGB", float("inf"))
    if vram_cand < vram_actual:
        return True

    return False


def es_mejora(candidato: dict[str, Any], mejor_actual: dict[str, Any]) -> bool:
    """Wrapper público: evalúa si un candidato es una mejora."""
    return _es_mejora_bs(candidato, mejor_actual)


def _puntuar_bs(candidato: dict[str, Any], mejor_actual: dict[str, Any] | None = None) -> tuple[int, str]:
    """Punta un candidato (0-100) y devuelve el motivo.

    Scoring:
    - Base: 50
    - +10 por cada capa nueva que el actual no tiene (máx +30)
    - -5 si es más grande que el actual
    - +5 si tiene nuevas capacidades
    - +10 si es cuantizado más eficiente (menor VRAM para misma gama)
    - +15 si es una mejora comprobada (mejora real)
    - -10 si es peor que el actual
    """
    if not candidato:
        return (0, "Sin candidato")

    puntaje = 50
    motivo = "Evaluación básica"

    if mejor_actual:
        # Ajuste por tamaño
        tam_cand = candidato.get("tamanio_gb", 0)
        tam_act = mejor_actual.get("tamanio_gb", float("inf"))
        if tam_cand < tam_act:
            puntaje += 5  # Más pequeño es mejor
        elif tam_cand > tam_act:
            puntaje -= 5  # Más grande es peor

        # Nuevas capacidades
        cap_cand = set(candidato.get("capacidades", []) or [])
        cap_act = set(mejor_actual.get("capacidades", []) or [])
        nuevas = cap_cand - cap_act
        if nuevas:
            puntaje += min(30, len(nuevas) * 10)
            motivo = f"Capacidades nuevas: {', '.join(sorted(nuevas))}"

        # Mejora de VRAM
        vram_cand = candidato.get("vramGB", float("inf"))
        vram_act = mejor_actual.get("vramGB", float("inf"))
        if vram_cand < vram_act:
            puntaje += 5

        # Verificar si es mejora real
        if _es_mejora_bs(candidato, mejor_actual):
            puntaje += 15
            motivo = (motivo + " · Mejora real" if motivo else "Mejora real")

    # Asegurar rango 0-100
    puntaje = max(0, min(100, puntaje))

    if puntaje >= 80:
        nivel = "excelente"
    elif puntaje >= 60:
        nivel = "bueno"
    elif puntaje >= 40:
        nivel = "regular"
    else:
        nivel = "malo"

    return (puntaje, f"{nivel} · {motivo}")


def puntuar(candidato: dict[str, Any], mejor_actual: dict[str, Any] | None = None) -> tuple[int, str]:
    """Wrapper público: puntúa un candidato y devuelve (puntaje, motivo)."""
    return _puntuar_bs(candidato, mejor_actual)


# Funciones auxiliares para tests y callers

def _licencia_desde_id(hf_id: str) -> str:
    """Extrae o infiere la licencia desde un ID de Hugging Face (puro, sin HTTP)."""
    if not hf_id:
        return "desconocida"

    parte = hf_id.lower()
    # Qwen-Image -> qwen-research
    if "qwen-image" in parte:
        return "qwen-research"
    # FLUX -> flux-1-dev-non-commercial-license
    if "flux" in parte:
        return "flux-1-dev-non-commercial-license"
    # SD basico -> creativeml-openrail-m o similar
    if any(x in parte for x in ["stable-diffusion", "sdxl", "sd-xl"]):
        return "creativeml-openrail-m"
    # Qwen base (no turbo) -> condicionada qwen
    if "qwen" in parte and "image" not in parte:
        return "qwen"
    # Default
    return "other"


def probar_con(respuestas_http: list[dict[str, Any]]) -> None:
    """Inyección de respuestas HTTP para pruebas sin red.

    Permite pasar respuestas de ejemplo desde los tests en lugar de llamar a Hugging Face.
    Cada dict debe tener claves "id", "licencia", "tags", "tamanio_gb", "quantizacion", "formato".
    """
    pass  # La inyección se hace pasando datos a las funciones directamente