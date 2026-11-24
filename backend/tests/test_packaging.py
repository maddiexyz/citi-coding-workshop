"""
Each Lambda ships only its own folder plus the pip packages in its
requirements.txt. This catches a service that imports a library (directly or
through common/) that its requirements don't install, which tests alone
wouldn't notice because the test environment has every package.
"""

import ast
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
COMMON = BACKEND / "_common"
# Import name -> pip package name
PACKAGES = {"bcrypt": "bcrypt", "jwt": "pyjwt", "psycopg": "psycopg"}
SERVICES = sorted(p.parent.name for p in BACKEND.glob("*/requirements.txt") if not p.parent.name.startswith("_"))


def imports(path: Path) -> tuple[set[str], set[str]]:
    """(top-level third-party modules, common/ submodules) imported by a file."""
    third_party, common = set(), set()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            third_party.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level:   # relative import inside common/
                if module:
                    common.add(module.split(".")[0])
                else:
                    common.update(alias.name for alias in node.names)
            elif module == "common":
                common.update(alias.name for alias in node.names)
            elif module.startswith("common."):
                common.add(module.split(".")[1])
            else:
                third_party.add(module.split(".")[0])
    return third_party, common


def needed_packages(entry: Path) -> set[str]:
    """Pip packages needed by a file and every common/ module it reaches."""
    needed, seen, todo = set(), set(), [entry]
    while todo:
        third_party, common = imports(todo.pop())
        needed.update(PACKAGES[name] for name in third_party if name in PACKAGES)
        for name in common - seen:
            seen.add(name)
            todo.append(COMMON / f"{name}.py")
    return needed


def requirements(service: str) -> set[str]:
    lines = (BACKEND / service / "requirements.txt").read_text().splitlines()
    return {line.split("==")[0].split("[")[0].strip().lower() for line in lines if line.strip()}


@pytest.mark.parametrize("service", SERVICES)
def test_requirements_cover_imports(service):
    missing = needed_packages(BACKEND / service / "function.py") - requirements(service)
    assert not missing, f"{service}/requirements.txt is missing {sorted(missing)}"
