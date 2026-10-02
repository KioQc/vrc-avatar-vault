import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { desktop, mockMode } from '../../db/bridge';
import { useState } from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';
import { useUI } from '../../stores/ui';
import { vrchat } from '../../api/VRChatApiClient';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
import { AvatarImage, Badge } from '../../components/common';
import type { User } from '../../types/domain';
export function AccountPanel() {
  const client = useQueryClient();
  const profiles = useQuery({
    queryKey: ['account-profiles'],
    queryFn: () =>
      invoke<{ active: string; profiles: { id: string; name: string; userId: string | null }[] }>(
        'account_control',
        { operation: 'list' },
      ),
    enabled: desktop && !mockMode,
  });
  const changeAccount = useAction(async (id: string) => {
    await invoke('account_control', {
      operation: id === 'new' ? 'add' : 'switch',
      id: id === 'new' ? null : id,
    });
    vrchat.clearCache();
    setUser(null);
    setChallenge([]);
    await client.invalidateQueries();
    try {
      accept(await vrchat.verifySession());
    } catch {
      /* New profile needs its own login. */
    }
  });
  const user = useUI((s) => s.user),
    setUser = useUI((s) => s.setUser);
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [challenge, setChallenge] = useState<string[]>([]),
    [method, setMethod] = useState('totp');
  function accept(result: User) {
    if (result.requiresTwoFactorAuth?.length) {
      setChallenge(result.requiresTwoFactorAuth);
      setMethod(
        result.requiresTwoFactorAuth.includes('totp')
          ? 'totp'
          : result.requiresTwoFactorAuth[0].toLowerCase(),
      );
    } else if (result.id) {
      setUser(result);
      setChallenge([]);
    } else throw new Error('VRChat returned an unrecognized authentication response');
  }
  const login = useAction(async () => {
    try {
      accept(await vrchat.login(username, password));
    } finally {
      setPassword('');
    }
  });
  const verify = useAction(async () => {
    try {
      accept(await vrchat.verify2FA(method, code));
    } finally {
      setCode('');
    }
  });
  const logout = useAction(async () => {
    try {
      await vrchat.logout();
    } finally {
      setUser(null);
      setChallenge([]);
    }
  }, 'Local session cleared');
  const session = useAction(async () => accept(await vrchat.verifySession()), 'Session verified');
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>VRChat account</h2>
          <p>
            VRChat metadata and optional release-name sync. Credentials stay in the native client.
          </p>
        </div>
        <ShieldCheck size={21} className="accent" />
      </div>
      {profiles.data && (
        <div className="row wrap">
          <label>
            Account profile
            <select
              value={profiles.data.active}
              disabled={changeAccount.isPending}
              onChange={(e) => changeAccount.mutate(e.target.value)}
            >
              {profiles.data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.userId ? ` · ${p.userId}` : ' · Not connected'}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={changeAccount.isPending} onClick={() => changeAccount.mutate('new')}>
            Add separate account
          </Button>
          <p className="tiny muted">
            Each profile has its own secure cookie storage. Switching never reuses another profile's
            session.
          </p>
        </div>
      )}
      {user?.id ? (
        <div className="account-info">
          <AvatarImage src={user.imageUrl} name={user.displayName ?? 'Account'} />
          <div className="grow">
            <h3>Connected as {user.displayName}</h3>
            <p className="tiny muted">{user.id}</p>
            <Badge tone="green">Session active</Badge>
          </div>
          <Button disabled={session.isPending} onClick={() => session.mutate()}>
            Verify session
          </Button>
          <Button disabled={logout.isPending} onClick={() => logout.mutate()}>
            <LogOut size={14} />
            Logout / reconnect
          </Button>
        </div>
      ) : challenge.length ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify.mutate();
          }}
        >
          <p className="notice">VRChat requires a second authentication factor.</p>
          <div className="form-grid">
            <label>
              Method
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {challenge.includes('totp') && <option value="totp">Authenticator (TOTP)</option>}
                {challenge.some((c) => c.toLowerCase() === 'emailotp') && (
                  <option value="emailotp">Email OTP</option>
                )}
                <option value="otp">Recovery code</option>
              </select>
            </label>
            <label>
              Verification code
              <input
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="row">
            <Button variant="default" disabled={verify.isPending || !code.trim()}>
              Verify 2FA
            </Button>
            <Button type="button" onClick={() => setChallenge([])}>
              Back to login
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <div className="form-grid">
            <label>
              Username / email
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </div>
          <Button variant="default" disabled={login.isPending || !username || !password}>
            {login.isPending ? 'Connecting…' : 'Connect VRChat'}
          </Button>
          <p className="tiny muted">
            Passwords are never stored. Session cookies use the operating system credential store.
          </p>
        </form>
      )}
    </section>
  );
}
