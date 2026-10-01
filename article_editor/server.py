"""Entry point for the local app core.

Kept as the launcher target (start_windows.bat / launcher.py).
All implementation lives in the ``core`` package (frontend/core separation).
"""
from core.bootstrap import main

if __name__ == '__main__':
    main()