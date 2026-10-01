import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ThemePicker } from '../components/ui/ThemePicker';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';

export const AuthPage: React.FC = () => {
  const { signIn, signUp, error } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } finally { setBusy(false); }
  };
  return (
    <main className="pa-auth"><section className="pa-auth-art"><div className="pa-brand"><span className="pa-brand-icon"><BookOpen size={24} /></span><div><strong>AI随手记</strong><small>PERSONAL ACCOUNTING</small></div></div><h1>生活的每一笔，<br />都值得好好记录</h1><p>用清晰的账本安放日常。手工记录、AI 文本与小票识别，让记账成为轻松的小习惯。</p></section><section className="pa-auth-content"><ThemePicker />
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-3"><span className="pa-brand-icon"><BookOpen size={23} /></span><CardTitle>个人记账</CardTitle></div>
          <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-sm">
            <button type="button" className={`rounded-md py-2 ${mode === 'signin' ? 'bg-white shadow-sm font-medium' : ''}`} onClick={() => setMode('signin')}>登录</button>
            <button type="button" className={`rounded-md py-2 ${mode === 'signup' ? 'bg-white shadow-sm font-medium' : ''}`} onClick={() => setMode('signup')}>注册</button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && <Input label="昵称" required value={name} onChange={e => setName(e.target.value)} autoComplete="name" />}
            <Input label="邮箱" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            <Input label="密码" type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <Button className="w-full" disabled={busy}>{busy ? '请稍候…' : mode === 'signup' ? '创建账号' : '登录'}</Button>
          </form>
        </CardContent>
      </Card>
    </section></main>
  );
};
