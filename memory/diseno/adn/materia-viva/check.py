#!/usr/bin/env python3
import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../../../scripts/puente'))
from adn_comprobar import main
if __name__ == '__main__':
    main(os.path.dirname(__file__))
