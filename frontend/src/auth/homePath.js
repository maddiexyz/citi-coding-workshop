/**
 * Where a user lands after signing in (unless they were on their way to a
 * page): admins get the portfolio dashboard, everyone else their own work.
 * @param {{role: string}|null} user
 * @returns {string}
 */
export default function homePath(user) {
  return user?.role === 'admin' ? '/dashboard' : '/my-work';
}
