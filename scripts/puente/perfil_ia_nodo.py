#!/usr/bin/env python3
"""Perfil de IA de un nodo (BAP1127K · architecture/automejora-pruebas-malla.md §6.2).

Puro: `perfil()` no mide nada. `main --json` mide este medio y escribe
~/.starseed/perfil-ia.json. El ctx de llama-server es TOTAL y se reparte entre slots.
"""
import json
import os
import platform
import re
import subprocess
import sys

MB_NEEDLE = 300
MB_LAYA = 2500  # = MIN_RAM_MB de native/laya/servidor-laya.mjs
MB_MIN_BITNET = 1500
SALIDA = os.path.expanduser("~/.starseed/perfil-ia.json")


def _tabla(total_mb):
    """(slots, ctx_total) según la RAM total; los totales reales quedan algo por debajo."""
    if total_mb <= 8.5 * 1024:
        return 1, 512
    if total_mb < 30 * 1024:
        return 3, 1536
    return 4, 4096


def perfil(ram_total_mb, ram_libre_mb, nucleos, plataforma, capas_instaladas, direccion=False):
    nucleos = max(1, int(nucleos))
    hilos = max(1, nucleos // 2) if direccion else max(1, nucleos - 1)
    slots, ctx, motivo = 0, 0, "ok"
    if plataforma == "android":
        motivo = "android: solo Needle"
    elif ram_libre_mb < MB_MIN_BITNET:
        motivo = "sin RAM"
    else:
        slots, ctx = _tabla(ram_total_mb)
        slots = min(slots, max(1, nucleos // 2))
        ctx = ctx // _tabla(ram_total_mb)[0] * slots
    caben = []
    if ram_libre_mb >= MB_NEEDLE:
        caben.append("needle")
    if ram_libre_mb >= MB_LAYA:
        caben.append("laya")
    if capas_instaladas is not None:
        caben = [c for c in caben if c in capas_instaladas]
    return {
        "slots_bitnet": slots,
        "ctx_total": ctx,
        "ctx_por_slot": ctx // slots if slots else 0,
        "hilos": hilos,
        "capas_que_caben": caben,
        "motivo": motivo,
    }


def medir():
    """(total_mb, libre_mb): psutil, /proc/meminfo o vm_stat."""
    try:
        import psutil
        m = psutil.virtual_memory()
        return m.total // 2**20, m.available // 2**20
    except ImportError:
        pass
    try:
        with open("/proc/meminfo") as f:
            kb = {k: int(v.split()[0]) for k, v in (l.split(":", 1) for l in f)}
        return kb["MemTotal"] // 1024, kb.get("MemAvailable", kb["MemFree"]) // 1024
    except OSError:
        pass
    total = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"]).strip()) // 2**20
    vm = subprocess.check_output(["vm_stat"], text=True)
    pag = int(re.search(r"page size of (\d+)", vm).group(1))
    libres = sum(int(re.search(rf"{k}:\s+(\d+)", vm).group(1))
                 for k in ("Pages free", "Pages inactive", "Pages speculative"))
    return total, libres * pag // 2**20


def main(argv):
    total, libre = medir()
    sistema = platform.system().lower()
    r = perfil(total, libre, os.cpu_count() or 1, sistema, None, direccion=sistema == "darwin")
    if "--json" in argv:
        os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
        with open(SALIDA, "w") as f:
            json.dump(r, f, ensure_ascii=False, indent=2)
        print(json.dumps(r, ensure_ascii=False))
    else:
        print(r)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
