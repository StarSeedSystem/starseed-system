#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escribe y carga los plists de launchd de Genesis. Lo llama instalar-servicios.sh.

Dos reglas que costaron caras y por eso están aquí y no en la memoria de nadie:

1. launchd NO usa el PATH para encontrar el ejecutable. Ruta absoluta siempre.
2. El «Acceso total al disco» de macOS se concede POR BINARIO. En esta Mac lo tiene
   /opt/homebrew/bin/python3 y no lo tienen /bin/zsh ni /bin/bash, así que cualquier
   servicio cuyo programa sea un shell y lea algo de ~/Documents muere con «can't
   open input file» (127) o «cannot execute» (126) aunque el archivo esté ahí y sea
   ejecutable. Esos van envueltos en lanzador-tcc.py, que los corre como hijos de
   python3 y así heredan el permiso. Lee la cabecera de ese archivo si dudas.

  python3 instalar-servicios.py <raiz-del-repo> <ruta-python3>
  STARSEED_SOLO=voz-rt python3 instalar-servicios.py   # solo esos (coma), sin tocar el resto
"""

import os, subprocess, sys

# Los argumentos de línea solo cuentan al ejecutarlo como guion: las pruebas
# importan el módulo (se instala al importarse) y su sys.argv no es de aquí.
_ARGV = sys.argv if __name__ == "__main__" else []
RAIZ = os.environ.get("STARSEED_RAIZ", _ARGV[1] if len(_ARGV) > 1 else "/Users/alex/Documents/starseed-os-main")
PY3 = os.environ.get("STARSEED_PY3", _ARGV[2] if len(_ARGV) > 2 else "/opt/homebrew/bin/python3")
HOME = os.path.expanduser("~")
AG = os.path.join(HOME, "Library", "LaunchAgents")
P = lambda n: os.path.join(RAIZ, "scripts", "puente", n)
LANZ = [PY3, P("lanzador-tcc.py")]

# (2026-10-07) Este guion INSTALA al importarse. Una prueba que lo cargó bajo
# `python -m unittest discover -s scripts/puente` le pasó «discover» como RAIZ y «-s» como
# PY3, y dejó en ~/Library/LaunchAgents un com.starseed.produccion con ProgramArguments
# ["-s", "discover/…"] (exit 78: el director de producción nunca corrió). Con argumentos que
# no son una raíz y un python reales, no se toca nada.
# La guarda solo vale ejecutándolo como guion: al importarse (pruebas) _ARGV ya es [] y la
# RAIZ por defecto es correcta; aquel sys.exit salía también en las pruebas y la entrada
# «produccion» nunca llegaba a existir (PRD1005J).
if __name__ == "__main__" and not (os.path.isabs(RAIZ) and os.path.isdir(os.path.join(RAIZ, "scripts", "puente")) and os.path.isabs(PY3)):
    sys.exit("instalar-servicios: RAIZ (%r) o PY3 (%r) no son rutas válidas; no instalo nada." % (RAIZ, PY3))

# nombre -> (orden, log, vive_siempre)
#   vive_siempre=False -> KeepAlive sólo si sale con error (guiones de un disparo)
SERVICIOS = {
    "vigilante": (
        [PY3, P("vigilante-enjambre.py")],
        "/tmp/starseed-vigilante.log",
        True,
    ),
    "director": (
        [PY3, P("director-orquestacion.py")],
        "/tmp/starseed-director.log",
        True,
    ),
    "guardia": ([PY3, P("guardia-memoria.py")], "/tmp/starseed-guardia.log", True),
    # (2026-09-22) Tokens/s de Genesis. No pregunta a ninguna API ni toca ningún proceso:
    # lee cada 5 s los contadores que YA están escritos en disco y guarda las diferencias.
    "tokens": (
        [PY3, "-u", P("tokens_por_segundo.py")],
        "/tmp/starseed-tokens.log",
        True,
    ),
    "eco": (
        [PY3, P("eco-enjambre.py"), "/tmp/enjambre.log"],
        "/tmp/starseed-eco.log",
        True,
    ),
    # ecoides (eco-a-ides.py) RETIRADO el 2026-09-13 por orden de Alex: empujaba un
    # resumen del canal a la sesión de Codex cada 120 s con `codex queue`, y eso
    # agotaba los créditos de ChatGPT. El canal se lee cuando se quiere
    # (`starseed-puente escuchar`); nadie lo empuja solo a un chat de pago.
    # El de Telegram ya funcionaba así: el shell sólo carga las claves de ~/.hermes/.env
    # (fuera de ~/Documents, sin TCC de por medio) y se convierte en python3 con exec.
    "telegram": (
        [
            "/bin/zsh",
            "-c",
            'set -a; [ -f "$HOME/.hermes/.env" ] && source "$HOME/.hermes/.env"; '
            # (2026-09-22) `-u`: sin él Python bufferea stdout y el log del puente
            # se quedaba en 0 bytes durante DÍAS aunque el proceso estuviera vivo.
            # Un servicio que no puede contar lo que hace no se puede diagnosticar:
            # me costó media hora saber si reenviaba o no.
            "set +a; exec %s -u %s" % (PY3, P("telegram-puente.py")),
        ],
        "/tmp/starseed-telegram.log",
        True,
    ),
    # Genesis lo supervisa launchd en primer plano: nada de doble fork. Así hay un pid
    # de verdad, KeepAlive lo revive solo, y no queda huérfano si se reinicia el MCP.
    # (2026-09-16) El servidor de Genesis corría SIN NINGUNA clave de proveedor en su
    # entorno: `listarModelos()` daba «sin clave» para todo y el asistente técnico no
    # tenía a quién preguntar. Se cargan como en el servicio de Telegram: el shell lee
    # ~/.hermes/.env y ~/.starseed/env y se convierte en el lanzador con exec.
    "mando": (
        [
            "/bin/zsh",
            "-c",
            'set -a; [ -f "$HOME/.hermes/.env" ] && source "$HOME/.hermes/.env"; '
            '[ -f "$HOME/.starseed/env" ] && source "$HOME/.starseed/env"; set +a; '
            "exec %s --cwd %s --env STARSEED_MANDO=1 --env STARSEED_LOCAL=1 "
            "-- /opt/homebrew/bin/npx next start -p 9002" % (" ".join(LANZ), RAIZ),
        ],
        "/tmp/starseed-mando.log",
        True,
    ),
    # (2026-09-22) Genesis se sirve con `next start`, o sea de un build compilado: editar
    # `src/` no cambiaba NADA de lo que se ve hasta que alguien corría `next build`. De ahí
    # los «todo sigue igual» de Alex delante de arreglos que ya estaban en el disco. Esto
    # compila solo cuando las fuentes de la pantalla cambian, con el turno de la máquina
    # (para no pelear RAM con los agentes) y reinicia Genesis al acabar.
    "reconstruir": (
        [PY3, P("reconstruir_mando.py")],
        "/tmp/starseed-reconstruir.log",
        True,
    ),
    # (2026-09-22) Alex: «todos los medidores y todos los procesos activos deben ser
    # analizados por los directores verificadores en todo el tiempo y solucionar cualquier
    # situación automáticamente». Los directores que había vigilaban cada uno su parcela;
    # ninguno miraba el TABLERO. Esa noche el orquestador estuvo 123 minutos parado en una
    # puerta de aprobación y los medidores lo enseñaban sin que nadie los leyera.
    "vigia": ([PY3, P("vigia_medidores.py")], "/tmp/starseed-vigia.log", True),
    # (2026-10-07) Director de producción y publicación: con el interruptor «Autopublicación»
    # de Genesis encendido, lleva main a producción tras análisis, pruebas, CI y verificación
    # (`autopublicar.py`, una pasada cada 5 min). Apagado, solo informa.
    "produccion": ([PY3, P("autopublicar.py"), "--bucle"], "/tmp/starseed-produccion.log", True),
    # (2026-10-10) Revisor automático de bloqueadas (OPB1011, `architecture/ninguna-tarea-se-desperdicia.md`):
    # cada 5 min transforma cada tarea quieta —reordena, reintenta sin gastar intento lo que falló
    # por el medio, reescribe con el contexto de hoy, divide, fusiona, cierra lo que main ya tiene— y
    # solo pregunta a Alex lo que es suyo. Un solo revisor por máquina (flock).
    "revisor": ([PY3, "-u", P("revisor_bloqueadas.py"), "--bucle"], "/tmp/starseed-revisor-bloqueadas.log", True),
    # (2026-10-08) Director de diseño (Ola 1005D, DIS1005E): brief al entrar cada
    # tarea de interfaz, verificación al integrar y aprendizaje, con informe horario
    # al Chat Director. Envuelto en lanzador-tcc.py como el resto de directores.
    "diseno": (
        LANZ + ["--", PY3, P("director-diseno.py")],
        "/tmp/starseed-diseno.log",
        True,
    ),
    # (2026-10-05) Pantalla siempre encendida (Ola 1005P, PA1005C): mantiene un
    # `caffeinate -dim` ligado a su propio proceso y declara al usuario activo cada 50 s,
    # según ~/.starseed/pantalla.json (encendida por defecto). Genesis lo lee con
    # `launchctl list com.starseed.pantalla` (pantalla-config.ts). Instalado a mano esa
    # noche y vivo; aquí queda para que una reinstalación lo vuelva a poner.
    "pantalla": ([PY3, P("mantener_pantalla.py")], "/tmp/starseed-pantalla.log", True),
    # (2026-10-04) Chat Director (Ola 1004): el cartero lee chat.jsonl y entrega
    # cada mensaje a los canales pedidos (claude-mac, hermes, telegram, chatgpt,
    # bandejas). `director_chat.py` tacha las claves antes de escribir.
    "cartero": ([PY3, P("cartero_director.py")], "/tmp/starseed-cartero.log", True),
    # (2026-09-22) Voz en tiempo real de Astraura (Supertonic 3, 127.0.0.1:4460): la voz de
    # las conversaciones, 4 veces más rápida que el tiempo real en esta Mac, con una voz fija.
    # Corre en su propio entorno (~/.starseed/astraura-voice/rt-venv) y lleva la concesión de
    # conversación que da prioridad a la voz y a BitNet sobre el enjambre.
    "voz-rt": (
        LANZ
        + [
            "--",
            os.path.join(
                HOME, ".starseed", "astraura-voice", "rt-venv", "bin", "python"
            ),
            "-u",
            os.path.join(RAIZ, "native", "astraura-voice", "conversacion", "voz_rt.py"),
        ],
        "/tmp/starseed-voz-rt.log",
        True,
    ),
    "laya": (
        LANZ
        + [
            "--",
            "/opt/homebrew/bin/node",
            os.path.join(RAIZ, "native", "laya", "servidor-laya.mjs"),
        ],
        "/tmp/starseed-laya.log",
        True,
    ),
    "flujos": (
        [PY3, P("flujos/servicio.py")],
        "/tmp/starseed-flujos.log",
        True,
    ),
    # (2026-10-10) MetaGenesis desde cualquier neurona: puerta solo /api/mando en :9012 +
    # túnel de cloudflared + URL y latido en la tabla `metagenesis_motor` (solo miembros).
    # python3 directo (tiene el permiso de disco). SOP: architecture/metagenesis-remoto-tunel.md
    "tunel-metagenesis": (
        [PY3, "-u", P("tunel_metagenesis.py")],
        "/tmp/starseed-tunel-metagenesis.log",
        True,
    ),
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


def _cargar(etiqueta, ruta):
    """plutil + unload/load de un plist ya escrito, con su línea de estado."""
    ok = subprocess.run(["plutil", "-lint", ruta], capture_output=True).returncode == 0
    subprocess.run(["launchctl", "unload", ruta], capture_output=True)
    r = subprocess.run(["launchctl", "load", ruta], capture_output=True, text=True)
    print(
        "  %-10s plist %s · %s"
        % (
            etiqueta.split(".")[-1],
            "ok" if ok else "INVÁLIDO",
            "cargado" if r.returncode == 0 else (r.stderr.strip()[:50] or "error"),
        )
    )


def instalar(etiqueta, orden, log, siempre):
    ruta = os.path.join(AG, etiqueta + ".plist")
    with open(ruta, "w") as f:
        f.write(
            PLANTILLA
            % {
                "etiqueta": etiqueta,
                "raiz": RAIZ,
                "log": log,
                "home": HOME,
                "args": "\n".join("    <string>%s</string>" % esc(a) for a in orden),
                "vivo": "<key>KeepAlive</key><true/>"
                if siempre
                else "<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>",
            }
        )
    _cargar(etiqueta, ruta)


# (2026-10-24, Ola 1024I · IMG1024E; era IMN1021Eb, que el enjambre nunca terminó) Servicios que corren
# CADA N segundos (StartInterval, sin KeepAlive), escritos aquí mismo con las rutas de esta instalación.
#   «autodesarrollo»: el director de autodesarrollo (`director_autodesarrollo.py ciclo`, contrato
#   architecture/imaginacion-autodesarrollo.md §5 y Ola 1024I) cada 15 min: imagina cuando toca, recoge las
#   propuestas libres de los agentes, aplica el automático (alta y crítica nunca solas) y encarga las
#   reimaginaciones. Su propio cerrojo evita dos ciclos a la vez.
#   · lanzador-tcc.py de padre y python3 por ruta absoluta (las dos reglas de la cabecera).
#   · ProcessType «Standard» y no «Background»: lo que lanza (la imaginación diaria, `suenos.py lanzar` y el
#     orquestador que este arranca) hereda el papel del servicio, y en Background macOS le ahoga CPU y disco
#     (el oído pasó de 15 s a 186 s así). AbandonProcessGroup: al acabar cada ciclo, launchd no mata lo lanzado.
# nombre -> (orden, log, cada_s, ProcessType)
CADA = {
    "autodesarrollo": (
        LANZ + ["--", PY3, "-u", P("director_autodesarrollo.py"), "ciclo"],
        "/tmp/starseed-autodesarrollo.log",
        15 * 60,
        "Standard",
    ),
}

PLANTILLA_CADA = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>%(etiqueta)s</string>
  <key>ProgramArguments</key><array>
%(args)s
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>%(cada)d</integer>
  <key>ProcessType</key><string>%(tipo)s</string>
  <key>AbandonProcessGroup</key><true/>
  <key>WorkingDirectory</key><string>%(raiz)s</string>
  <key>StandardOutPath</key><string>%(log)s</string>
  <key>StandardErrorPath</key><string>%(log)s</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>%(home)s/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>STARSEED_ROOT</key><string>%(raiz)s</string>
  </dict>
</dict></plist>
"""


def instalar_cada(etiqueta, orden, log, cada_s, tipo):
    ruta = os.path.join(AG, etiqueta + ".plist")
    with open(ruta, "w") as f:
        f.write(
            PLANTILLA_CADA
            % {
                "etiqueta": etiqueta,
                "raiz": RAIZ,
                "log": log,
                "home": HOME,
                "cada": int(cada_s),
                "tipo": tipo,
                "args": "\n".join("    <string>%s</string>" % esc(a) for a in orden),
            }
        )
    _cargar(etiqueta, ruta)


# (2026-10-22) Servicios PERIÓDICOS (StartInterval, no KeepAlive): su plist vive en el repo con
# las rutas de la Mac de Alex y aquí solo se cambian por las de esta instalación.
#   «alta-nube» (Ola 1022C, ALT1022Ac): cada 15 min trae lo que dejaron las sesiones de Claude en
#   la nube y lanza otras con el crédito de sesiones en la nube (`alta-capacidad-nube.py ciclo`).
PERIODICOS = {"alta-nube": P("com.starseed.alta-nube.plist")}


def adaptar_plist(texto):
    """Las rutas de la Mac de Alex → las de esta instalación (raíz, python3 y HOME)."""
    return (
        texto.replace("/Users/alex/Documents/starseed-os-main", RAIZ)
        .replace("/opt/homebrew/bin/python3", PY3)
        .replace("/Users/alex/", HOME.rstrip("/") + "/")
    )


def instalar_periodico(etiqueta, fuente):
    ruta = os.path.join(AG, etiqueta + ".plist")
    with open(fuente, encoding="utf-8") as f:
        texto = adaptar_plist(f.read())
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)
    os.makedirs(os.path.join(HOME, ".starseed"), exist_ok=True)
    _cargar(etiqueta, ruta)


# Reinstalar TODOS reinicia Genesis y los directores; con STARSEED_SOLO se toca solo lo nombrado.
SOLO = {n.strip() for n in os.environ.get("STARSEED_SOLO", "").split(",") if n.strip()}
for nombre, (orden, log, siempre) in SERVICIOS.items():
    if SOLO and nombre not in SOLO:
        continue
    instalar("com.starseed." + nombre, orden, log, siempre)
for nombre, fuente in PERIODICOS.items():
    if (SOLO and nombre not in SOLO) or not os.path.exists(fuente):
        continue
    instalar_periodico("com.starseed." + nombre, fuente)
for nombre, (orden, log, cada_s, tipo) in CADA.items():
    if SOLO and nombre not in SOLO:
        continue
    instalar_cada("com.starseed." + nombre, orden, log, cada_s, tipo)
if SOLO:
    sys.exit(0)

# El túnel de Astraura vive en otra carpeta y con su propio bash: mismo TCC, mismo
# envoltorio. Sólo se toca si el guion sigue estando donde dice su plist.
TUNEL = "/Users/alex/Documents/IA 1.58 bit/tunnel_monitor.sh"
if os.path.exists(TUNEL):
    instalar(
        "com.starseed.astraura.tunnel",
        LANZ + ["--", "/bin/bash", TUNEL],
        "/tmp/astraura_tunnel.log",
        True,
    )

# (2026-09-17) El túnel de Genesis: mismo mecanismo que el de Astraura,
# hacia :9002. Pedido por Alex para abrir y vincular Genesis desde cualquier
# navegador. Su guion vuelve enseguida si ya hay túnel vivo; launchd lo relanza
# cada 5 min como vigilante, y si la URL cambia, tunel-mando.sh la guarda en
# ~/.starseed/tunel-mando.json (nunca en el repo).
TUNEL_MANDO = P("tunel-mando.sh")
if os.path.exists(TUNEL_MANDO):
    instalar(
        "com.starseed.mando.tunel",
        LANZ + ["--", "/bin/bash", TUNEL_MANDO],
        os.path.expanduser("~/.starseed/tunel-mando.log"),
        True,
    )

# (2026-09-19) FreeLLMAPI: pasarela unificada OpenAI-compatible en :3001 que
# reparte entre los proveedores gratuitos con las claves que ya tenemos. Pedida
# por Alex para «todos los IDE y Genesis». Las claves se le pasan en
# memoria al arrancar (freellmapi-lanzar.sh), nunca en un archivo nuevo.
FREELLMAPI = os.path.expanduser("~/.starseed/herramientas/freellmapi-lanzar.sh")
if os.path.exists(FREELLMAPI):
    instalar(
        "com.starseed.freellmapi",
        LANZ + ["--", "/bin/bash", FREELLMAPI],
        os.path.expanduser("~/.starseed/freellmapi.log"),
        True,
    )

print(
    "\nlaunchd los mantiene vivos aunque se reinicie el MCP, se cierre la terminal o se"
)
print("apague la Mac. Vuelve a ejecutar esto cada vez que toques un guion del puente.")
