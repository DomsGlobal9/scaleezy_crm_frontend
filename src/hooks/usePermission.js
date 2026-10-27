import { useAuth } from '../context/AuthContext';

const WILDCARD = '*';

// usePermission().can('customer:view') -> boolean
// This only decides what the screen shows. The service re-checks every permission on every request.
export function usePermission() {
  const { permissions, roles } = useAuth();
  const can = (permission) => {
    if (!permission) return true;
    // The owner holds '*'. Implications are resolved by the service: the session carries what the
    // grants confer, so a plain includes() is the whole check for everyone else.
    if (permissions.includes(WILDCARD) || roles.includes('SUPER_ADMIN')) return true;
    return permissions.includes(permission);
  };
  return { can, permissions };
}
