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
Salida: JSON por stdout (`--json`) o texto. Funciones puras (clasificar_*) probadas.
"""
from __future__ import annotations

import json
import os
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


def clasificar_gcloud(instalado: bool, cuentas: list[str], proyecto: str, servicios: list[dict]) -> dict:
    if not instalado:
        return medio("gcloud", "Google Cloud (Cloud Run · Cloud Shell)", "requiere_alex", "Cloud Run 180.000 vCPU·s/mes gratis · Cloud Shell 60 h/semana", "gcloud no instalado", "brew install --cask google-cloud-sdk && gcloud auth login")
    if not cuentas:
        return medio("gcloud", "Google Cloud (Cloud Run · Cloud Shell)", "requiere_alex", "Cloud Run 180.000 vCPU·s/mes gratis · Cloud Shell 60 h/semana", "gcloud sin cuenta activa", "gcloud auth login")
    return medio(
        "gcloud", "Google Cloud (Cloud Run · Cloud Shell)", "usable",
        "Cloud Run 180.000 vCPU·s/mes gratis (≈25 h de 2 vCPU) · Cloud Shell 60 h/semana",
        "cuenta %s · proyecto %s · %d servicio(s) Cloud Run" % (cuentas[0], proyecto or "?", len(servicios)),
        "medio por abrir: job de Cloud Run con deploy/nube (mismo patrón que nube-gh)",
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
    medios.append(medio("oracle", "Oracle Free Tier", "no_disponible", "", "descartado por Alex (no deja crear la cuenta)", ""))
    return {"generado": time.strftime("%Y-%m-%dT%H:%M:%S"), "medios": medios}


def texto(d: dict) -> str:
    lineas = []
    for m in d["medios"]:
        lineas.append("%-9s %-14s %s · %s%s" % (m["id"], m["estado"], m["capacidad"], m["detalle"], (" → " + m["siguiente_paso"]) if m["siguiente_paso"] else ""))
    return "\n".join(lineas)


if __name__ == "__main__":
    d = sondear()
    print(json.dumps(d, ensure_ascii=False, indent=1) if "--json" in sys.argv else texto(d))
