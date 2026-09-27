import React, { useCallback, useEffect, useState } from 'react';
import { Database, LogOut, Pencil, Trash2, Upload, UserPlus } from 'lucide-react';
import logo from '../assets/logo.svg';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  transaction_count: number;
  account_count: number;
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body as T;
}

export const AdminPage: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);

  const loadUsers = useCallback(async () => {
    const data = await adminRequest<{ users: AdminUser[] }>('/api/admin/users');
    setUsers(data.users);
  }, []);

  useEffect(() => {
    adminRequest<{ authenticated: boolean; email: string }>('/api/admin/session')
      .then(async session => { setAuthenticated(session.authenticated); setAdminEmail(session.email || ''); if (session.authenticated) await loadUsers(); })
      .catch(() => setAuthenticated(false));
  }, [loadUsers]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { await adminRequest('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: adminEmail, password }) }); setAuthenticated(true); setPassword(''); await loadUsers(); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await adminRequest('/api/admin/users', { method: 'POST', body: JSON.stringify({ name, email, password: newPassword }) });
      setName(''); setEmail(''); setNewPassword(''); setMessage({ text: '用户已创建' }); await loadUsers();
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };

  const editUser = async (user: AdminUser) => {
    const nextName = prompt('姓名', user.name); if (nextName === null) return;
    const nextEmail = prompt('邮箱', user.email); if (nextEmail === null) return;
    try { await adminRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ name: nextName, email: nextEmail }) }); setMessage({ text: '用户资料已更新' }); await loadUsers(); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : String(error) }); }
  };

  const changePassword = async (user: AdminUser) => {
    const value = prompt(`为 ${user.email} 设置新密码（至少 8 位）`); if (!value) return;
    try { await adminRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ password: value }) }); setMessage({ text: '密码已更新，用户现有登录会话已撤销' }); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : String(error) }); }
  };

  const deleteUser = async (user: AdminUser) => {
    if (!confirm(`删除用户 ${user.email} 及其全部账本数据？此操作不可撤销。`)) return;
    try { await adminRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' }); setMessage({ text: '用户及其数据已删除' }); await loadUsers(); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : String(error) }); }
  };

  const importUser = async (user: AdminUser, file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text(); JSON.parse(raw); setBusy(true);
      const result = await adminRequest<{ duplicate: boolean; transactions: number; accounts: number; categories: number }>(`/api/admin/users/${encodeURIComponent(user.id)}/import`, { method: 'POST', body: raw });
      setMessage({ text: result.duplicate ? '该用户已导入过这份文件' : `已为 ${user.email} 导入 ${result.transactions} 条记录、${result.accounts} 个账户、${result.categories} 个分类` });
      await loadUsers();
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };

  if (authenticated === null) return <div className="min-h-screen grid place-items-center text-gray-500">正在检查管理员会话…</div>;
  if (!authenticated) return (
    <main className="min-h-screen bg-gray-50 grid place-items-center p-4">
      <Card className="w-full max-w-md"><CardHeader><div className="flex items-center gap-3"><img src={logo} className="h-11 w-11 rounded-lg" alt="" /><CardTitle>管理员登录</CardTitle></div></CardHeader>
        <CardContent><form className="space-y-4" onSubmit={login}><Input label="管理员账号" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} autoComplete="username" /><Input label="密码" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />{message && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message.text}</div>}<Button className="w-full" disabled={busy}>{busy ? '登录中…' : '登录管理后台'}</Button></form></CardContent>
      </Card>
    </main>
  );

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6"><div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center gap-3"><img src={logo} className="h-10 w-10 rounded-lg" alt="" /><div><h1 className="text-xl font-bold">用户管理</h1><p className="text-xs text-gray-500">{adminEmail}</p></div><Button className="ml-auto" variant="ghost" onClick={async () => { await adminRequest('/api/admin/logout', { method: 'POST' }); setAuthenticated(false); }}><LogOut className="mr-2 h-4 w-4" />退出</Button></header>
      {message && <div className={`rounded-md p-3 text-sm ${message.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{message.text}</div>}
      <Card><CardHeader><CardTitle>新增用户</CardTitle></CardHeader><CardContent><form onSubmit={createUser} className="grid gap-3 md:grid-cols-4"><Input label="姓名" required value={name} onChange={e => setName(e.target.value)} /><Input label="邮箱" type="email" required value={email} onChange={e => setEmail(e.target.value)} /><Input label="初始密码" type="password" minLength={8} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /><Button className="self-end" disabled={busy}><UserPlus className="mr-2 h-4 w-4" />创建</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>用户（{users.length}）</CardTitle></CardHeader><CardContent className="space-y-3">{users.map(user => <div key={user.id} className="rounded-lg border border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="font-medium truncate">{user.name} · {user.email}</div><div className="text-xs text-gray-500 mt-1">{user.transaction_count} 条记录 · {user.account_count} 个账户 · 注册于 {new Date(user.createdAt).toLocaleString()}</div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void editUser(user)}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button><Button size="sm" variant="secondary" onClick={() => void changePassword(user)}>改密码</Button><label className="inline-flex h-8 cursor-pointer items-center rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700"><Upload className="mr-1 h-3.5 w-3.5" />导入 JSON<input type="file" accept="application/json,.json" className="hidden" disabled={busy} onChange={e => { void importUser(user, e.target.files?.[0]); e.target.value = ''; }} /></label><Button size="sm" variant="danger" onClick={() => void deleteUser(user)}><Trash2 className="mr-1 h-3.5 w-3.5" />删除</Button></div></div>)}</CardContent></Card>
      <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800 flex gap-3"><Database className="h-5 w-5 shrink-0" /><span>导入文件会写入所选用户的 D1 关系表；相同内容按 SHA-256 去重。金额在 D1 中以“分”的整数保存。</span></div>
    </div></main>
  );
};
