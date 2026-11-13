import React, { useEffect, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { UserProfile, UserRole } from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { RoleBadge } from '../../components/common/StatusBadge';

export const UsersAdminPage: React.FC = () => {
  const { user: currentUser, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await api.users.list();
      setUsers(res.users);
    } catch (err: any) {
      showToast('error', 'Failed to load user directory', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    try {
      setUpdatingUid(uid);
      const res = await api.users.updateRole(uid, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.uid === uid ? res.user : u)));
      if (uid === currentUser?.uid) {
        await refreshUser();
      }
      showToast(
        'success',
        'Role Updated in Firestore',
        `Assigned ${res.user.role} to ${res.user.name}. Logged in audit trail.`
      );
    } catch (err: any) {
      showToast('error', 'Role update failed', err.message);
    } finally {
      setUpdatingUid(null);
    }
  };

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-700" />
            <h1 className="text-2xl font-bold text-slate-900">
              User Directory & RBAC Access Control
            </h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Manage platform roles (`ADMIN`, `TEAM_LEADER`, `DEPARTING_MEMBER`, `SUCCESSOR`). All role transitions are enforced server-side and recorded in immutable audit logs.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-xs font-semibold">
          <ShieldCheck className="w-4 h-4" />
          {users.length} Registered Accounts
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-6">User & Email</th>
                <th className="py-3.5 px-4">Department & Title</th>
                <th className="py-3.5 px-4">Current Role</th>
                <th className="py-3.5 px-4">Provisioned Date</th>
                <th className="py-3.5 px-6 text-right">Modify Role (Admin Only)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50">
                  <td className="py-4 px-6">
                    <p className="font-semibold text-slate-900">{u.name}</p>
                    <p className="text-xs font-mono text-slate-500">{u.email}</p>
                    <p className="text-[10px] font-mono text-slate-400">
                      UID: {u.uid}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">
                      {u.department || 'Engineering'}
                    </p>
                    <p>{u.title || 'Member'}</p>
                  </td>
                  <td className="py-4 px-4">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="py-4 px-4 text-xs font-mono text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <select
                      value={u.role}
                      disabled={updatingUid === u.uid}
                      onChange={(e) =>
                        handleRoleChange(u.uid, e.target.value as UserRole)
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="TEAM_LEADER">TEAM_LEADER</option>
                      <option value="DEPARTING_MEMBER">DEPARTING_MEMBER</option>
                      <option value="SUCCESSOR">SUCCESSOR</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

