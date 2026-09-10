#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Empuja el canal común DENTRO del chat principal de cada IDE que lo permita.

El canal es un archivo, y un archivo no se mete solo en una conversación. Telegram
se enteraba porque su puente EMPUJA; Codex, Hermes y Antigravity no, así que sus
chats se quedaban quietos y había que abrir `starseed-puente escuchar` a mano.

Aquí se empuja de verdad, con lo que cada herramienta ofrece:

  · Codex   → `codex queue --thread <uuid> --message …` mete el mensaje en la cola
              de la sesión principal, y aparece en el chat sin tocar nada. Verificado.
  · Hermes  → no expone forma de inyectar en una sesión abierta. Lo mejor que da es
              un trabajo de `hermes cron --continuity`, que despierta la sesión cada N
              minutos; no es tiempo real y se anota como tal. Sin fingir lo que no hay.
  · Antigravity → tampoco. Su via es un panel de terminal con `starseed-puente escuchar`.

Se agrupa a propósito: un mensaje por línea del canal inunda cualquier chat. Se manda
un resumen cada `VENTANA_S` segundos, y lo urgente (error) va solo, al momento.

  python3 scripts/puente/eco-a-ides.py
"""
import json, os, subprocess, sys, time

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
CANAL = os.path.join(RAIZ, "starseed_memory_root", "mando", "canal.jsonl")
CHATS = os.path.join(RAIZ, "scripts", "puente", "chats.json")
VENTANA_S = int(os.environ.get("STARSEED_ECO_VENTANA_S", "120"))
# De quién NO reenviamos: lo que ya nació en un IDE no vuelve a ese mismo IDE.
PROPIO = {"codex": ("astra", "codex")}


def hilo_codex():
    try:
        d = json.load(open(CHATS, encoding="utf-8"))
        return (d.get("entornos", {}).get("codex") or {}).get("id")
    except Exception:
        return None


def a_codex(hilo, texto):
    try:
        subprocess.run(["codex", "queue", "--thread", hilo, "--message", texto],
                       capture_output=True, timeout=30)
        return True
    except Exception:
        return False


def pinta(f):
    marca = {"error": "✗", "aviso": "!", "hecho": "✓", "mensaje": "·"}.get(f.get("tipo"), "·")
    tarea = (" [%s]" % f["tarea"]) if f.get("tarea") else ""
    return "%s %s %s%s %s" % (f.get("t", "")[11:], marca, f.get("quien", "?"), tarea, f.get("texto", ""))


def main():
    hilo = hilo_codex()
    if not hilo:
        print("No hay hilo principal de Codex en chats.json: nada que empujar."); return 1
    print("Eco a los IDE · Codex %s · ventana %ss" % (hilo[:8], VENTANA_S))
    os.makedirs(os.path.dirname(CANAL), exist_ok=True)
    open(CANAL, "a", encoding="utf-8").close()
    pendientes, ultimo = [], time.time()
    with open(CANAL, encoding="utf-8") as f:
        f.seek(0, os.SEEK_END)
        while True:
            linea = f.readline()
            if linea:
                try:
                    fila = json.loads(linea)
                except Exception:
                    continue
                quien = (fila.get("quien") or "").lower()
                if any(quien.startswith(p) for p in PROPIO["codex"]):
                    continue                      # no le devolvemos a Codex lo suyo
                if fila.get("tipo") == "error":   # lo urgente no espera a la ventana
                    a_codex(hilo, "[canal] " + pinta(fila))
                    continue
                pendientes.append(pinta(fila))
                continue
            ahora = time.time()
            if pendientes and ahora - ultimo >= VENTANA_S:
                cuerpo = "\n".join(pendientes[-25:])
                a_codex(hilo, "[canal · %d mensajes]\n%s" % (len(pendientes), cuerpo))
                pendientes, ultimo = [], ahora
            time.sleep(1)


if __name__ == "__main__":
    sys.exit(main() or 0)
