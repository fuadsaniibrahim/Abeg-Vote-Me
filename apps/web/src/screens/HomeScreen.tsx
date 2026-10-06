import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

/** Old landing page for signed-in users; the game no longer needs a confirmed email, so it just sends you on. */
export function HomeScreen() {
  const { user, status } = useAuth();
  if (status !== 'ready') return <p role="status">Loading…</p>;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}
