import { useContext, useMemo } from 'react';
import AuthContext from './authContext';

/**
 * Label names that refer to the signed-in user as "Name (you)".
 *
 *   const you = useYou();
 *   you.user(project.owner_id, project.owner_name)          // a user account
 *   you.resource(item.assignee_resource_id, item.assignee_name)  // a person (resource)
 *
 * Users are matched by id; people by the resource linked to the account
 * (user.resource_id from /api/auth/me). Missing names stay missing.
 */
export default function useYou() {
  const user = useContext(AuthContext)?.user ?? null;
  return useMemo(() => {
    const label = (matches, name) => (name && matches ? `${name} (you)` : name);
    return {
      user: (id, name) => label(Boolean(user) && id != null && id === user.id, name),
      resource: (id, name) => label(user?.resource_id != null && id === user.resource_id, name),
    };
  }, [user]);
}
