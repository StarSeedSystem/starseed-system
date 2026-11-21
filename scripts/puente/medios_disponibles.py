#!/usr/bin/env python3
"""Qué MEDIOS de cómputo hay para el enjambre ahora mismo (2026-09-20).

Alex: «un botón para comprobar contenedores de memoria RAM para trabajar, incluyendo
los tuyos de Claude y también de otros medios: Hugging Face, Google Cloud con las cuentas
ya usadas… (que no sea Oracle)». Sondea, sin inventar y sin imprimir jamás una clave:
  · mac       — gobernador (tope vivo, RAM, máximo por hardware) y medios locales anunciados
  · claude    — contenedor de la sesión de Cowork: solo vive mientras hay sesión; se anuncia
                por el bus como medio «nube» (medios.json trae la última vez que se vio)
  · nube-gh   — GitHub Actions (repo público: runners 4 vCPU/16 GB, 6 h, ilimitado): gh
                autenticado, workflow presente, secretos puestos, últimas ejecuciones
  · hf        — Hugging Face: cuenta (whoami), plan, Spaces propios y su hardware. El Docker
                gratuito exige PRO (402 medido el 2026-09-20)
  · gcloud    — Google Cloud: gcloud instalado y autenticado, proyecto, servicios de Cloud Run
                (180.000 vCPU·s/mes gratis) y Cloud Shell (60 h/semana) como medio de tanda
  · colab     — Google Colab / Kaggle: sin API; medio por abrir con un cuaderno lanzador
  · cloudroom — Cloudroom (2026-10-24, CRM1024D/I): agentes de código en hilos de su nube (100 cada
                30 días en el plan gratis); sonda de `medio_cloudroom` (status, cloud status, thread count)
  · agy       — Antigravity CLI (`~/.local/bin/agy` con sesión de Google de Alex): escritores
                gemini-3.8-flash-medium / gemini-4-neon-high / claude-sonnet-5-5-medium (cuota Antigravity)
Salida: JSON por stdout (`--json`) o texto. Funciones puras (clasificar_*) probadas.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
ESTADOS = ("listo", "usable", "requiere_alex", "no_disponible")


def _env() -> dict:
    salida = dict(os.environ)
    for ruta in ("~/.starseed/env", "~/.hermes/.env"):
        try:
            for linea in open(os.path.expanduser(ruta), encoding="utf-8"):
                linea = linea.strip()
                if linea.startswith("export "):
                    linea = linea[7:].strip()
                if linea and not linea.startswith("#") and "=" in linea:
                    k, v = linea.split("=", 1)
                    v = v.strip().strip("\"'")
                    salida.setdefault(k.strip(), v)
        except OSError:
            pass
    return salida


def _sh(args, timeout=20, cwd=None):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
    except Exception as e:  # noqa: BLE001
        return 1, "", "%s: %s" % (type(e).__name__, e)


def _json(url, token=None, timeout=12):
    cab = {"User-Agent": "StarSeed-Mando/1.0"}
    if token:
        cab["Authorization"] = "Bearer " + token
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=cab), timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace")), None
    except Exception as e:  # noqa: BLE001
        return None, "%s" % type(e).__name__


def medio(id_, nombre, estado, capacidad="", detalle="", siguiente=""):
    assert estado in ESTADOS
    return {"id": id_, "nombre": nombre, "estado": estado, "capacidad": capacidad, "detalle": detalle, "siguiente_paso": siguiente}


# ── puras ────────────────────────────────────────────────────────────────────
def clasificar_mac(gob: dict | None) -> dict:
    if not gob:
        return medio("mac", "Esta Mac", "usable", "", "sin gobernador.json: tope por defecto", "bash scripts/puente/instalar-servicios.sh")
    n = int(gob.get("trabajadores") or 0)
    return medio(
        "mac", "Esta Mac", "listo" if n > 0 else "usable",
        "%d agente(s) ahora · máximo %s por hardware (%s GB)" % (n, gob.get("maximo_hardware", "?"), round(float(gob.get("ram_total_mb") or 0) / 1024, 1)),
        "%s · RAM libre %s MB" % (gob.get("motivo", ""), gob.get("ram_libre_mb", "?")),
    )


def clasificar_claude(medios: dict | None, ahora: float) -> dict:
    vistos = []
    for m in (medios or {}).get("medios", {}).values():
        if str(m.get("entorno")) == "nube" and str(m.get("origen")) in ("claude", "nube", "cowork"):
            vistos.append(float(m.get("latido") or 0))
    ultimo = max(vistos) if vistos else 0.0
    if ultimo and ahora - ultimo < 600:
        return medio("claude", "Contenedor de Claude (Cowork)", "listo", "2 vCPU · 8 GB · 2 agentes", "anunciado por el bus hace %d s" % int(ahora - ultimo), "")
    return medio(
        "claude", "Contenedor de Claude (Cowork)", "usable" if ultimo else "no_disponible",
        "2 vCPU · 8 GB · 2 agentes mientras dure la sesión",
        ("visto por última vez hace %.0f min" % ((ahora - ultimo) / 60)) if ultimo else "nunca anunciado en este medios.json",
        "pídele a Claude en la sesión abierta que arranque el orquestador en su contenedor (se reinicia cada 1–2 h)",
    )


#: Los nombres que lee `.github/workflows/enjambre-nube.yml` en su paso de claves. Solo
#: NOMBRES: ningún valor de clave aparece nunca aquí ni en la salida de este módulo.
CLAVES_DEL_ENJAMBRE = {
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY", "NVIDIA_SHARED_KEY",
    "OPENROUTER_API_KEY", "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY",
    "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY",
}


def clasificar_gh(auth_ok: bool, workflow: bool, secretos: list[str], runs: list[dict]) -> dict:
    if not auth_ok:
        return medio("nube-gh", "GitHub Actions", "requiere_alex", "3 agentes/job · 4 vCPU · 16 GB · 6 h", "gh sin sesión", "gh auth login")
    if not workflow:
        return medio("nube-gh", "GitHub Actions", "no_disponible", "", "falta .github/workflows/enjambre-nube.yml", "")
    # (2026-09-20) Antes bastaba con que el repo tuviera CUALQUIER secreto para decir
    # «usable», y este repo tiene seis de firma de Android y Tauri: el medio salía en verde
    # mientras el workflow moría en el paso de claves con «sin secretos». Un medio se declara
    # usable por lo que el enjambre NECESITA, no por lo que haya.
    if not [n for n in secretos if n in CLAVES_DEL_ENJAMBRE]:
        return medio("nube-gh", "GitHub Actions", "requiere_alex", "3 agentes/job · 4 vCPU · 16 GB · 6 h · ilimitado (repo público)", "ningún secreto de proveedor en el repo (los que hay son de firma)", "lo corre Alex: python3 scripts/puente/nube-gh.py secretos")
    activos = [r for r in runs if str(r.get("status")) in ("in_progress", "queued")]
    return medio(
        "nube-gh", "GitHub Actions", "listo" if activos else "usable",
        "3 agentes/job · 4 vCPU · 16 GB · 6 h · ilimitado (repo público)",
        "%d clave(s) de proveedor · %d ejecución(es) en marcha · última: %s" % (len([n for n in secretos if n in CLAVES_DEL_ENJAMBRE]), len(activos), (runs[0].get("conclusion") or runs[0].get("status")) if runs else "ninguna"),
        "" if activos else "python3 scripts/puente/nube-gh.py lanzar --tope 6",
    )


def clasificar_hf(quien: dict | None, spaces: list[dict] | None, error: str | None) -> dict:
    if not quien:
        return medio("hf", "Hugging Face Spaces", "requiere_alex" if error == "sin_token" else "no_disponible", "", "sin HF_TOKEN en ~/.starseed/env" if error == "sin_token" else ("no responde (%s)" % error), "guardar-clave.sh HF_TOKEN" if error == "sin_token" else "")
    pro = bool(quien.get("isPro") or quien.get("canPay"))
    activos = [s for s in (spaces or []) if str((s.get("runtime") or {}).get("stage")) == "RUNNING"]
    hw = sorted({str((s.get("runtime") or {}).get("hardware", {}).get("current") or "?") for s in activos})
    if pro:
        return medio("hf", "Hugging Face Spaces", "usable", "CPU basic 2 vCPU · 16 GB por Space (plan PRO)", "cuenta %s · %d Space(s) activo(s) %s" % (quien.get("name"), len(activos), hw), "python3 scripts/puente/nube-hf.py crear")
    return medio("hf", "Hugging Face Spaces", "requiere_alex", "Docker gratuito exige PRO (402 medido 2026-09-20)", "cuenta %s (plan gratuito) · %d Space(s) activo(s)" % (quien.get("name"), len(activos)), "solo con PRO (9 $/mes); los Spaces públicos de otros no ejecutan nuestro código")


#: Capacidad real de la cuenta Oracle Always Free (contrato architecture/oracle-nube.md §1,
#: medida el 2026-10-07; el A1 bajó a la mitad el 2026-06-15: ya no son 4 OCPU ni 24 GB).
CAPACIDAD_ORACLE = "A1 2 OCPU · 12 GB · 2 micro 1 GB · 10 TB/mes"
RUTA_ORACLE_JSON = "~/.starseed/oracle.json"


def _oracle_consumo(consumo: dict | None) -> tuple[bool, str, str]:
    """PURA (OC1010): de ~/.starseed/oracle-consumo.json → (freno, capacidad libre, aviso).
    Lo escribe `medidor_oracle.py` cada 30 min; aquí solo se lee, nunca se llama a Oracle."""
    if not isinstance(consumo, dict) or not consumo.get("leido"):
        return False, "", ""
    freno = consumo.get("freno") or {}
    if freno.get("activo"):
        return True, "", str(freno.get("motivo") or "el gasto del mes pasó de 0")
    margen = consumo.get("margen") or {}
    libre = ""
    if isinstance(margen.get("mem_libre_gb"), (int, float)):
        libre = "libre ahora: %s %% CPU · %s GB" % (
            str(margen.get("cpu_libre_pct")).replace(".", ","), str(margen.get("mem_libre_gb")).replace(".", ","))
    aviso = ""
    recl = consumo.get("reclamacion") or {}
    if recl.get("riesgo"):
        m = next((x for x in recl.get("maquinas") or [] if isinstance(x, dict) and x.get("riesgo")), {})
        aviso = "A1 ocioso: Oracle puede reclamarlo desde el %s si no recibe trabajo" % str(m.get("reclamable_desde") or "?")[:10]
    return False, libre, aviso


def clasificar_oracle(datos: dict | None, medios: dict | None, ahora: float, consumo: dict | None = None) -> dict:
    """PURA. Estado de Oracle según el contrato §9: `requiere_alex` sin vincular,
    `usable` vinculada sin A1 en marcha y `listo` con el A1 RUNNING y su orquestador
    del enjambre anunciado en medios.json (latido fresco, como el contenedor de Claude).
    (OC1010) Con la lectura del medidor de consumo: gasto > 0 = `requiere_alex` (freno: no se
    le manda trabajo); si no, la capacidad libre medida y el riesgo de reclamación van al detalle."""
    if not datos or not datos.get("vinculada"):
        return medio(
            "oracle", "Oracle Always Free", "requiere_alex", CAPACIDAD_ORACLE,
            "cuenta sin vincular (falta ~/.starseed/oracle.json o «vinculada» no es cierto)",
            "vincular: `oci setup bootstrap` en la Terminal",
        )
    instancias = datos.get("instancias") or []
    a1 = next((i for i in instancias if isinstance(i, dict)
               and "a1" in (str(i.get("nombre")) + str(i.get("forma"))).lower()), {})
    frenado, libre, aviso = _oracle_consumo(consumo)
    if frenado:
        return medio(
            "oracle", "Oracle Always Free", "requiere_alex", CAPACIDAD_ORACLE,
            "freno: %s" % aviso,
            "revisar el gasto en la consola: https://cloud.oracle.com/?region=%s" % (datos.get("region") or "mx-queretaro-1"),
        )
    capacidad = " · ".join(p for p in (CAPACIDAD_ORACLE, libre) if p)
    extra = (" · " + aviso) if aviso else ""
    if str(a1.get("estado") or "").upper() != "RUNNING":
        return medio(
            "oracle", "Oracle Always Free", "usable", CAPACIDAD_ORACLE,
            "vinculada (región %s) sin máquina A1 en marcha" % (datos.get("region") or "?"),
            "desplegar el A1 y su orquestador: scripts/puente/oracle_desplegar.py --simular",
        )
    latidos = [float(m.get("latido") or 0) for m in (medios or {}).get("medios", {}).values()
               if isinstance(m, dict) and str(m.get("origen")) == "oracle"]
    # (OPO1011) El A1 corre su propio orquestador (`oracle_a1.py`) y su latido llega a esta
    # neurona por `oracle_nodo.py estado` (cada 30 min con la autocuración), no por medios.json.
    nodo = datos.get("nodo") if isinstance(datos.get("nodo"), dict) else {}
    if nodo.get("vivo") and nodo.get("latido"):
        try:
            latidos.append(float(nodo["latido"]))
        except (TypeError, ValueError):
            pass
    ultimo = max(latidos) if latidos else 0.0
    if nodo.get("vivo") and nodo.get("latido") and ahora - float(nodo["latido"]) < 2700:
        g = nodo.get("guardian") or {}
        verde = ("guardián de main %s" % ("verde" if g.get("ok") else "ROJO")) if g.get("t") else "guardián sin pasada aún"
        return medio(
            "oracle", "Oracle Always Free", "listo", capacidad,
            "A1 RUNNING · nodo de MetaGenesis vivo (%s, %s)%s" % (nodo.get("fase") or "?", verde, extra), "",
        )
    if ultimo and ahora - ultimo < 600:
        return medio(
            "oracle", "Oracle Always Free", "listo", capacidad,
            "A1 RUNNING y orquestador anunciado por el bus hace %d s%s" % (int(ahora - ultimo), extra), "",
        )
    return medio(
        "oracle", "Oracle Always Free", "usable", capacidad,
        "A1 RUNNING (región %s) pero su orquestador no se ha anunciado en medios.json%s"
        % (datos.get("region") or "?", extra),
        "arrancar el orquestador del enjambre en el A1 (se anuncia solo por el bus)",
    )


def clasificar_maggabox(sondear_fn) -> dict:
    """PURA. Estado de Maggabox según la sonda de MAG1120A.
    - listo: SSH funciona y la sonda devuelve datos reales (disco > 0)
    - no_disponible: SSH falla o la sonda no responde / devuelve ceros
    """
    try:
        resultado = sondear_fn()
        if isinstance(resultado, dict) and "discoLibreGb" in resultado:
            disco = resultado.get("discoLibreGb", 0)
            ram = resultado.get("ramLibreMb", 0)
            cpu = resultado.get("cpu", 0)
            contenedores = resultado.get("contenedores", False)
            if disco > 0 and cpu > 0:
                detalle = f"Nodo Debian 13 · {cpu} CPU · {ram} MB RAM libre"
                if not contenedores:
                    detalle += " · Sin runtime de contenedores (sudo requiere a Alex)"
                return medio(
                    "maggabox",
                    "Maggabox (Neurona)",
                    "listo",
                    f"{disco} GB libres",
                    detalle,
                    "instalar Podman rootless / habilitar contenedores",
                )
            return medio(
                "maggabox",
                "Maggabox (Neurona)",
                "no_disponible",
                "",
                "SSH conecta pero sonda devuelve ceros (sin datos reales)",
                "verificar ~/.ssh/starseed_nodo1 y conectividad a starseed-nodo-1.local",
            )
    except Exception:
        pass
    return medio(
        "maggabox",
        "Maggabox (Neurona)",
        "no_disponible",
        "",
        "SSH falla o sonda sin respuesta",
        "verificar ~/.ssh/starseed_nodo1 y conectividad a starseed-nodo-1.local",
    )


def clasificar_agy(binario: str | None, medidor: dict | None, ahora: float) -> dict:
    """PURA. Estado de Antigravity CLI (agy).
    - listo: binario existe y modelos principales no pausados por cuota
    - usable: binario existe pero modelos principales pausados (fallback disponible)
    - requiere_alex: binario no encontrado (falta instalar Antigravity CLI y login Google)
    """
    if not binario:
        return medio(
            "agy", "Antigravity CLI (agy)", "requiere_alex",
            "gemini-3.8-flash-medium / gemini-4-neon-high / claude-sonnet-5-5-medium",
            "agy no encontrado en ~/.local/bin/agy ni en PATH",
            "instalar Antigravity CLI y `agy login` con cuenta de Google de Alex",
        )
    medidor = medidor or {}
    def pausado(modelo: str) -> bool:
        m = medidor.get(modelo) or {}
        return float(m.get("pausado_hasta") or 0) > ahora
    principales = ("gemini-3.8-flash-medium", "gemini-4-neon-high")
    disponibles = [m for m in principales if not pausado(m)]
    if disponibles:
        return medio(
            "agy", "Antigravity CLI (agy)", "listo",
            " · ".join(disponibles) + " · claude-sonnet-5-5-medium (fallback)",
            "sesión de Google activa · %d modelo(s) principal(es) con cuota" % len(disponibles),
            "",
        )
    if not pausado("claude-sonnet-5-5-medium"):
        return medio(
            "agy", "Antigravity CLI (agy)", "usable",
            "claude-sonnet-5-5-medium (fallback)",
            "sesión de Google activa · modelos principales pausados por cuota",
            "esperar a medianoche o revisar cuota en Antigravity",
        )
    return medio(
        "agy", "Antigravity CLI (agy)", "usable",
        "todos los modelos pausados por cuota",
        "sesión de Google activa · sin cuota en ningún modelo",
        "esperar a medianoche (reinicio de cuota diaria)",
    )


def sondear_cloudroom(sondear=None) -> dict:
    """Cloudroom, por la sonda de `medio_cloudroom` (CRM1024D). Si la sonda falla, devuelve algo que
    no se entiende o aún no está en main, el medio sale «no_disponible» con el motivo: nunca tumba el
    sondeo de los demás medios."""
    try:
        if sondear is None:
            import medio_cloudroom

            sondear = medio_cloudroom.sondear
        m = sondear()
        if isinstance(m, dict) and m.get("estado") in ESTADOS:
            return m
        motivo = "respuesta sin estado"
    except Exception as e:  # noqa: BLE001
        motivo = type(e).__name__
    return medio("cloudroom", "Cloudroom", "no_disponible", "100 agentes en la nube / 30 días (plan gratis)",
                 "no pude sondearlo (%s)" % motivo, "comprueba scripts/puente/medio_cloudroom.py")


def clasificar_gcloud(instalado: bool, cuentas: list[str], proyecto: str, servicios: list[dict]) -> dict:
    if not instalado:
        return medio("gcloud", "Google Cloud (Cloud Run · Cloud Shell)", "requiere_alex", "Cloud Run Jobs 180.000 vCPU·s/mes gratis (Cloud Shell no sirve para agentes desatendidos)", "gcloud no instalado", "brew install --cask google-cloud-sdk && gcloud auth login")
    if not cuentas:
        return medio("gcloud", "Google Cloud (Cloud Run · Cloud Shell)", "requiere_alex", "Cloud Run Jobs 180.000 vCPU·s/mes gratis (Cloud Shell no sirve para agentes desatendidos)", "gcloud sin cuenta activa", "gcloud auth login")
    return medio(
        "gcloud", "Google Cloud (Cloud Run · Cloud Shell)", "usable",
        "Cloud Run Jobs 180.000 vCPU·s/mes gratis (≈25 h de 2 vCPU) · Cloud Shell NO sirve: mata las sesiones no interactivas a los 40 min",
        "cuenta %s · proyecto %s · %d servicio(s) Cloud Run" % (cuentas[0], proyecto or "?", len(servicios)),
        "medio por abrir: job de Cloud Run con deploy/nube (mismo patrón que nube-gh)",
    )


def clasificar_abliteration(estado: dict | None, ahora: float) -> dict:
    """PURA. Estado de abliteration.ai.
    - listo: saldo > 0 y gasto del día < tope
    - usable: saldo > 0 pero gasto del día cerca del tope
    - requiere_alex: sin clave o saldo 0
    """
    if not estado or estado.get("saldo_usd") is None:
        return medio(
            "abliteration", "abliteration.ai", "requiere_alex",
            "10 000 peticiones/día · saldo USD",
            "sin datos de saldo (falta ABLITERATION_API_KEY o no se sondeó)",
            "ejecutar: python3 scripts/puente/abliteration.py",
        )
    saldo = float(estado.get("saldo_usd", 0))
    gastado = float(estado.get("gastado_total_usd", 0))
    if saldo <= 0:
        return medio(
            "abliteration", "abliteration.ai", "requiere_alex",
            "10 000 peticiones/día · saldo USD",
            "saldo agotado: %.2f USD" % saldo,
            "recargar en https://abliteration.ai/",
        )
    # tope diario por defecto 0.50 USD (configurable via STARSEED_ABLITERATION_DIA_USD)
    tope_dia = 0.5
    try:
        import os
        tope_dia = float(os.environ.get("STARSEED_ABLITERATION_DIA_USD", "0.5"))
    except Exception:
        pass
    if gastado >= tope_dia * 0.8:
        return medio(
            "abliteration", "abliteration.ai", "usable",
            "10 000 peticiones/día · saldo USD",
            "saldo %.2f USD · gastado hoy %.2f/%.2f USD (cerca del tope)" % (saldo, gastado, tope_dia),
            "esperar reinicio diario o aumentar tope",
        )
    return medio(
        "abliteration", "abliteration.ai", "listo",
        "10 000 peticiones/día · saldo USD",
        "saldo %.2f USD · gastado hoy %.2f/%.2f USD" % (saldo, gastado, tope_dia),
        "",
    )


def clasificar_ollama_a1(datos_oracle: dict | None, ahora: float) -> dict:
    """PURA. Estado de Ollama en el A1 (modelo qwen 4B privado).
    - listo: A1 RUNNING y nodo MetaGenesis vivo con Ollama respondiendo
    - usable: A1 RUNNING pero Ollama no sondea
    - requiere_alex: Oracle no vinculada o A1 no RUNNING
    """
    if not datos_oracle or not datos_oracle.get("vinculada"):
        return medio(
            "ollama-a1", "Ollama del A1 (qwen 4B)", "requiere_alex",
            "modelo privado 4B en Oracle A1",
            "Oracle no vinculada o sin A1",
            "vincular Oracle y desplegar A1: scripts/puente/oracle_desplegar.py",
        )
    instancias = datos_oracle.get("instancias") or []
    a1 = next((i for i in instancias if isinstance(i, dict)
               and "a1" in (str(i.get("nombre")) + str(i.get("forma"))).lower()), {})
    if str(a1.get("estado") or "").upper() != "RUNNING":
        return medio(
            "ollama-a1", "Ollama del A1 (qwen 4B)", "requiere_alex",
            "modelo privado 4B en Oracle A1",
            "A1 no está RUNNING",
            "desplegar el A1: scripts/puente/oracle_desplegar.py --simular",
        )
    # Verificar si el nodo MetaGenesis en A1 está vivo (latido fresco)
    nodo = datos_oracle.get("nodo") if isinstance(datos_oracle.get("nodo"), dict) else {}
    if nodo.get("vivo") and nodo.get("latido") and ahora - float(nodo["latido"]) < 2700:
        return medio(
            "ollama-a1", "Ollama del A1 (qwen 4B)", "listo",
            "modelo privado 4B · sin clave · sin cupo",
            "A1 RUNNING · nodo MetaGenesis vivo (fase: %s)" % (nodo.get("fase") or "?"),
            "",
        )
    return medio(
        "ollama-a1", "Ollama del A1 (qwen 4B)", "usable",
        "modelo privado 4B · sin clave · sin cupo",
        "A1 RUNNING pero nodo MetaGenesis no anuncia latido fresco",
        "verificar orquestador en A1 (oracle_nodo.py estado)",
    )


def clasificar_codex(marca: dict | None, ahora: float) -> dict:
    """PURA. Estado de Codex (suscripción ChatGPT).
    - listo: sin marca de agotamiento o marca vencida
    - usable: marca de agotamiento vigente (faltan X min)
    """
    try:
        import cupo_codex
        if not marca:
            marca = cupo_codex.leer()
        if cupo_codex.sigue_agotado(marca, ahora):
            min_rest = cupo_codex.minutos_restantes(marca, ahora)
            return medio(
                "codex", "Codex (ChatGPT)", "usable",
                "suscripción ChatGPT · cuota por ventana",
                "agotado: vuelve en %d min (motivo: %s)" % (min_rest, marca.get("motivo", "cuota")),
                "esperar reinicio de cuota (ventana de 3 h aprox)",
            )
    except Exception:
        pass
    return medio(
        "codex", "Codex (ChatGPT)", "listo",
        "suscripción ChatGPT · cuota por ventana",
        "sin marca de agotamiento activa",
        "",
    )


def clasificar_opencode_zen(config_opencode: dict | None) -> dict:
    """PURA. Estado de OpenCode Zen (modelos gratuitos vía opencode).
    - listo: opencode configurado con proveedores zen
    - usable: opencode instalado pero sin configuración zen
    - no_disponible: opencode no instalado
    """
    if not config_opencode:
        return medio(
            "opencode-zen", "OpenCode Zen", "no_disponible",
            "glm-5.3-flash · deepseek-v4.1-flash · minimax-m3.1-flash · big-pickle",
            "opencode.json no encontrado o sin proveedores zen",
            "configurar opencode: opencode run --model zen/glm-5.3-flash-free",
        )
    providers = config_opencode.get("provider", {})
    tiene_zen = any("zen" in str(k).lower() or "glm-5.3-flash" in str(v).lower()
                    for k, v in providers.items())
    if tiene_zen:
        return medio(
            "opencode-zen", "OpenCode Zen", "listo",
            "glm-5.3-flash · deepseek-v4.1-flash · minimax-m3.1-flash · big-pickle",
            "opencode configurado con modelos Zen gratuitos",
            "",
        )
    return medio(
        "opencode-zen", "OpenCode Zen", "usable",
        "glm-5.3-flash · deepseek-v4.1-flash · minimax-m3.1-flash · big-pickle",
        "opencode instalado pero sin modelos Zen configurados",
        "añadir proveedor zen a ~/.config/opencode/opencode.json",
    )


def clasificar_explabs(estado: dict | None, ahora: float) -> dict:
    """PURA. Estado de Experiential Labs.
    - listo: hay modelos de decisión gratis (Jev, Clef Flash) o chat en promoción
    - usable: clave configurada pero sin promociones activas
    - requiere_alex: sin EXPLABS_API_KEY
    """
    if not estado or not estado.get("hecho"):
        return medio(
            "explabs", "Experiential Labs", "requiere_alex",
            "Jev/Clef Flash gratis · chat en promoción",
            "sin foto de promociones (falta EXPLABS_API_KEY o no se sondeó)",
            "ejecutar: python3 scripts/puente/explabs_promos.py actualizar",
        )
    decisiones_gratis = estado.get("decisiones_gratis") or []
    chat_gratis = estado.get("chat_gratis") or []
    chat_promo = estado.get("chat_promocion") or []
    if decisiones_gratis or chat_gratis or chat_promo:
        items = []
        if decisiones_gratis:
            items.append("decisiones gratis: %s" % ", ".join(decisiones_gratis))
        if chat_gratis:
            items.append("chat gratis: %s" % ", ".join(chat_gratis))
        if chat_promo:
            items.append("chat promo: %s" % ", ".join(c["slug"] + " (-%d%%)" % c["descuento"] for c in chat_promo))
        return medio(
            "explabs", "Experiential Labs", "listo",
            "Jev/Clef Flash gratis · chat en promoción",
            " · ".join(items),
            "",
        )
    return medio(
        "explabs", "Experiential Labs", "usable",
        "Jev/Clef Flash gratis · chat en promoción",
        "clave configurada pero sin promociones activas ahora",
        "esperar próxima actualización (cada 6 h) o revisar en la web",
    )


def clasificar_tokenrouter(estado: dict | None, ahora: float) -> dict:
    """PURA. Estado de TokenRouter (modelos gratuitos vía API gateway).
    - listo: clave válida y modelo gratuito responde (escribe tokens)
    - usable: clave válida pero sin canal para el modelo gratis (503)
    - requiere_alex: sin TOKENROUTER_API_KEY o clave inválida (401/403)
    """
    if not estado or not estado.get("hecho"):
        return medio(
            "tokenrouter", "TokenRouter (gratis)", "requiere_alex",
            "z-ai/glm-5.3-free · nemotron-3-nano-omni-30b-a3b-reasoning:free",
            "sin sondeo reciente (falta TOKENROUTER_API_KEY o no se ejecutó renovador-pasarelas.py)",
            "ejecutar: python3 scripts/puente/renovador-pasarelas.py",
        )
    http = estado.get("http")
    estado_pasarela = estado.get("estado")
    modelo = estado.get("modelo", "z-ai/glm-5.3-free")
    tiene_clave = bool(estado.get("tiene_clave"))
    if not tiene_clave:
        return medio(
            "tokenrouter", "TokenRouter (gratis)", "requiere_alex",
            modelo,
            "sin TOKENROUTER_API_KEY en ~/.starseed/env ni ~/.hermes/.env",
            "guardar-clave.sh TOKENROUTER_API_KEY",
        )
    if estado_pasarela == "escribe":
        return medio(
            "tokenrouter", "TokenRouter (gratis)", "listo",
            modelo,
            "clave válida · modelo gratuito escribe tokens",
            "",
        )
    if estado_pasarela == "sin_canal":
        return medio(
            "tokenrouter", "TokenRouter (gratis)", "usable",
            modelo,
            "clave válida · «no available channel» para el modelo gratis (lado de ellos)",
            "esperar a que el proveedor vuelva a tener canal o cambiar de modelo en la pasarela",
        )
    if estado_pasarela == "sin_cupo":
        return medio(
            "tokenrouter", "TokenRouter (gratis)", "usable",
            modelo,
            "cuota agotada: se repone sola",
            "esperar reinicio de cuota",
        )
    if estado_pasarela in ("sin_clave", "fichaje"):
        return medio(
            "tokenrouter", "TokenRouter (gratis)", "requiere_alex",
            modelo,
            "clave inválida o pide acción manual: %s" % estado.get("mensaje", estado_pasarela),
            "renovar TOKENROUTER_API_KEY en https://tokenrouter.com",
        )
    return medio(
        "tokenrouter", "TokenRouter (gratis)", "no_disponible",
        modelo,
        "estado: %s · %s" % (estado_pasarela, estado.get("mensaje", "")),
        "revisar informe de pasarelas: python3 scripts/puente/renovador-pasarelas.py",
    )


# ── sondas ───────────────────────────────────────────────────────────────────
def sondear() -> dict:
    env = _env(); ahora = time.time(); medios = []
    try:
        gob = json.load(open(os.path.expanduser("~/.starseed/gobernador.json")))
    except Exception:
        gob = None
    medios.append(clasificar_mac(gob))
    try:
        reg = json.load(open(os.path.join(OLAS, "medios.json")))
    except Exception:
        reg = None
    medios.append(clasificar_claude(reg, ahora))
    medios.append(sondear_cloudroom())
    try:
        import sonda_maggabox
        medios.append(clasificar_maggabox(sonda_maggabox.sonda_maggabox))
    except Exception:
        medios.append(medio("maggabox", "Maggabox (Neurona)", "no_disponible", "",
                           "no pude sondearlo (import falló)", "comprueba scripts/puente/sonda_maggabox.py"))
    rc, _, _ = _sh(["gh", "auth", "status"])
    wf = os.path.exists(os.path.join(RAIZ, ".github", "workflows", "enjambre-nube.yml"))
    rc_s, out_s, _ = _sh(["gh", "secret", "list", "--json", "name"], cwd=RAIZ)
    try:
        secretos = [x["name"] for x in json.loads(out_s)] if rc_s == 0 and out_s else []
    except Exception:
        secretos = []
    rc_r, out_r, _ = _sh(["gh", "run", "list", "--workflow", "enjambre-nube.yml", "--limit", "5", "--json", "status,conclusion"], cwd=RAIZ)
    try:
        runs = json.loads(out_r) if rc_r == 0 and out_r else []
    except Exception:
        runs = []
    medios.append(clasificar_gh(rc == 0, wf, secretos, runs))
    tok = (env.get("HF_TOKEN") or "").strip()
    if tok:
        quien, err = _json("https://huggingface.co/api/whoami-v2", tok)
        spaces, _ = (_json("https://huggingface.co/api/spaces?author=%s" % quien.get("name"), tok) if quien else (None, None))
        medios.append(clasificar_hf(quien, spaces if isinstance(spaces, list) else [], err))
    else:
        medios.append(clasificar_hf(None, None, "sin_token"))
    rc_g, out_g, _ = _sh(["gcloud", "auth", "list", "--format=json"], timeout=25)
    instalado = rc_g == 0 or "not found" not in (out_g or "")
    try:
        cuentas = [c.get("account") for c in json.loads(out_g) if c.get("status") == "ACTIVE"] if rc_g == 0 and out_g else []
    except Exception:
        cuentas = []
    _, proyecto, _ = _sh(["gcloud", "config", "get-value", "project"], timeout=15)
    rc_c, out_c, _ = _sh(["gcloud", "run", "services", "list", "--format=json"], timeout=40) if cuentas else (1, "", "")
    try:
        servicios = json.loads(out_c) if rc_c == 0 and out_c else []
    except Exception:
        servicios = []
    medios.append(clasificar_gcloud(instalado and rc_g == 0, cuentas, (proyecto or "").strip(), servicios))
    medios.append(medio("colab", "Google Colab / Kaggle", "requiere_alex", "Colab: 2 vCPU · 12 GB · sesiones ≤12 h · Kaggle: 4 vCPU · 30 GB · 30 h/semana", "sin API: hace falta un cuaderno lanzador que clone el repo y corra el orquestador con las claves pegadas en la sesión", "medio por diseñar (cola futura): deploy/colab/enjambre.ipynb"))
    ruta_oracle = os.environ.get("ORACLE_JSON") or RUTA_ORACLE_JSON
    try:
        with open(os.path.expanduser(ruta_oracle), encoding="utf-8") as f:
            oracle_datos = json.load(f)
    except (OSError, ValueError):
        oracle_datos = None
    try:
        with open(os.path.expanduser(os.environ.get("ORACLE_CONSUMO_JSON") or "~/.starseed/oracle-consumo.json"),
                  encoding="utf-8") as f:
            oracle_consumo = json.load(f)
    except (OSError, ValueError):
        oracle_consumo = None
    medios.append(clasificar_oracle(oracle_datos, reg, ahora, oracle_consumo))
    # Antigravity CLI (agy)
    agy_bin = shutil.which("agy") or (os.path.expanduser("~/.local/bin/agy") if os.path.exists(os.path.expanduser("~/.local/bin/agy")) else None)
    try:
        medidor_agy = json.load(open(os.path.expanduser("~/.starseed/agy-medidor.json"), encoding="utf-8"))
    except (OSError, ValueError):
        medidor_agy = None
    medios.append(clasificar_agy(agy_bin, medidor_agy, ahora))

    # abliteration.ai
    try:
        with open(os.path.expanduser("~/.starseed/abliteration-uso.json"), encoding="utf-8") as f:
            ablit_state = json.load(f)
    except (OSError, ValueError):
        ablit_state = None
    medios.append(clasificar_abliteration(ablit_state, ahora))

    # Ollama del A1 (qwen 4B)
    medios.append(clasificar_ollama_a1(oracle_datos, ahora))

    # Codex (ChatGPT)
    try:
        import cupo_codex
        codex_marca = cupo_codex.leer()
    except Exception:
        codex_marca = None
    medios.append(clasificar_codex(codex_marca, ahora))

    # OpenCode Zen
    try:
        with open(os.path.expanduser("~/.config/opencode/opencode.json"), encoding="utf-8") as f:
            opencode_config = json.load(f)
    except (OSError, ValueError):
        opencode_config = None
    medios.append(clasificar_opencode_zen(opencode_config))

    # Experiential Labs
    try:
        with open(os.path.expanduser("~/.starseed/explabs-promos.json"), encoding="utf-8") as f:
            explabs_state = json.load(f)
    except (OSError, ValueError):
        explabs_state = None
    medios.append(clasificar_explabs(explabs_state, ahora))

    # TokenRouter (modelos gratuitos vía API gateway)
    try:
        with open(os.path.expanduser("~/.starseed/pasarelas-informe.json"), encoding="utf-8") as f:
            pasarelas_informe = json.load(f)
        tr_data = next((p for p in (pasarelas_informe.get("pasarelas") or []) if p.get("clave") == "tokenrouter"), None)
    except (OSError, ValueError):
        tr_data = None
    medios.append(clasificar_tokenrouter(tr_data, ahora))

    return {"generado": time.strftime("%Y-%m-%dT%H:%M:%S"), "medios": medios}


def texto(d: dict) -> str:
    lineas = []
    for m in d["medios"]:
        lineas.append("%-9s %-14s %s · %s%s" % (m["id"], m["estado"], m["capacidad"], m["detalle"], (" → " + m["siguiente_paso"]) if m["siguiente_paso"] else ""))
    return "\n".join(lineas)


if __name__ == "__main__":
    d = sondear()
    print(json.dumps(d, ensure_ascii=False, indent=1) if "--json" in sys.argv else texto(d))
