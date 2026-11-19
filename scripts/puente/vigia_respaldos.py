#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de respaldos de claves (SEG1119B): compara solo huellas y fechas de claves-mac-*.gpg
en Maggabox, A1 y Drive; nunca abre la copia. Tras dos días seguidos avisa en el Chat Director
y deja la orden exacta en «Te toca a ti». Uso: vigia_respaldos.py [--dia YYYY-MM-DD]"""
from __future__ import annotations
import json, os, re, sys
from datetime import date, timedelta
MEDIOS = ("maggabox", "a1", "drive")
ALIAS = {"maggabox": "maggabox", "magga": "maggabox", "a1": "a1", "oracle": "a1", "drive": "drive", "google-drive": "drive", "gdrive": "drive"}
BASE = os.path.expanduser("~/.starseed/respaldo-claves")
LOG, ESTADO = os.path.join(BASE, "respaldo.log"), os.path.join(BASE, "vigia-estado.json")
ACCIONES = os.path.join(os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "starseed_memory_root", "mando", "acciones-de-alex.json")
ARCHIVO, DIA_RE = re.compile(r"^claves-mac-[A-Za-z0-9._-]+\.gpg$"), re.compile(r"^\d{4}-\d{2}-\d{2}$")
def medio_canonico(nombre):
    return ALIAS.get(str(nombre or "").strip().lower())

def registros(texto):
    """PURA: líneas JSONL → observaciones válidas; ignora lo roto y lo que no es copia de claves."""
    salida = []
    for linea in str(texto or "").splitlines():
        try: d = json.loads(linea)
        except ValueError: continue
        if not isinstance(d, dict): continue
        medio = medio_canonico(d.get("medio"))
        archivo = os.path.basename(str(d.get("archivo") or ""))
        dia = str(d.get("dia") or str(d.get("fecha") or "")[:10])
        huella = str(d.get("huella") or "").lower().removeprefix("sha256:").strip()
        fecha = str(d.get("fecha") or "").strip()
        if medio and ARCHIVO.match(archivo) and DIA_RE.match(dia) and huella and fecha:
            salida.append({"dia": dia, "medio": medio, "archivo": archivo, "huella": huella, "fecha": fecha})
    return salida

def _referencia(pares):
    cuenta = {p: list(pares.values()).count(p) for p in pares.values()}
    tope = max(cuenta.values()) if cuenta else 0
    return next((pares[m] for m in MEDIOS if m in pares and cuenta[pares[m]] == tope), None)

def anomalias(regs, dia):
    vistos = {}
    for r in regs:
        if r["dia"] == dia: vistos.setdefault(r["archivo"], {})[r["medio"]] = (r["huella"], r["fecha"])
    fallos = []
    for archivo, pares in sorted(vistos.items()):
        ref = _referencia(pares)
        for medio in MEDIOS:
            clase = "falta" if medio not in pares else "" if pares[medio] == ref else "difiere"
            if clase: fallos.append({"clave": medio, "medio": medio, "archivo": archivo, "clase": clase, "referencia": " · ".join(ref) if ref else ""})
    return fallos
def _ayer(previo, dia):
    try: return date.fromisoformat(previo) == date.fromisoformat(dia) - timedelta(days=1)
    except (TypeError, ValueError): return False

def decidir(hoy, estado, dia):
    por_medio, estado = {a["clave"]: a for a in hoy}, estado if isinstance(estado, dict) else {}
    seguidas = set(por_medio) & set(estado.get("claves") or []) if _ayer(estado.get("dia"), dia) else set()
    avisadas = set(estado.get("alertados") or [])
    alertas = [por_medio[m] for m in sorted(seguidas - avisadas)]
    nuevo = {"dia": dia, "claves": sorted(por_medio), "alertados": sorted((avisadas | {a["clave"] for a in alertas}) & set(por_medio))}
    return {"alertas": alertas, "estado": nuevo}

def orden(fallo):
    a, m = fallo["archivo"], fallo["medio"]
    if m == "maggabox":
        return "rsync -a --checksum ~/.starseed/respaldo-claves/%s maggasukha@starseed-nodo-1.local:~/StarSeed-almacen/respaldos/claves/" % a
    if m == "a1":
        ip = "$(python3 -c \"import json,os;d=json.load(open(os.path.expanduser('~/.starseed/oracle.json')));print([i['ip_publica'] for i in d['instancias'] if 'a1' in i['nombre']][0])\")"
        return "scp -i ~/.ssh/starseed_oracle_ed25519 ~/.starseed/respaldo-claves/%s ubuntu@%s:/home/starseed/.starseed/respaldo-claves/" % (a, ip)
    return "cp -p ~/.starseed/respaldo-claves/%s \"/Volumes/GoogleDrive/My Drive/StarSeed-respaldos-mac/claves/\"" % a

def aviso(alertas):
    return "\n".join(["Respaldo de claves: %d copia(s) fallan dos días seguidos." % len(alertas)] + ["· %s · %s: %s\n  orden: %s" % (a["medio"], a["archivo"], a["clase"], orden(a)) for a in alertas])

def entradas_accion(alertas):
    return [{"id": "respaldo-%s-%s" % (a["medio"], a["archivo"].replace("claves-mac-", "").replace(".gpg", "")),
             "titulo": "Respaldo de claves: reponer la copia de %s" % a["medio"],
             "por_que": "%s %s dos días seguidos." % (a["archivo"], "falta" if a["clase"] == "falta" else "no coincide"),
             "urgencia": "alta", "comando": orden(a),
             "por_que_no_lo_hago_yo": "copiar una copia cifrada es mover material de claves: lo hace Alex",
             "detalle": "referencia: %s" % a["referencia"]} for a in alertas]

def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return defecto

def _texto(ruta):
    try:
        with open(ruta, encoding="utf-8") as f: return f.read()
    except OSError: return ""

def _guardar(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta + ".tmp", "w", encoding="utf-8") as f: json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(ruta + ".tmp", ruta)

def _publicar(texto):
    try:
        import director_chat  # noqa: PLC0415 — vive en esta misma carpeta
        director_chat.publicar(texto, de="vigia-respaldos", rol="director", tipo="aviso")
    except Exception: pass  # noqa: BLE001 — sin Chat Director, el estado y la acción quedan igual

def _anotar(alertas, ruta):
    previas = [a for a in (_leer(ruta, {}) or {}).get("acciones", []) if isinstance(a, dict) and not str(a.get("id") or "").startswith("respaldo-")]
    _guardar(ruta, {"generado": date.today().isoformat(), "acciones": previas + entradas_accion(alertas)})

def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    dia = args[args.index("--dia") + 1] if "--dia" in args and args.index("--dia") + 1 < len(args) else date.today().isoformat()
    regs = registros(_texto(LOG))
    if not [r for r in regs if r["dia"] == dia]: print("Sin observaciones de respaldo para %s." % dia); return 0
    decision = decidir(anomalias(regs, dia), _leer(ESTADO, {}), dia)
    _guardar(ESTADO, decision["estado"])
    if not decision["alertas"]: print("Respaldo de claves %s: revisado, sin fallos de dos días." % dia); return 0
    texto = aviso(decision["alertas"])
    _publicar(texto)
    _anotar(decision["alertas"], ACCIONES)
    print(texto)
    return 0
if __name__ == "__main__": sys.exit(main())
