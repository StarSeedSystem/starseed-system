#!/usr/bin/env python3
"""Instalador de IA local por sistema (BAP1127O · contrato §6.3, decisiones C.21 y D.6).

`plan()` es PURO: devuelve pasos (listas de argumentos, nunca shell). `--aplicar` exige `--visto-bueno`,
verifica cada SHA-256 antes de ejecutar y solo descarga de las URL que salen de las constantes.
"""
import hashlib
import json
import os
import shutil
import sys

# Repo «IA 1.58 bit» (Astraura). None = pendiente de fijar: el plan lo dice y no inventa nada.
BITNET_REPO = "StarSeedSystem/astraura"
BITNET_COMMIT = None
BITNET_SHA256 = None
RAM_LAYA_MB = 4096
PUERTO_LAYA = "4470"
RUTA_LAYA = "native/laya/servidor-laya.mjs"
DESTINO = os.path.expanduser("~/.starseed/ia")
SOPORTADOS = ("darwin", "linux")


def url_bitnet():
    return f"https://raw.githubusercontent.com/{BITNET_REPO}/{BITNET_COMMIT}/scripts/nodo-bitnet.sh"


def _bitnet(destino):
    if not (BITNET_COMMIT and BITNET_SHA256):
        return [{"capa": "bitnet", "tipo": "pendiente", "nota": "pendiente de fijar: falta commit y SHA-256"}]
    ruta = os.path.join(destino, "nodo-bitnet.sh")
    return [
        {"capa": "bitnet", "tipo": "descarga", "args": ["curl", "-fsSL", "-o", ruta, url_bitnet()]},
        {"capa": "bitnet", "tipo": "verificar", "ruta": ruta, "sha256": BITNET_SHA256},
        {"capa": "bitnet", "tipo": "ejecutar", "args": ["bash", ruta]},
    ]


def _unidad_laya(node, servicio):
    return (f"[Unit]\nDescription=StarSeed · Servidor Laya\nAfter=network-online.target\n\n[Service]\n"
            f"Environment=STARSEED_LAYA_PUERTO={PUERTO_LAYA}\nExecStart={node} {servicio}\n"
            "Restart=on-failure\nMemoryMax=5G\n\n[Install]\nWantedBy=multi-user.target\n")


def _laya(sistema, node, servicio):
    if sistema == "linux":
        unidad = "/etc/systemd/system/starseed-laya.service"
        return [
            {"capa": "laya", "tipo": "escribir", "ruta": unidad, "contenido": _unidad_laya(node, servicio)},
            {"capa": "laya", "tipo": "ejecutar", "args": ["systemctl", "daemon-reload"]},
            {"capa": "laya", "tipo": "ejecutar", "args": ["systemctl", "enable", "--now", "starseed-laya"]},
        ]
    return [{"capa": "laya", "tipo": "ejecutar", "args": [node, servicio],
             "env": {"STARSEED_LAYA_PUERTO": PUERTO_LAYA}}]


def plan(perfil, sistema, ram_libre_mb=0, node=None, destino=DESTINO):
    """perfil = salida de perfil_ia_nodo.perfil(); ram_libre_mb decide Laya (≥ 4 GB)."""
    if sistema not in SOPORTADOS:
        return {"estado": "sin-soporte", "pasos": [],
                "motivo": f"{sistema}: solo macOS y Linux; ahí va Needle en el navegador o la app"}
    pasos = []
    if perfil.get("slots_bitnet", 0) > 0:
        pasos += _bitnet(destino)
    caben = perfil.get("capas_que_caben", [])
    if "needle" in caben:
        pasos.append({"capa": "needle", "tipo": "ejecutar", "args": ["python3", "scripts/puente/needle_web_paquete.py"]})
    if "laya" in caben and ram_libre_mb >= RAM_LAYA_MB:
        pasos += _laya(sistema, node or shutil.which("node") or "node", RUTA_LAYA)
    return {"estado": "ok", "pasos": pasos, "motivo": "ok"}


def sha256_de(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def aplicar(el_plan, visto_bueno, ejecutor, sha=sha256_de, escribir=None):
    """ejecutor(paso) → código de salida. Devuelve (ok, motivo). Sin visto bueno no hace nada."""
    if not visto_bueno:
        return False, "falta --visto-bueno: no se instala nada"
    if el_plan["estado"] != "ok":
        return False, el_plan["motivo"]
    for paso in el_plan["pasos"]:
        if paso["tipo"] == "pendiente":
            return False, paso["nota"]
        if paso["tipo"] == "verificar" and sha(paso["ruta"]) != paso["sha256"]:
            return False, f"SHA-256 distinto en {paso['ruta']}: abortado"
        if paso["tipo"] == "escribir":
            (escribir or _escribir)(paso["ruta"], paso["contenido"])
        elif paso["tipo"] in ("descarga", "ejecutar") and ejecutor(paso) != 0:
            return False, f"falló {paso['args'][0]} ({paso['capa']})"
    return True, "ok"


def _escribir(ruta, contenido):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w") as f:
        f.write(contenido)


def _ejecutar_real(paso):
    import subprocess
    os.makedirs(DESTINO, exist_ok=True)
    return subprocess.run(paso["args"], env={**os.environ, **paso.get("env", {})}).returncode


def main(argv):
    import platform
    import perfil_ia_nodo as P
    total, libre = P.medir()
    sistema = platform.system().lower()
    p = P.perfil(total, libre, os.cpu_count() or 1, sistema, None, direccion=sistema == "darwin")
    el_plan = plan(p, sistema, libre)
    if "--aplicar" in argv:
        ok, motivo = aplicar(el_plan, "--visto-bueno" in argv, _ejecutar_real)
        print(motivo)
        return 0 if ok else 1
    print(json.dumps(el_plan, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    sys.exit(main(sys.argv[1:]))
