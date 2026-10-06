import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, authApi } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card } from '../components/ui';
import { useAuth } from '../store/auth';

/** Signed-in landing page for unverified accounts. Verified players go straight into the game. */
export function HomeScreen() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  if (status !== 'ready') return <p role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to="/dashboard" replace />;

  async function resend() {
    try {
      await authApi.resendVerification();
      setNotice({ kind: 'success', text: 'New confirmation link sent. Check your email.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Could not resend.' });
    }
  }

  return (
    <Page>
      <Card className="mt-6 flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Welcome, citizen</h1>
        <p className="opacity-80">
          Signed in as <strong>{user.email}</strong>
        </p>
        {!user.emailVerified && (
          <Alert kind="info">
            Confirm your email to unlock the game.{' '}
            <button type="button" className="font-semibold underline" onClick={resend}>
              Resend link
            </button>
          </Alert>
        )}
        {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
        <p className="text-sm opacity-70">Once your email is confirmed you can create your character.</p>
        <Button
          variant="ghost"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          Log out
        </Button>
      </Card>
    </Page>
  );
}
