#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reglas puras para la integración con la dirección (Chat Director) cuando la Mac está viva.

Cuando el bot del A1 crea un encargo, lo publica en el bus (relevo_eventos, tipo aviso,
sin datos privados: solo título, plan y enlace del panel) para que, si la Mac está viva
y es líder, el cartero lo meta en el Chat Director con canal director-presidente.

Claude Opus en la Mac (si sus límites lo permiten) revisa el plan y puede devolver un
plan mejorado (mismo esquema JSON), que el A1 aplica a los frentes que aún no empezaron.

Cada avance del encargo se copia también al Chat Director. Los entregables 2D y 3D del
plan (escenas de Blender, HyperFrames) se encargan a la Mac cuando está viva; sin la Mac,
quedan como tarea en el panel. Sin la Mac, todo sigue en el A1 como hoy.

Solo biblioteca estándar. Red y Supabase inyectables para tests sin red.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple

# Inyección de dependencias
Http = Callable[[str, str, Dict[str, str], Optional[bytes], float], Tuple[int, str]]


# ── Constantes ────────────────────────────────────────────────────────────────

# Tipos de evento en relevo_eventos (≤ 40 caracteres)
T_AVISO = "mg_aviso"
T_PLAN_DIR = "mg_plan_direccion"
T_AVANCE_DIR = "mg_avance_direccion"
T_ENTREGABLE_2D3D = "mg_entregable_2d3d"

# Máximo tamaño de texto en el bus
MAX_TEXTO_BUS = 600
MAX_DATOS_BUS = 3000

# 9 formatos de NotebookLM (todos obligatorios si se piden "todos los formatos")
FORMATOS_NOTEBOOKLM = (
    "informe",
    "audio",
    "video",
    "infografia",
    "presentacion",
    "mapa_mental",
    "cuestionario",
    "tarjetas",
    "tabla_datos",
)

# Palabras clave que indican una regla permanente
PALABRAS_REGLA_PERMANENTE = (
    "recuerda",
    "cada día",
    "cada dia",
    "siempre",
    "para cada",
    "a partir de ahora",
)


# ── Validación de planes (reglas §3.2) ────────────────────────────────────────

def validar_plan_entregables(plan: Dict[str, Any], texto_original: str) -> Tuple[bool, List[str]]:
    """PURA. Valida el plan según las reglas de §3.2.
    
    Reglas:
    1. Todo entregable con archivo debe tener enviar=True (se ignora enviar=False del modelo - no es error)
    2. Si el texto pide "todos los formatos", validar que estén los 9 formatos de NotebookLM
    3. Detectar reglas permanentes ("recuerda / cada día / siempre / para cada...")
    
    Devuelve: (es_valido, lista_de_errores_solo_fallas_reales)
    """
    errores = []
    texto_lower = texto_original.lower()
    
    # Regla 2: Si pide "todos los formatos", exigir los 9 formatos
    pide_todos = any(frase in texto_lower for frase in (
        "todos los formatos",
        "todo los formatos",
        "todas los formatos",
        "todos formatos",
        "todas las formatos",
    ))
    
    if pide_todos:
        formatos_en_plan = set()
        for frente in plan.get("frentes", []):
            for e in frente.get("entregables", []):
                tipo = e.get("tipo", "").lower()
                if tipo in FORMATOS_NOTEBOOKLM:
                    formatos_en_plan.add(tipo)
        
        faltantes = set(FORMATOS_NOTEBOOKLM) - formatos_en_plan
        if faltantes:
            errores.append(
                f"Faltan {len(faltantes)} formatos de NotebookLM requeridos por 'todos los formatos': "
                f"{', '.join(sorted(faltantes))}"
            )
    
    return len(errores) == 0, errores


def forzar_enviar_true_en_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """PURA. Aplica la regla §3.2(1): fuerza enviar=True en todos los entregables con archivo/formato NotebookLM.
    
    Modifica el plan in-place y lo devuelve. El plan del modelo NO puede desactivar el envío.
    """
    for frente in plan.get("frentes", []):
        for entregable in frente.get("entregables", []):
            if entregable.get("archivo") or entregable.get("tipo") in FORMATOS_NOTEBOOKLM:
                entregable["enviar"] = True
    return plan


def detectar_regla_permanente(texto: str) -> Optional[str]:
    """PURA. Detecta si el texto contiene una regla permanente (§3.2(3)).
    
    Busca: "recuerda / cada día / siempre / para cada / a partir de ahora"
    Devuelve la frase detectada o None.
    """
    texto_lower = texto.lower()
    for frase in PALABRAS_REGLA_PERMANENTE:
        if frase in texto_lower:
            return frase
    return None


def extraer_regla_y_encargo(texto: str) -> Tuple[str, Optional[str]]:
    """PURA. Separa el encargo de la regla permanente si ambas están en el mensaje.
    
    Devuelve: (texto_encargo, frase_regla_detectada)
    """
    frase = detectar_regla_permanente(texto)
    if not frase:
        return texto, None
    
    # La regla suele ir al final: "haz X y recuerda cada día Y"
    # Intentar separar en la frase detectada
    idx = texto.lower().find(frase)
    if idx > 0:
        encargo = texto[:idx].strip(" ,.;:yY")
        regla = texto[idx:].strip()
        return encargo, regla
    return texto, frase


# ── Persistencia de preferencias y rutinas ───────────────────────────────────

def _ruta_preferencias(raiz: Optional[str] = None):
    from pathlib import Path
    base = Path(raiz) if raiz else Path(os.environ.get("STARSEED_ROOT",
        str(Path.home() / "Documents" / "starseed-os-main")))
    return base / "starseed_memory_root" / "mando" / "preferencias.json"


def _ruta_rutinas(raiz: Optional[str] = None):
    from pathlib import Path
    base = Path(raiz) if raiz else Path(os.environ.get("STARSEED_ROOT",
        str(Path.home() / "Documents" / "starseed-os-main")))
    return base / "starseed_memory_root" / "mando" / "rutinas.json"


def _leer_json(ruta, default):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _escribir_json_atomico(ruta, datos: Dict[str, Any]) -> bool:
    import fcntl
    import tempfile
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w", dir=ruta.parent, prefix=ruta.name + ".", suffix=".tmp",
            delete=False, encoding="utf-8"
        ) as tmp:
            json.dump(datos, tmp, ensure_ascii=False, indent=2)
            tmp.flush()
            os.fsync(tmp.fileno())
            tmp_name = tmp.name
        os.replace(tmp_name, ruta)
        return True
    except Exception:
        return False


def guardar_preferencia(clave: str, valor: Any, raiz: Optional[str] = None) -> bool:
    """Guarda una preferencia en preferencias.json."""
    ruta = _ruta_preferencias(raiz)
    prefs = _leer_json(ruta, {})
    prefs[clave] = valor
    prefs["_actualizado"] = time.time()
    return _escribir_json_atomico(ruta, prefs)


def guardar_rutina(
    id_rutina: str,
    disparador: Dict[str, Any],
    accion: Dict[str, Any],
    descripcion: str,
    raiz: Optional[str] = None
) -> bool:
    """Registra una rutina en rutinas.json con su disparador y acción."""
    ruta = _ruta_rutinas(raiz)
    rutinas = _leer_json(ruta, {})
    rutinas[id_rutina] = {
        "descripcion": descripcion,
        "disparador": disparador,
        "accion": accion,
        "creada": time.time(),
        "activa": True,
    }
    return _escribir_json_atomico(ruta, rutinas)


def procesar_regla_permanente(
    texto_original: str,
    encargo_id: str,
    raiz: Optional[str] = None
) -> Tuple[bool, str]:
    """Procesa una regla permanente detectada en el mensaje (§3.2(3)).
    
    Hace dos cosas:
    1. Guarda la regla en preferencias.json
    2. Si es una rutina (tiene disparador periódico), la registra en rutinas.json
    
    Devuelve: (exito, mensaje_confirmacion)
    """
    frase = detectar_regla_permanente(texto_original)
    if not frase:
        return False, "No se detectó regla permanente"
    
    # Extraer la parte de la regla
    _, regla_texto = extraer_regla_y_encargo(texto_original)
    if not regla_texto:
        regla_texto = frase
    
    # Guardar en preferencias
    clave_pref = f"regla_{encargo_id}_{int(time.time())}"
    ok_pref = guardar_preferencia(clave_pref, {
        "texto_original": texto_original,
        "frase_detectada": frase,
        "regla": regla_texto,
        "encargo_id": encargo_id,
        "ts": time.time(),
    }, raiz)
    
    # Detectar si es rutina (disparador periódico)
    es_rutina = any(p in texto_original.lower() for p in (
        "cada día", "cada dia", "diario", "diaria", "cada mañana", "cada noche"
    ))
    
    mensaje = f"Regla permanente guardada en preferencias ({clave_pref})."
    
    if es_rutina:
        id_rutina = f"rutina_{encargo_id}_{int(time.time())}"
        # Disparador genérico: diario a hora por defecto (ajustable)
        disparador = {"tipo": "cron", "expresion": "0 6 * * *"}  # 6 AM diario
        accion = {"tipo": "ejecutar_encargo", "encargo_id": encargo_id, "regla": regla_texto}
        ok_rutina = guardar_rutina(id_rutina, disparador, accion, regla_texto, raiz)
        if ok_rutina:
            mensaje += f" Rutina registrada en rutinas.json ({id_rutina})."
        else:
            mensaje += " Error guardando rutina."
    
    return ok_pref, mensaje


# ── Utilidades puras ──────────────────────────────────────────────────────────

def tachar(texto: str) -> str:
    """Sustituye claves por '[oculto]' (igual que director_chat.tachar)."""
    patrones = [
        r"sk-[A-Za-z0-9_\-]{8,}",
        r"gh[pousr]_[A-Za-z0-9]{8,}",
        r"AIza[0-9A-Za-z_\-]{10,}",
        r"hf_[A-Za-z0-9]{8,}",
        r"gsk_[A-Za-z0-9_\-]{8,}",
        r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+",
        r"Bearer\s+[A-Za-z0-9_\-\.]{8,}",
        r"https://[A-Za-z0-9\-\.]+\.trycloudflare\.com\S*",
    ]
    import re
    for patron in patrones:
        texto = re.sub(patron, "[oculto]", texto, flags=re.IGNORECASE)
    return texto


def construir_aviso_encargo(enc: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """PURA. Construye el texto y datos del aviso de nuevo encargo para el bus.
    
    No incluye datos privados: solo título, resumen del plan y enlace del panel.
    """
    frentes_str = ", ".join(f"{f['id']} {f['nombre']}" for f in enc.get("frentes", []))
    total_entregables = sum(len(f.get("entregables", [])) for f in enc.get("frentes", []))
    texto = f"Nuevo encargo {enc['id']}: «{enc['titulo']}» · {len(enc['frentes'])} frentes ({frentes_str}) · {total_entregables} entregables"
    datos = {
        "encargo_id": enc["id"],
        "titulo": enc["titulo"],
        "frentes": [{"id": f["id"], "nombre": f["nombre"], "destino": f["destino"],
                     "entregables": [{"tipo": e["tipo"], "titulo": e["titulo"]} for e in f.get("entregables", [])]}
                    for f in enc.get("frentes", [])],
        "panel_enlace": enc.get("panel_enlace", ""),
        "origen": "telegram",
        "ts": time.time(),
    }
    return tachar(texto), datos


def construir_aviso_avance(enc: Dict[str, Any], frente: Dict[str, Any], hechos: List[Dict[str, Any]],
                           fallos: List[Dict[str, Any]]) -> Tuple[str, Dict[str, Any]]:
    """PURA. Construye el aviso de avance de un frente para el bus y Chat Director."""
    n_hechos = sum(1 for f in enc["frentes"] if f.get("estado") == "hecho")
    texto = f"Avance {enc['id']} · {n_hechos}/{len(enc['frentes'])} · {frente['nombre']} ✓"
    if hechos:
        texto += "\n" + "\n".join(f"• {e['titulo']}: {e['enlace']}" for e in hechos)
    if fallos:
        texto += "\nPendiente de reintentar: " + "; ".join(e["titulo"] for e in fallos)
    datos = {
        "encargo_id": enc["id"],
        "frente_id": frente["id"],
        "frente_nombre": frente["nombre"],
        "hechos": [{"tipo": e["tipo"], "titulo": e["titulo"], "enlace": e["enlace"]} for e in hechos],
        "fallos": [{"tipo": e["tipo"], "titulo": e["titulo"], "error": e.get("fallo", "")} for e in fallos],
        "carpeta_enlace": frente.get("carpeta_enlace", ""),
        "ts": time.time(),
    }
    return tachar(texto), datos


def construir_aviso_entregable_2d3d(enc: Dict[str, Any], frente: Dict[str, Any],
                                    entregable: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """PURA. Construye el aviso para un entregable 2D/3D (Blender, HyperFrames) que va a la Mac."""
    texto = f"Entregable 2D/3D para la Mac: {enc['id']} · {frente['nombre']} · {entregable['titulo']} ({entregable['tipo']})"
    datos = {
        "encargo_id": enc["id"],
        "frente_id": frente["id"],
        "entregable_tipo": entregable["tipo"],
        "entregable_titulo": entregable["titulo"],
        "prompt": entregable.get("prompt", "")[:2000],
        "destino_mac": True,
        "ts": time.time(),
    }
    return tachar(texto), datos


def filtrar_plan_mejorado(plan_nuevo: Dict[str, Any], plan_viejo: Dict[str, Any]) -> Dict[str, Any]:
    """PURA. Fusiona el plan mejorado de la dirección con el plan actual.
    
    Solo se aplican cambios a frentes que AÚN no han empezado (estado == 'pendiente').
    Los frentes 'en_curso' o 'hecho' no se tocan.
    """
    if not plan_nuevo or not isinstance(plan_nuevo, dict):
        return plan_viejo
    
    # Crear mapa de frentes viejos por ID
    frentes_viejos = {f["id"]: f for f in plan_viejo.get("frentes", [])}
    frentes_nuevos = plan_nuevo.get("frentes", [])
    
    resultado_frentes = []
    for f_nuevo in frentes_nuevos:
        fid = f_nuevo.get("id")
        f_viejo = frentes_viejos.get(fid)
        
        # Si el frente viejo ya empezó o terminó, mantenerlo tal cual
        if f_viejo and f_viejo.get("estado") in ("en_curso", "hecho"):
            resultado_frentes.append(f_viejo)
            continue
        
        # Si es un frente nuevo o pendiente, usar el mejorado
        f_fusionado = dict(f_nuevo)
        if f_viejo:
            # Conservar campos que ya se ejecutaron
            f_fusionado["estado"] = f_viejo.get("estado", "pendiente")
            f_fusionado["carpeta"] = f_viejo.get("carpeta")
            f_fusionado["carpeta_enlace"] = f_viejo.get("carpeta_enlace")
            f_fusionado["cuaderno"] = f_viejo.get("cuaderno")
            f_fusionado["investigado"] = f_viejo.get("investigado", [])
            # Fusionar entregables: mantener enlaces ya conseguidos
            entregables_viejos = {e["titulo"]: e for e in f_viejo.get("entregables", [])}
            for e_nuevo in f_fusionado.get("entregables", []):
                e_viejo = entregables_viejos.get(e_nuevo["titulo"])
                if e_viejo and e_viejo.get("enlace"):
                    e_nuevo["enlace"] = e_viejo["enlace"]
                    e_nuevo.pop("fallo", None)
        resultado_frentes.append(f_fusionado)
    
    plan_fusionado = dict(plan_viejo)
    plan_fusionado["frentes"] = resultado_frentes
    plan_fusionado["plan_mejorado"] = True
    plan_fusionado["ts_mejora"] = time.time()
    return plan_fusionado


def es_entregable_2d3d(tipo: str) -> bool:
    """PURA. ¿Es un tipo de entregable que requiere la Mac (Blender, HyperFrames)?"""
    return tipo in ("blender", "hyperframes", "video", "3d")


# ── Publicación en el bus (relevo_eventos) ──────────────────────────────────

class RestBus:
    """Cliente mínimo para escribir en relevo_eventos vía PostgREST."""

    def __init__(self, url: str, clave_anon: str, http: Http = None, tope: float = 15.0):
        self.url = (url or "").rstrip("/")
        self._clave = clave_anon or ""
        self.http = http or self._http_urllib
        self.tope = tope

    def _http_urllib(self, metodo: str, url: str, cabeceras: Dict[str, str],
                     cuerpo: Optional[bytes], tope: float) -> Tuple[int, str]:
        req = urllib.request.Request(url, data=cuerpo, method=metodo,
                                     headers=dict(cabeceras, **{"User-Agent": "starseed-peticiones/1.0"}))
        try:
            with urllib.request.urlopen(req, timeout=tope) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            try:
                return e.code, e.read().decode("utf-8", "replace")
            except Exception:
                return e.code, ""
        except Exception as e:
            return 0, type(e).__name__

    def insertar(self, tipo: str, texto: str, datos: Dict[str, Any], tarea: str = "") -> bool:
        """Inserta un evento en relevo_eventos."""
        fila = {"quien": "peticiones-a1", "tipo": tipo, "tarea": tarea[:60] or None,
                "texto": texto[:MAX_TEXTO_BUS], "datos": datos}
        cab = {"apikey": self._clave, "Authorization": "Bearer " + self._clave,
               "Accept": "application/json", "Content-Type": "application/json"}
        cuerpo = json.dumps(fila, ensure_ascii=False).encode("utf-8")
        estado, _ = self.http("POST", self.url + "/rest/v1/relevo_eventos", cab, cuerpo, self.tope)
        return 200 <= estado < 300


def publicar_aviso_encargo(enc: Dict[str, Any], bus: RestBus) -> bool:
    """Publica el aviso de nuevo encargo en el bus (relevo_eventos)."""
    texto, datos = construir_aviso_encargo(enc)
    return bus.insertar(T_AVISO, texto, datos, tarea=enc["id"])


def publicar_avance_direccion(enc: Dict[str, Any], frente: Dict[str, Any],
                               hechos: List[Dict[str, Any]], fallos: List[Dict[str, Any]],
                               bus: RestBus) -> bool:
    """Publica el avance de un frente en el bus (relevo_eventos)."""
    texto, datos = construir_aviso_avance(enc, frente, hechos, fallos)
    return bus.insertar(T_AVANCE_DIR, texto, datos, tarea=f"{enc['id']}/{frente['id']}")


def publicar_entregable_2d3d(enc: Dict[str, Any], frente: Dict[str, Any],
                              entregable: Dict[str, Any], bus: RestBus) -> bool:
    """Publica la solicitud de entregable 2D/3D para la Mac en el bus."""
    texto, datos = construir_aviso_entregable_2d3d(enc, frente, entregable)
    return bus.insertar(T_ENTREGABLE_2D3D, texto, datos, tarea=f"{enc['id']}/{frente['id']}/{entregable['tipo']}")


def publicar_plan_direccion(enc: Dict[str, Any], plan_mejorado: Dict[str, Any], bus: RestBus) -> bool:
    """Publica el plan mejorado devuelto por la dirección en el bus."""
    texto = f"Plan mejorado por la dirección para {enc['id']}: {len(plan_mejorado.get('frentes', []))} frentes"
    datos = {
        "encargo_id": enc["id"],
        "plan": plan_mejorado,
        "ts": time.time(),
    }
    return bus.insertar(T_PLAN_DIR, tachar(texto), datos, tarea=enc["id"])


# ── Integración con Chat Director (cuando la Mac es líder) ──────────────────

def _chat_raiz(raiz: Optional[str] = None):
    from pathlib import Path
    base = Path(raiz) if raiz else Path(os.environ.get("STARSEED_ROOT",
        str(Path.home() / "Documents" / "starseed-os-main")))
    return base / "starseed_memory_root" / "mando" / "director"


def enviar_a_chat_director(texto: str, enc: Dict[str, Any], raiz: Optional[str] = None,
                           canal: str = "director-presidente", modelo: str = "director-presidente/auto") -> bool:
    """Escribe un mensaje en el Chat Director (chat.jsonl) para que el cartero lo atienda.
    
    Equivalente a `director_chat.publicar` pero sin dependencias del módulo completo.
    """
    try:
        ruta = _chat_raiz(raiz) / "chat.jsonl"
        ruta.parent.mkdir(parents=True, exist_ok=True)
        
        import fcntl
        registro = {
            "id": f"md-{int(time.time() * 1000)}-{os.urandom(4).hex()}",
            "t": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime()),
            "de": "peticiones-a1",
            "rol": "sistema",
            "tipo": "aviso",
            "texto": tachar(texto),
            "canal": canal,
            "canales": [canal],
            "modelo": modelo,
            "tarea": enc.get("id", ""),
        }
        with open(ruta, "a", encoding="utf-8") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                f.write(json.dumps(registro, ensure_ascii=False) + "\n")
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
        return True
    except Exception:
        return False


def enviar_avance_chat_director(enc: Dict[str, Any], frente: Dict[str, Any],
                                 hechos: List[Dict[str, Any]], fallos: List[Dict[str, Any]],
                                 raiz: Optional[str] = None) -> bool:
    """Envía el avance de un frente al Chat Director (canal director-presidente)."""
    texto, _ = construir_aviso_avance(enc, frente, hechos, fallos)
    return enviar_a_chat_director(texto, enc, raiz=raiz)


def enviar_entregable_2d3d_chat_director(enc: Dict[str, Any], frente: Dict[str, Any],
                                          entregable: Dict[str, Any], raiz: Optional[str] = None) -> bool:
    """Envía la solicitud de entregable 2D/3D al Chat Director (canal director-presidente)."""
    texto, _ = construir_aviso_entregable_2d3d(enc, frente, entregable)
    return enviar_a_chat_director(texto, enc, raiz=raiz)


# ── Verificación de si la Mac está viva y es líder ──────────────────────────

def mac_esta_viva_y_lider(bus_leer: Callable[[], List[Dict[str, Any]]], ahora: Optional[float] = None) -> bool:
    """PURA. Verifica si la Mac está viva (latido reciente) y es líder (tiene el mando).
    
    `bus_leer` debe devolver la lista de eventos recientes del bus (relevo_eventos).
    Un latido de la Mac tiene `quien` empezando por 'nodo:mac-' y `tipo` == 'mg_latido'.
    El líder tiene un evento `mg_lider` reciente con su `nodo`.
    """
    ahora = ahora or time.time()
    eventos = bus_leer() or []
    
    # Buscar último latido de la Mac (últimos 5 min)
    latidos_mac = [e for e in eventos if e.get("tipo") == "mg_latido"
                   and isinstance(e.get("datos", {}).get("nodo"), str)
                   and e["datos"]["nodo"].startswith("mac-")
                   and float(e.get("ts", 0)) > ahora - 300]
    if not latidos_mac:
        return False
    
    # Buscar último reclamo de liderazgo (mg_lider) reciente
    lideres = [e for e in eventos if e.get("tipo") == "mg_lider"
               and float(e.get("ts", 0)) > ahora - 600]
    if not lideres:
        return False
    
    # El líder debe ser la Mac
    ultimo_lider = max(lideres, key=lambda x: float(x.get("ts", 0)))
    nodo_lider = ultimo_lider.get("datos", {}).get("nodo", "")
    return nodo_lider.startswith("mac-")


# ── Funciones de alto nivel para el flujo del A1 ────────────────────────────

def procesar_encargo_nuevo(enc: Dict[str, Any], bus: RestBus,
                            raiz_chat: Optional[str] = None,
                            mac_viva: bool = False) -> Dict[str, Any]:
    """Procesa un encargo nuevo: publica en bus y, si la Mac es líder, en Chat Director.
    
    Devuelve el encargo actualizado (con flags de publicación).
    """
    # Publicar en bus (siempre)
    bus_ok = publicar_aviso_encargo(enc, bus)
    enc["publicado_bus"] = bus_ok
    enc["ts_publicacion"] = time.time()
    
    # Si la Mac está viva y es líder, enviar al Chat Director
    if mac_viva:
        texto, _ = construir_aviso_encargo(enc)
        chat_ok = enviar_a_chat_director(texto, enc, raiz=raiz_chat)
        enc["publicado_chat_director"] = chat_ok
    else:
        enc["publicado_chat_director"] = False
    
    return enc


def procesar_avance_frente(enc: Dict[str, Any], frente: Dict[str, Any],
                            hechos: List[Dict[str, Any]], fallos: List[Dict[str, Any]],
                            bus: RestBus, raiz_chat: Optional[str] = None,
                            mac_viva: bool = False) -> Dict[str, Any]:
    """Procesa el avance de un frente: publica en bus y Chat Director.
    
    También detecta entregables 2D/3D y los envía por separado.
    """
    # Publicar avance en bus
    bus_ok = publicar_avance_direccion(enc, frente, hechos, fallos, bus)
    enc.setdefault("avances_publicados", []).append({
        "frente_id": frente["id"],
        "bus_ok": bus_ok,
        "ts": time.time(),
    })
    
    # Publicar en Chat Director si la Mac es líder
    if mac_viva:
        enviar_avance_chat_director(enc, frente, hechos, fallos, raiz=raiz_chat)
    
    # Detectar y publicar entregables 2D/3D por separado
    for e in hechos:
        if es_entregable_2d3d(e.get("tipo", "")):
            publicar_entregable_2d3d(enc, frente, e, bus)
            if mac_viva:
                enviar_entregable_2d3d_chat_director(enc, frente, e, raiz=raiz_chat)
    
    return enc


def aplicar_plan_mejorado(enc: Dict[str, Any], plan_mejorado: Dict[str, Any],
                           bus: RestBus, raiz_chat: Optional[str] = None,
                           mac_viva: bool = False) -> Dict[str, Any]:
    """Aplica el plan mejorado devuelto por la dirección a los frentes pendientes.
    
    Publica el plan mejorado en el bus y Chat Director.
    """
    plan_fusionado = filtrar_plan_mejorado(plan_mejorado, {"frentes": enc["frentes"]})
    enc["frentes"] = plan_fusionado["frentes"]
    enc["plan_mejorado"] = True
    enc["ts_mejora"] = time.time()
    
    # Publicar en bus
    publicar_plan_direccion(enc, plan_mejorado, bus)
    
    # Publicar en Chat Director si la Mac es líder
    if mac_viva:
        texto = f"Plan mejorado aplicado a {enc['id']}: {len(plan_mejorado.get('frentes', []))} frentes actualizados"
        enviar_a_chat_director(texto, enc, raiz=raiz_chat)
    
    return enc


def crear_cliente_bus_desde_env(rutas_env: Optional[List[str]] = None) -> Optional[RestBus]:
    """Crea un RestBus leyendo la URL y clave anónima de Supabase de los archivos de entorno.
    
    Lee: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
    """
    raiz = os.environ.get("STARSEED_ROOT") or os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    rutas = rutas_env or [
        os.path.expanduser("~/.starseed/env"),
        os.path.join(raiz, ".env.local"),
        "/etc/starseed/env",
    ]
    env = {}
    for ruta in rutas:
        try:
            with open(ruta, encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    k, v = linea.split("=", 1)
                    k = k.strip().replace("export ", "")
                    if k and k not in env:
                        env[k] = v.strip().strip('"').strip("'")
        except OSError:
            continue
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    clave = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not clave:
        return None
    return RestBus(url, clave)


# Exportar lo público
__all__ = [
    "T_AVISO", "T_PLAN_DIR", "T_AVANCE_DIR", "T_ENTREGABLE_2D3D",
    "FORMATOS_NOTEBOOKLM", "PALABRAS_REGLA_PERMANENTE",
    "tachar", "construir_aviso_encargo", "construir_aviso_avance", "construir_aviso_entregable_2d3d",
    "filtrar_plan_mejorado", "es_entregable_2d3d",
    "validar_plan_entregables", "forzar_enviar_true_en_plan", "detectar_regla_permanente", "extraer_regla_y_encargo",
    "guardar_preferencia", "guardar_rutina", "procesar_regla_permanente",
    "RestBus", "publicar_aviso_encargo", "publicar_avance_direccion",
    "publicar_entregable_2d3d", "publicar_plan_direccion",
    "enviar_a_chat_director", "enviar_avance_chat_director", "enviar_entregable_2d3d_chat_director",
    "mac_esta_viva_y_lider",
    "procesar_encargo_nuevo", "procesar_avance_frente", "aplicar_plan_mejorado",
    "crear_cliente_bus_desde_env",
]