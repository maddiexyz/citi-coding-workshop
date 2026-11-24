"""
Shared backend code for all Python services.

This folder is not deployed on its own (the "_" prefix hides it from
Terraform). bin/sync-common.sh copies it into each service as ``common/``
so every Lambda package contains it and services can ``import common.x``.
Edit the files here, never the copies.
"""
