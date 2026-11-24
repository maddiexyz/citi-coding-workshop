"""
Role-based permission rules, kept in one place so every service agrees.

Increment 1 rules for projects:
- admin: everything
- project_manager: create projects; edit or delete only projects they own
- team_lead, viewer: read-only
"""

from typing import Any

ADMIN = "admin"
PROJECT_MANAGER = "project_manager"
TEAM_LEAD = "team_lead"
VIEWER = "viewer"
ROLES = (ADMIN, PROJECT_MANAGER, TEAM_LEAD, VIEWER)


def can_create_project(user: Any) -> bool:
    """Return True if the user may create projects."""
    return user.role in (ADMIN, PROJECT_MANAGER)


def can_change_project(user: Any, project: dict) -> bool:
    """
    Return True if the user may edit or delete this project.

    Args:
        user: The current user (needs ``id`` and ``role``).
        project: The project row (needs ``owner_id``).
    """
    if user.role == ADMIN:
        return True
    return user.role == PROJECT_MANAGER and project["owner_id"] == user.id
