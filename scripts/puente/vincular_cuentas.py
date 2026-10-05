#!/usr/bin/env python3
"""Vincula las cuentas de los puentes de producción (contrato §10) con el mínimo de pasos de Alex.

Abre cada página en el navegador, espera a que Alex inicie sesión y copie la clave, la lee del
portapapeles SIN mostrarla, la valida contra el servicio y la guarda en ~/.starseed/env (600).
Nunca imprime claves. Uso: python3 scripts/puente/vincular_cuentas.py
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ENV = os.path.expanduser("~/.starseed/env")
ESTADO = os.path.expanduser("~/.starseed/produccion/cuentas.json")
B, V, A, R, N = "\033[1m", "\033[32m", "\033[33m", "\033[31m", "\033[0m"


def leer_env():
    vals = {}
    for ruta in (ENV, os.path.expanduser("~/.hermes/.env")):
        try:
            for linea in open(ruta, encoding="utf-8"):
                m = re.match(r"\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$", linea.strip())
                if m and m.group(1) not in vals:
                    vals[m.group(1)] = m.group(2).strip().strip('"').strip("'")
        except FileNotFoundError:
            pass
    return vals


def guardar_env(clave, valor):
    os.makedirs(os.path.dirname(ENV), exist_ok=True)
    lineas = open(ENV, encoding="utf-8").read().splitlines() if os.path.exists(ENV) else []
    nuevas, puesto = [], False
    for l in lineas:
        if re.match(r"\s*(?:export\s+)?%s=" % re.escape(clave), l):
            if not puesto:
                nuevas.append("%s=%s" % (clave, valor))
                puesto = True
        else:
            nuevas.append(l)
    if not puesto:
        nuevas.append("%s=%s" % (clave, valor))
    tmp = ENV + ".tmp-vincular"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\n".join(nuevas) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, ENV)


def http(url, token=None, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "starseed-vincular/1"})
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, {}
    except Exception:
        return 0, {}


def abrir(url):
    subprocess.run(["open", url], check=False)


def portapapeles():
    return subprocess.run(["pbpaste"], capture_output=True, text=True).stdout.strip()


def limpiar_portapapeles():
    subprocess.run(["pbcopy"], input="", text=True)


def esperar(texto):
    input("   %s%s%s  [Intro] " % (B, texto, N))


def pedir_copiado(texto, valida, intentos=3):
    """Alex copia algo; se lee del portapapeles al pulsar Intro, se valida y se borra del portapapeles."""
    for _ in range(intentos):
        esperar(texto)
        valor = portapapeles()
        if not valor:
            print("   %sEl portapapeles está vacío. Copia y vuelve a pulsar Intro.%s" % (A, N))
            continue
        ok, detalle = valida(valor)
        if ok:
            limpiar_portapapeles()
            print("   %s✓ %s%s (lo borré del portapapeles)" % (V, detalle, N))
            return valor
        print("   %s✗ %s. Vuelve a copiarla.%s" % (R, detalle, N))
    return None


def estado_guardar(nombre, datos):
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    try:
        todo = json.load(open(ESTADO, encoding="utf-8"))
    except Exception:
        todo = {}
    todo[nombre] = dict(datos, t=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
    tmp = ESTADO + ".tmp"
    json.dump(todo, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, ESTADO)


# ---------------------------------------------------------------- Hugging Face (n8n propio)
def hf_valida(token):
    if not token.startswith("hf_"):
        return False, "no parece un token de Hugging Face (empieza por hf_)"
    st, d = http("https://huggingface.co/api/whoami-v2", token)
    if st != 200:
        return False, "Hugging Face no acepta el token (HTTP %s)" % st
    rol = ((d.get("auth") or {}).get("accessToken") or {}).get("role", "?")
    if rol == "read":
        return False, "el token es solo de lectura; hace falta uno de escritura"
    return True, "token de %s con permiso «%s»" % (d.get("name", "?"), rol)


def paso_hf(env):
    print("\n%s[1/4] Hugging Face · aquí vivirá nuestro n8n propio (gratis)%s" % (B, N))
    tok = env.get("HF_TOKEN", "")
    if tok:
        ok, det = hf_valida(tok)
        if ok:
            print("   %s✓ Ya vinculado: %s.%s El director crea el espacio privado de n8n cuando sus flujos estén listos." % (V, det, N))
            estado_guardar("huggingface", {"vinculado": True, "detalle": det})
            return
        print("   %s%s%s" % (A, det, N))
    print("   Abro la página para crear un token con permiso de escritura.")
    abrir("https://huggingface.co/settings/tokens/new?tokenType=write")
    v = pedir_copiado("Inicia sesión si te lo pide, pulsa «Create token», cópialo y vuelve aquí", hf_valida)
    if v:
        guardar_env("HF_TOKEN", v)
        estado_guardar("huggingface", {"vinculado": True})


# ---------------------------------------------------------------- Dify Cloud (Sandbox, gratis)
def dify_valida(clave):
    if not clave.startswith(("dataset-", "app-")):
        return False, "no parece una clave de Dify (empieza por dataset- o app-)"
    st, _ = http("https://api.dify.ai/v1/datasets?page=1&limit=1", clave)
    if st == 200:
        return True, "Dify acepta la clave"
    return False, "Dify no acepta la clave (HTTP %s)" % st


def paso_dify(env):
    print("\n%s[2/4] Dify Cloud · plan Sandbox gratuito y sin caducidad (apps de IA y conocimiento)%s" % (B, N))
    if env.get("DIFY_CLAVE"):
        ok, det = dify_valida(env["DIFY_CLAVE"])
        if ok:
            print("   %s✓ Ya vinculado (%s).%s" % (V, det, N))
            estado_guardar("dify", {"vinculado": True})
            return
    abrir("https://cloud.dify.ai/signin")
    esperar("Entra con Google o GitHub (si es la primera vez, la cuenta se crea sola). Cuando veas el panel")
    abrir("https://cloud.dify.ai/datasets?category=api")
    v = pedir_copiado("En «Conocimiento → API»: pulsa «Clave de API» → «Crear nueva clave» → Copiar", dify_valida)
    if v:
        guardar_env("DIFY_URL", "https://api.dify.ai/v1")
        guardar_env("DIFY_CLAVE", v)
        estado_guardar("dify", {"vinculado": True})


# ---------------------------------------------------------------- n8n Cloud (prueba de 14 días)
def n8n_valida(url):
    m = re.match(r"https://([a-z0-9-]+)\.app\.n8n\.cloud", url.strip())
    if not m:
        return False, "copia la dirección de tu n8n (termina en .app.n8n.cloud)"
    return True, "instancia %s.app.n8n.cloud" % m.group(1)


def paso_n8n_cloud(env):
    print("\n%s[3/4] n8n Cloud · prueba gratuita de 14 días y 1.000 ejecuciones%s" % (B, N))
    if env.get("N8N_CLOUD_URL"):
        print("   %s✓ Ya vinculado.%s" % (V, N))
        return
    print("   %sLos 14 días empiezan al crear la cuenta y nuestros flujos aún no están listos.%s" % (A, N))
    r = input("   ¿Crear la cuenta ahora de todos modos? (s/N) ").strip().lower()
    if r != "s":
        estado_guardar("n8n_cloud", {"vinculado": False, "pendiente": "abrir cuando los flujos de PRD1005T estén listos"})
        print("   Pendiente: te la abro cuando los flujos estén listos, para no gastar días de prueba.")
        return
    abrir("https://app.n8n.cloud/register")
    v = pedir_copiado("Crea la cuenta y, cuando se abra TU n8n, copia la dirección de la barra del navegador", n8n_valida)
    if v:
        base = re.match(r"https://[a-z0-9-]+\.app\.n8n\.cloud", v.strip()).group(0)
        guardar_env("N8N_CLOUD_URL", base)
        estado_guardar("n8n_cloud", {"vinculado": True, "desde": time.strftime("%Y-%m-%d")})


# ---------------------------------------------------------------- Zapier
def paso_zapier(env):
    print("\n%s[4/4] Zapier%s" % (B, N))
    print("   Su plan gratuito NO incluye webhooks (son de pago): no puede recibir los avisos del director.")
    print("   Sigue conectado como herramienta de Claude. Nada que hacer aquí.")
    estado_guardar("zapier", {"vinculado": False, "motivo": "webhooks de pago en el plan gratuito"})


def main():
    print("%sStarSeed · vincular cuentas de los puentes de producción%s" % (B, N))
    print("Las claves se leen del portapapeles, se comprueban y se guardan en ~/.starseed/env. No se muestran nunca.")
    env = leer_env()
    for paso in (paso_hf, paso_dify, paso_n8n_cloud, paso_zapier):
        try:
            paso(env)
        except KeyboardInterrupt:
            print("\n   (saltado)")
    print("\n%sListo.%s Resumen sin claves en ~/.starseed/produccion/cuentas.json. Ya puedes cerrar esta ventana." % (B, N))


if __name__ == "__main__":
    sys.exit(main())
