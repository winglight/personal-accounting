import React, { createContext, useContext, useState } from 'react';
import { authClient } from '../lib/auth-client';

interface AuthContextValue {
  user: { id: string; email: string; name: string } | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const session = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const run = async (request: Promise<{ error?: { message?: string } | null }>) => {
    setError(null);
    const result = await request;
    if (result.error) {
      setError(result.error.message || '操作失败，请稍后重试');
      return false;
    }
    await session.refetch();
    return true;
  };
  const value: AuthContextValue = {
    user: session.data?.user ? { id: session.data.user.id, email: session.data.user.email, name: session.data.user.name } : null,
    loading: session.isPending,
    error,
    signIn: (email, password) => run(authClient.signIn.email({ email, password })),
    signUp: (name, email, password) => run(authClient.signUp.email({ name, email, password })),
    signOut: async () => { await authClient.signOut(); await session.refetch(); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
};
