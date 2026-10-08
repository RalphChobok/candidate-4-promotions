// "Who is using the till" for the demo. There's no authentication; the staff
// list comes from the API and the chosen staff member is sent as staff_id when
// overriding a price, so the backend enforces the override_price permission.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Staff } from '../types';
import { listStaff } from '../services/promotions';

interface UserContextValue {
  user: Staff | null;
  users: Staff[];
  setUserId: (id: string) => void;
  can: (permission: string) => boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<Staff[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    listStaff().then((list) => {
      setUsers(list);
      // Start as the most senior staff member so every action is available.
      const manager = list.find((s) => s.permissions.includes('override_price')) ?? list[0];
      setUserId((current) => current ?? manager?.staff_id ?? null);
    }, () => setUsers([]));
  }, []);

  const user = users.find((u) => u.staff_id === userId) ?? null;
  const value: UserContextValue = {
    user,
    users,
    setUserId,
    can: (permission) => !!user?.permissions.includes(permission),
  };
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useCurrentUser must be used inside UserProvider');
  return ctx;
}
