#!/bin/zsh
# Retirar un aparato emparejado (GEN1114B, contrato §3.7): por ejemplo, un móvil perdido.
# Doble clic: abre Terminal, enseña los aparatos activos y pide cuál retirar y su código para confirmar.
# Retirar no pide contraseña: solo quita poder.
RAIZ_POR_DEFECTO="/Users/alex/Documents/starseed-os-main"
AQUI="${0:A:h}"
if [[ -f "$AQUI/genesis_aparatos.py" ]]; then
  RAIZ="${AQUI:h:h}"
else
  RAIZ="$RAIZ_POR_DEFECTO"
fi
PY=/opt/homebrew/bin/python3
[[ -x "$PY" ]] || PY=python3
cd "$RAIZ" && "$PY" scripts/puente/genesis_aparatos.py revocar
echo
read -r "?Pulsa Intro para cerrar esta ventana. "
