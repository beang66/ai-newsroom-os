"""Make project-local Python packages available to direct development commands."""
from pathlib import Path
import sys


def add_project_runtime():
    if getattr(sys, 'frozen', False):
        return
    runtime = Path(__file__).resolve().parent.parent / '.runtime'
    value = str(runtime)
    if runtime.is_dir() and value not in sys.path:
        sys.path.insert(0, value)
