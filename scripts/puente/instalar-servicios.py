#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escribe y carga los plists de launchd del Puente. Lo llama instalar-servicios.sh.

Dos reglas que costaron caras y por eso están aquí y no en la memoria de nadie:

1. launchd NO usa el PATH para encontrar el ejecutable. Ruta absoluta siempre.
2. El «Acceso total al disco» de macOS se concede POR BINARIO. En esta Mac lo tiene
   /opt/homebrew/bin/python3 y no lo tienen /bin/zsh ni /bin/bash, así que cualquier
   servicio cuyo programa sea un shell y lea algo de ~/Documents muere con «can't
   open input file» (127) o «cannot execute» (126) aunque el archivo esté ahí y sea
   ejecutable. Esos van envueltos en lanzador-tcc.py, que los corre como hijos de
   python3 y así heredan el permiso. Lee la cabecera de ese archivo si dudas.

  python3 instalar-servicios.py <raiz-del-repo> <ruta-python3>
"""
import os, subprocess, sys

RAIZ = sys.argv[1] if len(sys.argv) > 1 else "/Users/alex/Documents/starseed-os-main"
PY3 = sys.argv[2] if len(sys.argv) > 2 else "/opt/homebrew/bin/python3"
HOME = os.path.expanduser("~")
AG = os.path.join(HOME, "Library", "LaunchAgents")
P = lambda n: os.path.join(RAIZ, "scripts", "puente", n)
LANZ = [PY3, P("lanzador-tcc.py")]

# nombre -> (orden, log, vive_siempre)
#   vive_siempre=False -> KeepAlive sólo si sale con error (guiones de un disparo)
SERVICIOS = {
    "vigilante": ([PY3, P("vigilante-enjambre.py")], "/tmp/starseed-vigilante.log", True),
    "director":  ([PY3, P("director-orquestacion.py")], "/tmp/starseed-director.log", True),
    "guardia":   ([PY3, P("guardia-memoria.py")], "/tmp/starseed-guardia.log", True),
    "eco":       ([PY3, P("eco-enjambre.py"), "/tmp/enjambre.log"], "/tmp/starseed-eco.log", True),
    # ecoides (eco-a-ides.py) RETIRADO el 2026-09-13 por orden de Alex: empujaba un
    # resumen del canal a la sesión de Codex cada 120 s con `codex queue`, y eso
    # agotaba los créditos de ChatGPT. El canal se lee cuando se quiere
    # (`starseed-puente escuchar`); nadie lo empuja solo a un chat de pago.
    # El de Telegram ya funcionaba así: el shell sólo carga las claves de ~/.hermes/.env
    # (fuera de ~/Documents, sin TCC de por medio) y se convierte en python3 con exec.
    "telegram":  (["/bin/zsh", "-c",
                   'set -a; [ -f "$HOME/.hermes/.env" ] && source "$HOME/.hermes/.env"; '
                   # (2026-09-22) `-u`: sin él Python bufferea stdout y el log del puente
                   # se quedaba en 0 bytes durante DÍAS aunque el proceso estuviera vivo.
                   # Un servicio que no puede contar lo que hace no se puede diagnosticar:
                   # me costó media hora saber si reenviaba o no.
                   'set +a; exec %s -u %s' % (PY3, P("telegram-puente.py"))],
                  "/tmp/starseed-telegram.log", True),
    # El Mando lo supervisa launchd en primer plano: nada de doble fork. Así hay un pid
    # de verdad, KeepAlive lo revive solo, y no queda huérfano si se reinicia el MCP.
    # (2026-09-16) El servidor del Mando corría SIN NINGUNA clave de proveedor en su
    # entorno: `listarModelos()` daba «sin clave» para todo y el asistente técnico no
    # tenía a quién preguntar. Se cargan como en el servicio de Telegram: el shell lee
    # ~/.hermes/.env y ~/.starseed/env y se convierte en el lanzador con exec.
    "mando":     (["/bin/zsh", "-c",
                   'set -a; [ -f "$HOME/.hermes/.env" ] && source "$HOME/.hermes/.env"; '
                   '[ -f "$HOME/.starseed/env" ] && source "$HOME/.starseed/env"; set +a; '
                   'exec %s --cwd %s --env STARSEED_MANDO=1 --env STARSEED_LOCAL=1 '
                   '-- /opt/homebrew/bin/npx next start -p 9002'
                   % (" ".join(LANZ), RAIZ)],
                  "/tmp/starseed-mando.log", True),
    # (2026-09-22) El Mando se sirve con `next start`, o sea de un build compilado: editar
    # `src/` no cambiaba NADA de lo que se ve hasta que alguien corría `next build`. De ahí
    # los «todo sigue igual» de Alex delante de arreglos que ya estaban en el disco. Esto
    # compila solo cuando las fuentes de la pantalla cambian, con el turno de la máquina
    # (para no pelear RAM con los agentes) y reinicia el Mando al acabar.
    "reconstruir": ([PY3, P("reconstruir_mando.py")], "/tmp/starseed-reconstruir.log", True),
    # (2026-09-22) Alex: «todos los medidores y todos los procesos activos deben ser
    # analizados por los directores verificadores en todo el tiempo y solucionar cualquier
    # situación automáticamente». Los directores que había vigilaban cada uno su parcela;
    # ninguno miraba el TABLERO. Esa noche el orquestador estuvo 123 minutos parado en una
    # puerta de aprobación y los medidores lo enseñaban sin que nadie los leyera.
    "vigia": ([PY3, P("vigia_medidores.py")], "/tmp/starseed-vigia.log", True),
}

PLANTILLA = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>%(etiqueta)s</string>
  <key>ProgramArguments</key><array>
%(args)s
  </array>
  <key>RunAtLoad</key><true/>
  %(vivo)s
  <key>ThrottleInterval</key><integer>30</integer>
  <key>WorkingDirectory</key><string>%(raiz)s</string>
  <key>StandardOutPath</key><string>%(log)s</string>
  <key>StandardErrorPath</key><string>%(log)s</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>%(home)s/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>STARSEED_ROOT</key><string>%(raiz)s</string>
  </dict>
</dict></plist>
"""

esc = lambda t: t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def instalar(etiqueta, orden, log, siempre):
    ruta = os.path.join(AG, etiqueta + ".plist")
    open(ruta, "w").write(PLANTILLA % {
        "etiqueta": etiqueta, "raiz": RAIZ, "log": log, "home": HOME,
        "args": "\n".join("    <string>%s</string>" % esc(a) for a in orden),
        "vivo": "<key>KeepAlive</key><true/>" if siempre else
                "<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>"})
    ok = subprocess.run(["plutil", "-lint", ruta], capture_output=True).returncode == 0
    subprocess.run(["launchctl", "unload", ruta], capture_output=True)
    r = subprocess.run(["launchctl", "load", ruta], capture_output=True, text=True)
    print("  %-10s plist %s · %s" % (etiqueta.split(".")[-1], "ok" if ok else "INVÁLIDO",
          "cargado" if r.returncode == 0 else (r.stderr.strip()[:50] or "error")))


for nombre, (orden, log, siempre) in SERVICIOS.items():
    instalar("com.starseed." + nombre, orden, log, siempre)

# El túnel de Astraura vive en otra carpeta y con su propio bash: mismo TCC, mismo
# envoltorio. Sólo se toca si el guion sigue estando donde dice su plist.
TUNEL = "/Users/alex/Documents/IA 1.58 bit/tunnel_monitor.sh"
if os.path.exists(TUNEL):
    instalar("com.starseed.astraura.tunnel", LANZ + ["--", "/bin/bash", TUNEL],
             "/tmp/astraura_tunnel.log", True)

# (2026-09-17) El túnel del Puente de Mando: mismo mecanismo que el de Astraura,
# hacia :9002. Pedido por Alex para abrir y vincular el Mando desde cualquier
# navegador. Su guion vuelve enseguida si ya hay túnel vivo; launchd lo relanza
# cada 5 min como vigilante, y si la URL cambia, tunel-mando.sh la guarda en
# ~/.starseed/tunel-mando.json (nunca en el repo).
TUNEL_MANDO = P("tunel-mando.sh")
if os.path.exists(TUNEL_MANDO):
    instalar("com.starseed.mando.tunel", LANZ + ["--", "/bin/bash", TUNEL_MANDO],
             os.path.expanduser("~/.starseed/tunel-mando.log"), True)

# (2026-09-19) FreeLLMAPI: pasarela unificada OpenAI-compatible en :3001 que
# reparte entre los proveedores gratuitos con las claves que ya tenemos. Pedida
# por Alex para «todos los IDE y el Puente de Mando». Las claves se le pasan en
# memoria al arrancar (freellmapi-lanzar.sh), nunca en un archivo nuevo.
FREELLMAPI = os.path.expanduser("~/.starseed/herramientas/freellmapi-lanzar.sh")
if os.path.exists(FREELLMAPI):
    instalar("com.starseed.freellmapi", LANZ + ["--", "/bin/bash", FREELLMAPI],
             os.path.expanduser("~/.starseed/freellmapi.log"), True)

print("\nlaunchd los mantiene vivos aunque se reinicie el MCP, se cierre la terminal o se")
print("apague la Mac. Vuelve a ejecutar esto cada vez que toques un guion del puente.")
