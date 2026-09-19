#!/bin/bash
cd /Users/alex/Documents/starseed-os-main || exit 1
python3 scripts/puente/salud_mando.py 2>/dev/null || curl -s -m 10 -o /dev/null -w "mando http=%{http_code}\n" http://localhost:9002/mando
