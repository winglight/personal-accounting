import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthPage } from '../src/pages/AuthPage';
import { Modal } from '../src/components/ui/Modal';
const auth = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn(), error: null }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => auth }));
beforeEach(() => { auth.signIn.mockReset().mockResolvedValue(true); auth.signUp.mockReset().mockResolvedValue(true); });
it('sign-in uses the same auth callback and keeps entered fields through theme changes', async () => {
  render(<AuthPage />); fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'test@example.invalid' } }); fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-only-password' } });
  fireEvent.change(screen.getByLabelText('外观主题'), { target: { value: 'graphite' } }); expect((screen.getByLabelText('邮箱') as HTMLInputElement).value).toBe('test@example.invalid');
  fireEvent.click(screen.getAllByRole('button', { name: '登录' })[1]); await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith('test@example.invalid', 'test-only-password')); expect(auth.signUp).not.toHaveBeenCalled();
});
it('sign-up retains nickname/email/password and original auth contract', async () => {
  render(<AuthPage />); fireEvent.click(screen.getByRole('button', { name: '注册' })); fireEvent.change(screen.getByLabelText('昵称'), { target: { value: 'Demo' } }); fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'test@example.invalid' } }); fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-only-password' } }); fireEvent.click(screen.getByRole('button', { name: '创建账号' })); await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith('Demo', 'test@example.invalid', 'test-only-password'));
});
it('modal closes by Escape without a business mutation and restores opener focus', () => {
  const close = vi.fn(); const { rerender } = render(<><button>Open</button><Modal isOpen={false} onClose={close} title="Edit"><input aria-label="Draft" /></Modal></>); const opener = screen.getByRole('button', { name: 'Open' }); opener.focus();
  rerender(<><button>Open</button><Modal isOpen onClose={close} title="Edit"><input aria-label="Draft" /></Modal></>);
  expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true'); fireEvent.keyDown(document, { key: 'Escape' }); expect(close).toHaveBeenCalledTimes(1);
  rerender(<><button>Open</button><Modal isOpen={false} onClose={close} title="Edit"><input aria-label="Draft" /></Modal></>); expect(document.activeElement).toBe(opener);
});
