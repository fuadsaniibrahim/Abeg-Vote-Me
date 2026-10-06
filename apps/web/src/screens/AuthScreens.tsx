import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card, TextField } from '../components/ui';
import { useAuth } from '../store/auth';

function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
}

export function RegisterScreen() {
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acceptTerms) {
      setError('Please confirm you are 18+ and accept the terms.');
      return;
    }
    setBusy(true);
    try {
      await register(email, password, acceptTerms);
      navigate('/home');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Card className="mx-auto mt-6 max-w-md">
        <h1 className="mb-1 text-2xl font-bold">Create your account</h1>
        <p className="mb-5 text-sm opacity-75">One account per person. We go send you a link to confirm your email.</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-naija-600" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span>I am 18 or older and I accept the terms: no real persons or parties, no hate speech, no graphic or sexual content.</span>
          </label>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-sm">
          Already get account?{' '}
          <Link className="font-semibold text-naija-600 underline" to="/login">
            Log in
          </Link>
        </p>
      </Card>
    </Page>
  );
}

export function LoginScreen() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/home');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Card className="mx-auto mt-6 max-w-md">
        <h1 className="mb-5 text-2xl font-bold">Welcome back</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-4 text-sm">
          New here?{' '}
          <Link className="font-semibold text-naija-600 underline" to="/register">
            Create account
          </Link>
        </p>
      </Card>
    </Page>
  );
}
