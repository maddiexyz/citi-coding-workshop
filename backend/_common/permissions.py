"""
Role-based permission rules, kept in one place so every service agrees.

Projects:
- admin: everything
- project_manager: create projects; edit or delete only projects they own
  (including setting the project's team lead)
- team_lead, viewer: read-only

Deliverables and their dependencies (everyone may read):
- admin and the owning project manager: create, edit, delete
- the project's assigned team lead (projects.team_lead_id): create and edit
  deliverables and manage dependencies, but not delete deliverables

Resources (people and their weekly capacity; everyone may read):
- admin only: create, edit, delete

Allocations of resource hours to a project (everyone may read):
- admin and the owning project manager: create, edit, delete

Budgets (everyone may read a project's budget summary):
- admin and the owning project manager: see spend entries, add and edit them,
  and set the planned budget
- admin only: delete spend entries, and delete a project that has any
  (the owning PM should set its status to cancelled instead)

Audit log: admin sees everything; the owning PM sees their projects' history.
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


def owns_project(user: Any, project: dict) -> bool:
    """Return True if the user is admin or the project manager who owns the project."""
    return can_change_project(user, project)


def is_assigned_team_lead(user: Any, project: dict) -> bool:
    """Return True if the user is the team lead assigned to the project."""
    return user.role == TEAM_LEAD and project.get("team_lead_id") == user.id


def can_edit_deliverables(user: Any, project: dict) -> bool:
    """Return True if the user may create/edit deliverables and dependencies in the project."""
    return owns_project(user, project) or is_assigned_team_lead(user, project)


def can_delete_deliverables(user: Any, project: dict) -> bool:
    """Return True if the user may delete deliverables in the project (not the team lead)."""
    return owns_project(user, project)


def can_manage_resources(user: Any) -> bool:
    """Return True if the user may create, edit or delete resources (admin only)."""
    return user.role == ADMIN


def can_manage_allocations(user: Any, project: dict) -> bool:
    """Return True if the user may create, edit or delete allocations on the project."""
    return owns_project(user, project)


def can_delete_project(user: Any, project: dict, has_budget_entries: bool) -> bool:
    """Return True if the user may delete the project (admin only once it has spend entries)."""
    if user.role == ADMIN:
        return True
    return can_change_project(user, project) and not has_budget_entries


def can_manage_budget(user: Any, project: dict) -> bool:
    """Return True if the user may see and change a project's spend entries and planned budget."""
    return owns_project(user, project)


def can_delete_budget_entries(user: Any) -> bool:
    """Return True if the user may delete spend entries (admin only)."""
    return user.role == ADMIN


def can_read_project_audit(user: Any, project: dict) -> bool:
    """Return True if the user may read a project's change history."""
    return owns_project(user, project)


def can_manage_departments(user: Any) -> bool:
    """Return True if the user may create, rename or delete departments (admin only)."""
    return user.role == ADMIN
