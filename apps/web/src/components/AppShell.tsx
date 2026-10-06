import { Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { MONTH_NAMES, formatNaira } from '@avm/engine';
import { useAuth } from '../store/auth';
import { useGame } from '../store/game';
import { getSocket } from '../realtime';
import type { Notification } from '../api/client';
import { Avatar } from './Avatar';

const NAV = [
  { to: '/news', label: 'News', icon: '📰' },
  { to: '/dashboard', label: 'Dashboard', icon: '🏛️' },
  { to: '/parties', label: 'Parties', icon: '🎌' },
  { to: '/actions', label: 'Actions', icon: '✊' },
  { to: '/chat', label: 'Chat', icon: '💬' },
  { to: '/finance', label: 'Money', icon: '💰' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export function GameClock() {
  const clock = useGame((s) => s.clock);
  const loadClock = useGame((s) => s.loadClock);
  useEffect(() => {
    void loadClock();
    const t = setInterval(() => void loadClock(), 60_000);
    return () => clearInterval(t);
  }, [loadClock]);
  if (!clock) return null;
  return (
    <span className="text-xs font-medium opacity-80" aria-label="In-game date">
      🗓️ {clock.date.day} {MONTH_NAMES[clock.date.month - 1]} {clock.date.year}
    </span>
  );
}

function Bell() {
  const { profile, notifications, loadNotifications, markAllRead } = useGame();
  const [open, setOpen] = useState(false);
  const unread = profile?.unreadNotifications ?? 0;
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        className="relative rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
        onClick={async () => {
          if (!open) await loadNotifications();
          setOpen(!open);
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-black/10 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-[#101c16]">
          <div className="flex items-center justify-between px-2 py-1">
            <strong className="text-sm">Notifications</strong>
            <button type="button" className="text-xs underline" onClick={() => void markAllRead()}>
              Mark all read
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && <li className="px-2 py-3 text-sm opacity-70">Nothing yet.</li>}
            {notifications.map((n) => (
              <li key={n.id} className={`rounded-lg px-2 py-2 text-sm ${n.read_at ? 'opacity-60' : 'font-medium'}`}>
                {n.title}
                {n.body && <div className="text-xs opacity-70">{n.body}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Signed-in game layout: header (clock, money, bell), content, bottom nav on mobile / side nav on desktop. */
export function AppShell() {
  const { user, status: authStatus } = useAuth();
  const { profile, status, load, pushNotification } = useGame();

  useEffect(() => {
    if (user?.emailVerified && status === 'idle') void load();
  }, [user, status, load]);

  useEffect(() => {
    if (status !== 'ready') return;
    const s = getSocket();
    const onNote = (n: Notification) => pushNotification(n);
    s.on('notification', onNote);
    return () => {
      s.off('notification', onNote);
    };
  }, [status, pushNotification]);

  if (authStatus !== 'ready') return <p role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/home" replace />;
  if (status === 'missing') return <Navigate to="/create" replace />;
  if (status === 'error') return <p role="alert">Could not load your game. Refresh to try again.</p>;
  if (!profile) return <p role="status">Loading your character…</p>;

  return (
    <div className="flex flex-col gap-4 pb-20 md:pb-0">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#101c16]">
        <div className="flex items-center gap-2">
          <Avatar seed={profile.avatarSeed} name={profile.name} size={36} />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{profile.name}</div>
            <GameClock />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums" aria-label="Wallet">
            {formatNaira(profile.wallet)}
          </span>
          <Bell />
        </div>
      </div>
      <div className="md:flex md:gap-6">
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-black/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#0b1510]/95 md:static md:w-44 md:border-0 md:bg-transparent">
          <ul className="flex justify-around md:flex-col md:gap-1">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] md:flex-row md:gap-2 md:rounded-lg md:text-sm ${isActive ? 'font-bold text-naija-600' : 'opacity-75 hover:opacity-100'}`
                  }
                >
                  <span aria-hidden="true">{n.icon}</span>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">
          <Suspense fallback={<p role="status">Loading…</p>}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
