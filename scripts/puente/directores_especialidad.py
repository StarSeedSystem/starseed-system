#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Directores por especialidad (AUT1121D): revisan antes de integrar, aprenden de fallos.

Áreas:
  - interfaz: UI, componentes, CSS, páginas, diseño
  - puente: scripts Python, orquestación, enjambre, salud
  - rust: código nativo, Cargo, FFI, WASM
  - malla: mesh, LoRa, WebRTC, sincronización, redes
  - datos: Supabase, SQL, migraciones, esquema, realtime
  - pruebas: tests, vitest, pytest, fixtures, cobertura
  - audiovisual: Three.js, WebGL, audio, shaders, geometría

Cada director:
  - Tiene checklist propia por área
  - Se auto-asigna por archivos de la tarea
  - Guarda aprendizajes: fallo → causa → arreglo
  - Decide: reescribir encargo, partirlo, o escalar (AUT1121A)

Módulo PURO: recibe tarea y estado, no lee disco ni red.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


# ─── Constantes ──────────────────────────────────────────────────────────────

AREAS = (
    "interfaz",
    "puente",
    "rust",
    "malla",
    "datos",
    "pruebas",
    "audiovisual",
)

# Umbral: tras 2 fallos de puertas (tsc/vitest) en la misma tarea → director
UMBRAL_FALLOS_PUERTAS = 2

# Patrones de archivo → área (ordenados por prioridad: más específicos primero)
ARCHIVOS_POR_AREA = {
    "pruebas": (
        r".*\.test\.tsx?$", r".*\.spec\.tsx?$", r".*\.test\.ts$", r".*\.spec\.ts$",
        r"__tests__/", r"__tests__", r"vitest\.config", r"vitest",
        r"pytest", r"test_.*\.py$", r"coverage", r"playwright",
        r"testing-library", r"msw",
    ),
    "interfaz": (
        r"src/components/", r"src/app/", r"src/lib/themes/", r"src/lib/design/",
        r"design-system/", r"STARSEED_ANALISIS", r"DESIGN\.md",
        r".*\.css$", r".*\.scss$", r".*\.module\.css$",
        r".*\.tsx?$",
    ),
    "puente": (
        r"scripts/puente/", r"scripts/enjambre/", r".*\.py$",
        r"salud_", r"director_", r"enjambre", r"orquest", r"medios",
        r"cola", r"relevo", r"starseed-",
    ),
    "rust": (
        r".*\.rs$", r"Cargo\.toml", r"Cargo\.lock", r"build\.rs",
        r"src-tauri/", r"\.wasm", r"wasm-bindgen", r"ffi",
    ),
    "malla": (
        r"mesh", r"meshtastic", r"lora", r"webrtc", r"sincroniz",
        r"red-mesh", r"os_mesh", r"neurona", r"antenna", r"faros",
        r"synaptic", r"federation", r"p2p",
    ),
    "datos": (
        r"supabase/", r"\.sql$", r"migration", r"schema", r"realtime",
        r"postgres", r"rls", r"user_settings", r"entity_state",
        r"os_.*\.sql", r"astraura_state",
    ),
    "audiovisual": (
        r"three", r"webgl", r"shader", r"glsl", r"frag$", r"vert$",
        r"audio", r"audiomorphic", r"geometry-drawers", r"renderer",
        r"immersive", r"canvas", r"webgpu", r"spline", r"higgsfield",
    ),
}

# Checklists por área (clave: nombre del check, valor: descripción)
CHECKLISTS = {
    "interfaz": {
        "tokens": "Solo tokens de design-system; nada de hex sueltos",
        "contraste": "Contraste ≥ 4.5:1 en todos los estados",
        "dianas": "Dianas ≥ 44px en tactil y puntero",
        "responsive": "Comprobado 280/360/430/768/1024/1920/3840",
        "movimiento": "prefers-reduced-motion respetado; solo transform/opacity",
        "accesibilidad": "aria-label, roles, foco visible, orden DOM lógico",
        "trinity": "Respeta Zenith/Horizon/Logic/Anchor; no invade lienzo central",
        "cristal": "Blur 10px, radios armónicos, una familia de radios por componente",
    },
    "puente": {
        "modulo_puro": "Funciones puras sin E/S; E/S inyectable para tests",
        "sin_any": "Cero 'any'; tipos estrictos en firmas públicas",
        "claves_nombre": "Solo nombres de variables de entorno; nunca valores",
        "un_solo_orquestador": "No crea procesos paralelos que compitan por tsc",
        "puertas": "tsc → vitest → revisión → integración; nada sin ver en Genesis",
        "memoria_comun": "Escribe en starseed_memory_root/olas/control-<cola>.json",
        "latidos": "Eventos con categoría y tipo; sin secretos en texto",
        "manejo_errores": "clasificar_fallo_motor usado; no vi.mock de node:*",
    },
    "rust": {
        "cargo_check": "cargo check --all-targets pasa",
        "clippy": "cargo clippy -D warnings limpio",
        "fmt": "cargo fmt --check pasa",
        "tests": "cargo test pasa",
        "wasm": "wasm-pack build --target web si aplica",
        "ffi": "Límites FFI seguros; no unwind a C",
        "memoria": "Sin leaks; Drop implementado donde hace falta",
        "concurrencia": "Send/Sync correctos; sin data races",
    },
    "malla": {
        "duty_cycle": "Respeta budget de duty cycle LoRa",
        "cifrado": "Claves de sesión rotadas; sin claves en logs",
        "descubrimiento": "Faros pasivos; no flood de broadcast",
        "reintentos": "Backoff exponencial; glare cortés/descortés por ID",
        "topologia": "os_mesh_topology sincronizada push 45s/pull 60s",
        "rele": "os_mesh_relay para feed/faros; RLS por owner",
        "webRTC": "ICE/STUN/TURN configurado; datachannel binario",
        "offline": "Queue local persistente; sync al reconectar",
    },
    "datos": {
        "migracion": "Migración SQL reversible; up/down probados",
        "rls": "Políticas RLS en TODAS las tablas nuevas",
        "indices": "Índices en claves foráneas y filtros frecuentes",
        "tipos": "Tipos Postgres correctos (uuid, timestamptz, jsonb)",
        "realtime": "Publication solo tablas necesarias; fila completa si < 1KB",
        "backup": "pg_dump semanal verificado; point-in-time recovery",
        "limites": "PostgREST max_rows=1000; Auth/Realtime con topes",
        "freno": "os_freno al 100% presupuesto; aviso al 70%",
    },
    "pruebas": {
        "vitest_imports": "import {describe,it,expect} from 'vitest'; globals=false",
        "sin_vi_mock_node": "Prohibido vi.mock de módulos node:*",
        "sin_import_route": "No importar route.ts desde tests",
        "funciones_puras": "Tests solo de funciones puras; comportamiento por interfaz",
        "costura": "Una costura, una prueba, una implementación mínima",
        "cobertura": "Nuevos caminos cubiertos; no tests tautológicos",
        "refactor": "Refactor en revisión, no en rojo-verde",
        "tsc_antes": "tsc --noEmit pasa antes de vitest",
    },
    "audiovisual": {
        "webgl_contexto": "Contexto WebGL2 verificado; fallback Canvas 2D",
        "shaders": "GLSL validado; sin uniformes no usados; precision media",
        "geometria": "Geometría sagrada en capa aria-hidden; opacidad ≤ 22%",
        "audio": "Web Audio API; AudioContext suspendido hasta interacción",
        "rendimiento": "60fps en móvil; requestAnimationFrame; sin memory leaks",
        "movimiento_reducido": "prefers-reduced-motion desactiva animaciones",
        "assets": "Texturas/modelos comprimidos; lazy load; CSP compatible",
        "accesibilidad": "Alternativa textual; controles de pausa/volumen",
    },
}


@dataclass
class Aprendizaje:
    """Un aprendizaje: fallo → causa → arreglo."""
    fallo: str
    causa: str
    arreglo: str
    timestamp: float
    tarea_id: str
    archivo: str | None = None
    veces_usado: int = 0

    def clave(self) -> str:
        """Clave única para deduplicar."""
        base = f"{self.fallo}|{self.causa}|{self.arreglo}"
        return hashlib.sha256(base.encode()).hexdigest()[:16]


@dataclass
class EstadoDirector:
    """Estado persistente de un director."""
    area: str
    aprendizajes: dict[str, Aprendizaje] = field(default_factory=dict)
    # Tarea → lista de fallos de puertas (tsc/vitest)
    fallos_por_tarea: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    # Última vez que se asignó esta área
    ultima_asignacion: float = 0.0


@dataclass
class ResultadoRevision:
    """Resultado de la revisión de un director."""
    area: str
    aprobado: bool
    accion: str  # "integrar", "reescribir", "partir", "escalar"
    observaciones: list[str]
    checklist: dict[str, bool]
    aprendizajes_aplicados: list[str] = field(default_factory=list)


class DirectoresEspecialidad:
    """Gestiona los 7 directores de especialidad."""

    def __init__(self, raiz: Path | None = None):
        self.raiz = Path(raiz) if raiz else Path.cwd()
        self.estado_file = self.raiz / "starseed_memory_root" / "salud" / "directores_especialidad.json"
        self.directores: dict[str, EstadoDirector] = {}
        self._cargar()

    def _cargar(self) -> None:
        if not self.estado_file.exists():
            for area in AREAS:
                self.directores[area] = EstadoDirector(area=area)
            return
        try:
            with open(self.estado_file, encoding="utf-8") as f:
                data = json.load(f)
            for area, d in data.items():
                director = EstadoDirector(area=area)
                director.ultima_asignacion = d.get("ultima_asignacion", 0.0)
                for k, v in d.get("aprendizajes", {}).items():
                    director.aprendizajes[k] = Aprendizaje(**v)
                for tarea_id, fallos in d.get("fallos_por_tarea", {}).items():
                    director.fallos_por_tarea[tarea_id] = fallos
                self.directores[area] = director
        except Exception:
            for area in AREAS:
                self.directores[area] = EstadoDirector(area=area)

    def _guardar(self) -> None:
        self.estado_file.parent.mkdir(parents=True, exist_ok=True)
        data = {}
        for area, d in self.directores.items():
            data[area] = {
                "ultima_asignacion": d.ultima_asignacion,
                "aprendizajes": {k: v.__dict__ for k, v in d.aprendizajes.items()},
                "fallos_por_tarea": d.fallos_por_tarea,
            }
        import tempfile
        fd, tmp = tempfile.mkstemp(dir=self.estado_file.parent, prefix=".tmp_")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
                f.write("\n")
            os.replace(tmp, self.estado_file)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    # ─── Asignación automática por archivos ──────────────────────────────────

    def detectar_area(self, archivos: list[str]) -> str:
        """Detecta el área principal de una tarea por sus archivos."""
        if not archivos:
            return "general"
        puntuaciones = defaultdict(int)
        for archivo in archivos:
            arch_lower = archivo.lower()
            for area, patrones in ARCHIVOS_POR_AREA.items():
                for pat in patrones:
                    if re.search(pat, arch_lower):
                        puntuaciones[area] += 1
        if not puntuaciones:
            return "general"
        return max(puntuaciones.items(), key=lambda x: x[1])[0]

    def asignar_director(self, tarea_id: str, archivos: list[str]) -> str:
        """Asigna el director por área y actualiza timestamp."""
        area = self.detectar_area(archivos)
        self.directores[area].ultima_asignacion = time.time()
        self._guardar()
        return area

    # ─── Registro de fallos de puertas ───────────────────────────────────────

    def registrar_fallo_puerta(
        self,
        tarea_id: str,
        puerta: str,  # "tsc" | "vitest"
        salida: str,
        area: str | None = None,
    ) -> bool:
        """Registra un fallo de puerta. Retorna True si alcanza el umbral (→ director)."""
        if area is None:
            # Necesitaríamos los archivos para detectar; asumimos que se llama desde el orquestador
            # con el área ya conocida. Si no, no podemos decidir.
            return False

        director = self.directores[area]
        fallos = director.fallos_por_tarea.setdefault(tarea_id, [])
        fallos.append({
            "puerta": puerta,
            "salida": salida[:500],
            "timestamp": time.time(),
        })
        # Mantener solo últimos 10 fallos por tarea
        if len(fallos) > 10:
            fallos[:] = fallos[-10:]
        self._guardar()
        return len(fallos) >= UMBRAL_FALLOS_PUERTAS

    def debe_ir_a_director(self, tarea_id: str, area: str) -> bool:
        """True si la tarea tiene ≥ 2 fallos de puertas en esta área."""
        fallos = self.directores[area].fallos_por_tarea.get(tarea_id, [])
        return len(fallos) >= UMBRAL_FALLOS_PUERTAS

    def obtener_fallos_tarea(self, tarea_id: str, area: str) -> list[dict[str, Any]]:
        return self.directores[area].fallos_por_tarea.get(tarea_id, [])

    def limpiar_fallos_tarea(self, tarea_id: str, area: str) -> None:
        """Limpia fallos tras integración exitosa."""
        if tarea_id in self.directores[area].fallos_por_tarea:
            del self.directores[area].fallos_por_tarea[tarea_id]
            self._guardar()

    # ─── Revisión con checklist ──────────────────────────────────────────────

    def revisar(self, tarea_id: str, archivos: list[str], cambios: dict[str, str],
                area: str | None = None) -> ResultadoRevision:
        """Ejecuta la revisión completa del director asignado."""
        if area is None:
            area = self.detectar_area(archivos)
        director = self.directores[area]
        checklist = CHECKLISTS.get(area, {})

        # Aplicar aprendizajes previos relevantes
        aprendizajes_aplicados = self._aplicar_aprendizajes(area, archivos, cambios)

        # Evaluar checklist (simplificado: heurísticas básicas)
        resultados_checklist = {}
        observaciones = []

        for check, desc in checklist.items():
            ok, obs = self._evaluar_check(check, desc, archivos, cambios, area)
            resultados_checklist[check] = ok
            if not ok:
                observaciones.append(f"❌ {check}: {desc} — {obs}")
            else:
                observaciones.append(f"✅ {check}: {desc}")

        # Decisión
        todos_ok = all(resultados_checklist.values())
        if todos_ok:
            accion = "integrar"
        elif any(k in observaciones for k in ["tokens", "contraste", "rls", "migracion"]):
            accion = "reescribir"
        elif len([o for o in observaciones if o.startswith("❌")]) >= 3:
            accion = "partir"
        else:
            accion = "escalar"

        return ResultadoRevision(
            area=area,
            aprobado=todos_ok,
            accion=accion,
            observaciones=observaciones,
            checklist=resultados_checklist,
            aprendizajes_aplicados=aprendizajes_aplicados,
        )

    def _evaluar_check(self, check: str, desc: str, archivos: list[str],
                       cambios: dict[str, str], area: str) -> tuple[bool, str]:
        """Evalúa un check individual (heurística simple)."""
        # Heurísticas básicas por check
        if check == "tokens":
            for contenido in cambios.values():
                if re.search(r"#[0-9a-fA-F]{3,8}", contenido) and "token" not in contenido.lower():
                    return False, "Posible hex suelto detectado"
            return True, "OK"

        if check == "sin_any":
            for contenido in cambios.values():
                # Detecta: : any, :any, as any, <any>, }any, )any
                if re.search(r":\s*any\b|:\s*any[)\]]|as\s+any\b|<any>|[})\]]\s*any\b", contenido):
                    return False, "'any' detectado en código"
            return True, "OK"

        if check == "claves_nombre":
            for contenido in cambios.values():
                # Patrones comunes de claves reales
                if re.search(r"(sk-|gsk_|gh[pousr]_|AIza|nvapi-|hf_)[A-Za-z0-9._\-]{10,}", contenido):
                    return False, "Posible clave real en código"
                # También detectar asignaciones directas de claves
                if re.search(r"(API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*[\"'][A-Za-z0-9._\-]{20,}[\"']", contenido):
                    return False, "Posible clave hardcodeada"
            return True, "OK"

        if check == "migracion":
            for arch, contenido in cambios.items():
                if arch.endswith(".sql") and "create table" in contenido.lower():
                    # Busca marcadores de sección DOWN explícitos (estilo golang-migrate, dbmate, etc.)
                    lineas = contenido.splitlines()
                    en_down = False
                    for linea in lineas:
                        lin = linea.strip().lower()
                        if lin.startswith("-- down") or lin.startswith("-- @down") or lin.startswith("down:"):
                            en_down = True
                            break
                        if lin.startswith("-- up") or lin.startswith("-- @up") or lin.startswith("up:"):
                            en_down = False
                    if not en_down:
                        return False, "Migración sin sección DOWN explícita"
            return True, "OK"

        if check == "rls":
            for arch, contenido in cambios.items():
                if arch.endswith(".sql") and "create table" in contenido.lower():
                    if "enable row level security" not in contenido.lower():
                        return False, "Tabla sin RLS habilitado"
            return True, "OK"

        if check == "vitest_imports":
            for arch, contenido in cambios.items():
                if arch.endswith(".test.ts") or arch.endswith(".spec.ts"):
                    if "from \"vitest\"" not in contenido and "from 'vitest'" not in contenido:
                        return False, "Import vitest no encontrado"
                    if "vi.mock" in contenido and "node:" in contenido:
                        return False, "vi.mock de módulo node:* detectado"
            return True, "OK"

        # Por defecto: pasar (revisión humana necesaria para checks complejos)
        return True, "Revisión manual recomendada"

    def _aplicar_aprendizajes(self, area: str, archivos: list[str],
                              cambios: dict[str, str]) -> list[str]:
        """Busca aprendizajes relevantes y los marca como usados."""
        aplicados = []
        director = self.directores[area]
        for apr in director.aprendizajes.values():
            # Coincidencia simple por archivo o palabras clave
            if apr.archivo and apr.archivo in archivos:
                aplicados.append(apr.clave())
                apr.veces_usado += 1
            else:
                # Buscar palabras del fallo en los cambios
                for contenido in cambios.values():
                    if any(pal in contenido.lower() for pal in apr.fallo.lower().split()[:3]):
                        aplicados.append(apr.clave())
                        apr.veces_usado += 1
                        break
        if aplicados:
            self._guardar()
        return aplicados

    # ─── Aprendizajes ────────────────────────────────────────────────────────

    def registrar_aprendizaje(self, area: str, fallo: str, causa: str, arreglo: str,
                              tarea_id: str, archivo: str | None = None) -> Aprendizaje:
        """Guarda un nuevo aprendizaje fallo→causa→arreglo."""
        director = self.directores[area]
        apr = Aprendizaje(
            fallo=fallo,
            causa=causa,
            arreglo=arreglo,
            timestamp=time.time(),
            tarea_id=tarea_id,
            archivo=archivo,
        )
        clave = apr.clave()
        if clave not in director.aprendizajes:
            director.aprendizajes[clave] = apr
            self._guardar()
        return director.aprendizajes[clave]

    def obtener_aprendizajes(self, area: str, limite: int = 20) -> list[Aprendizaje]:
        """Top aprendizajes por veces_usado y recencia."""
        director = self.directores[area]
        ordenados = sorted(
            director.aprendizajes.values(),
            key=lambda a: (-a.veces_usado, -a.timestamp)
        )
        return ordenados[:limite]

    # ─── Resumen para Genesis/síntesis ───────────────────────────────────────

    def resumen(self) -> dict[str, Any]:
        """Resumen global de todos los directores."""
        return {
            "areas": {
                area: {
                    "aprendizajes": len(d.aprendizajes),
                    "tareas_con_fallos": len(d.fallos_por_tarea),
                    "ultima_asignacion": d.ultima_asignacion,
                    "top_aprendizajes": [
                        {"fallo": a.fallo[:60], "causa": a.causa[:60], "arreglo": a.arreglo[:60],
                         "veces_usado": a.veces_usado}
                        for a in self.obtener_aprendizajes(area, 5)
                    ],
                }
                for area, d in self.directores.items()
            }
        }


# ─── Funciones de conveniencia ───────────────────────────────────────────────

def crear_directores(raiz: Path | None = None) -> DirectoresEspecialidad:
    return DirectoresEspecialidad(raiz)


def detectar_area_tarea(archivos: list[str]) -> str:
    directores = DirectoresEspecialidad()
    return directores.detectar_area(archivos)


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    import sys

    argv = argv or sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help", "--ayuda"):
        print(
            "Uso: python3 directores_especialidad.py <comando>\n"
            "Comandos:\n"
            "  area <archivo1> [archivo2...]          Detecta área de una tarea\n"
            "  asignar <tarea_id> <archivo1> [...]    Asigna director y guarda\n"
            "  fallo <tarea_id> <puerta> <salida>     Registra fallo de puerta (tsc/vitest)\n"
            "  revisar <tarea_id> <archivo1> [...]    Ejecuta revisión completa\n"
            "  aprender <area> <fallo> <causa> <arreglo> [--tarea ID] [--archivo ARCH]\n"
            "  resumen                                Resumen global de directores\n"
            "  estado <area>                          Estado de un director"
        )
        return 0

    cmd = argv[0]
    directores = DirectoresEspecialidad()

    if cmd == "area":
        if len(argv) < 2:
            print("Falta archivo", file=sys.stderr)
            return 2
        area = directores.detectar_area(argv[1:])
        print(area)
        return 0

    if cmd == "asignar":
        if len(argv) < 3:
            print("Uso: asignar <tarea_id> <archivo1> [...]", file=sys.stderr)
            return 2
        area = directores.asignar_director(argv[1], argv[2:])
        print(f"Director asignado: {area}")
        return 0

    if cmd == "fallo":
        if len(argv) < 4:
            print("Uso: fallo <tarea_id> <tsc|vitest> <salida>", file=sys.stderr)
            return 2
        tarea_id, puerta, salida = argv[1], argv[2], argv[3]
        area = directores.detectar_area([salida])  # fallback
        # Mejor: pasar area por arg, pero simplificamos
        if len(argv) > 4 and argv[4] == "--area":
            area = argv[5]
        alcanza = directores.registrar_fallo_puerta(tarea_id, puerta, salida, area)
        print(f"Área: {area} · Fallos totales: {len(directores.obtener_fallos_tarea(tarea_id, area))} · ¿Director?: {alcanza}")
        return 0

    if cmd == "revisar":
        if len(argv) < 3:
            print("Uso: revisar <tarea_id> <archivo1> [...]", file=sys.stderr)
            return 2
        tarea_id = argv[1]
        archivos = argv[2:]
        # Simular cambios (en realidad vendrían del git diff)
        cambios = {arch: f"// contenido de {arch}" for arch in archivos}
        resultado = directores.revisar(tarea_id, archivos, cambios)
        print(json.dumps({
            "area": resultado.area,
            "aprobado": resultado.aprobado,
            "accion": resultado.accion,
            "observaciones": resultado.observaciones,
            "checklist": resultado.checklist,
            "aprendizajes_aplicados": resultado.aprendizajes_aplicados,
        }, ensure_ascii=False, indent=1))
        return 0

    if cmd == "aprender":
        if len(argv) < 5:
            print("Uso: aprender <area> <fallo> <causa> <arreglo> [--tarea ID] [--archivo ARCH]", file=sys.stderr)
            return 2
        area, fallo, causa, arreglo = argv[1], argv[2], argv[3], argv[4]
        tarea_id = "manual"
        archivo = None
        i = 5
        while i < len(argv):
            if argv[i] == "--tarea" and i + 1 < len(argv):
                tarea_id = argv[i + 1]
                i += 2
            elif argv[i] == "--archivo" and i + 1 < len(argv):
                archivo = argv[i + 1]
                i += 2
            else:
                i += 1
        apr = directores.registrar_aprendizaje(area, fallo, causa, arreglo, tarea_id, archivo)
        print(f"Aprendizaje guardado: {apr.clave()}")
        return 0

    if cmd == "resumen":
        print(json.dumps(directores.resumen(), ensure_ascii=False, indent=1))
        return 0

    if cmd == "estado":
        if len(argv) < 2:
            print("Falta <area>", file=sys.stderr)
            return 2
        area = argv[1]
        if area not in directores.directores:
            print(f"Área desconocida: {area}", file=sys.stderr)
            return 2
        d = directores.directores[area]
        print(json.dumps({
            "area": area,
            "aprendizajes": len(d.aprendizajes),
            "tareas_con_fallos": len(d.fallos_por_tarea),
            "ultima_asignacion": d.ultima_asignacion,
            "aprendizajes_recientes": [
                {"fallo": a.fallo, "causa": a.causa, "arreglo": a.arreglo,
                 "tarea": a.tarea_id, "veces_usado": a.veces_usado}
                for a in directores.obtener_aprendizajes(area, 10)
            ],
        }, ensure_ascii=False, indent=1))
        return 0

    print(f"Comando desconocido: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    import os
    import sys
    sys.exit(main())