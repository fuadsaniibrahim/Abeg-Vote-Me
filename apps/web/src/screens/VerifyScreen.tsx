import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, authApi } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Card } from '../components/ui';
import { useAuth } from '../store/auth';

type State = { kind: 'working' } | { kind: 'ok' } | { kind: 'error'; message: string };

export function VerifyScreen() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const setUser = useAuth((s) => s.setUser);
  const currentUser = useAuth((s) => s.user);
  const [state, setState] = useState<State>(token ? { kind: 'working' } : { kind: 'error', message: 'This link is missing its token.' });
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single use, so guard against React StrictMode's double effect.
    if (!token || started.current) return;
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(({ user }) => {
        if (currentUser?.id === user.id) setUser(user);
        setState({ kind: 'ok' });
      })
      .catch((e: unknown) => setState({ kind: 'error', message: e instanceof ApiError ? e.message : 'Verification failed.' }));
  }, [token, currentUser?.id, setUser]);

  return (
    <Page>
      <Card className="mx-auto mt-6 max-w-md">
        <h1 className="mb-4 text-2xl font-bold">Confirm your email</h1>
        {state.kind === 'working' && <p role="status">Checking your link…</p>}
        {state.kind === 'ok' && (
          <Alert kind="success">
            Email confirmed. Your political journey don start!{' '}
            <Link className="font-semibold underline" to={currentUser ? '/home' : '/login'}>
              {currentUser ? 'Continue' : 'Log in'}
            </Link>
          </Alert>
        )}
        {state.kind === 'error' && <Alert>{state.message}</Alert>}
      </Card>
    </Page>
  );
}
