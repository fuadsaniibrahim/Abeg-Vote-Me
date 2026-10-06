import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Layout } from './components/Layout';
import { StartScreen } from './screens/StartScreen';
import { LoginScreen, RegisterScreen } from './screens/AuthScreens';
import { VerifyScreen } from './screens/VerifyScreen';
import { HomeScreen } from './screens/HomeScreen';
import { AppShell } from './components/AppShell';
import { useAuth } from './store/auth';
import { applyTheme, useTheme } from './store/theme';

// Game screens are split into their own chunks so the first load stays small.
const CreateCharacterScreen = lazy(() => import('./screens/CreateCharacterScreen').then((m) => ({ default: m.CreateCharacterScreen })));
const DashboardScreen = lazy(() => import('./screens/DashboardScreen').then((m) => ({ default: m.DashboardScreen })));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen').then((m) => ({ default: m.ProfileScreen })));
const PartyHubScreen = lazy(() => import('./screens/PartyHubScreen').then((m) => ({ default: m.PartyHubScreen })));
const ActionsScreen = lazy(() => import('./screens/ActionsScreen').then((m) => ({ default: m.ActionsScreen })));
const FinanceScreen = lazy(() => import('./screens/FinanceScreen').then((m) => ({ default: m.FinanceScreen })));
const NewsScreen = lazy(() => import('./screens/NewsScreen').then((m) => ({ default: m.NewsScreen })));
const ChatScreen = lazy(() => import('./screens/ChatScreen').then((m) => ({ default: m.ChatScreen })));
const MapScreen = lazy(() => import('./screens/MapScreen').then((m) => ({ default: m.MapScreen })));
const StateMapScreen = lazy(() => import('./screens/StateMapScreen').then((m) => ({ default: m.StateMapScreen })));
const ConstituencyScreen = lazy(() => import('./screens/ConstituencyScreen').then((m) => ({ default: m.ConstituencyScreen })));
const LgaScreen = lazy(() => import('./screens/LgaScreen').then((m) => ({ default: m.LgaScreen })));
const SeatScreen = lazy(() => import('./screens/SeatScreen').then((m) => ({ default: m.SeatScreen })));

export function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<p role="status">Loading…</p>}>
        <Routes location={location} key={location.pathname.split('/')[1]}>
          <Route path="/" element={<StartScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/verify" element={<VerifyScreen />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/create" element={<CreateCharacterScreen />} />
          <Route element={<AppShell />}>
            <Route path="/news" element={<NewsScreen />} />
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/profile" element={<ProfileScreen />} />
            <Route path="/parties" element={<PartyHubScreen />} />
            <Route path="/actions" element={<ActionsScreen />} />
            <Route path="/finance" element={<FinanceScreen />} />
            <Route path="/chat" element={<ChatScreen />} />
            <Route path="/map" element={<MapScreen />} />
            <Route path="/map/:code" element={<StateMapScreen />} />
            <Route path="/map/constituency/:id" element={<ConstituencyScreen />} />
            <Route path="/map/lga/:id" element={<LgaScreen />} />
            <Route path="/seats/:id" element={<SeatScreen />} />
          </Route>
          <Route path="*" element={<StartScreen />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

export function App() {
  const load = useAuth((s) => s.load);
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => applyTheme(theme), [theme]);

  return (
    <Layout>
      <AppRoutes />
    </Layout>
  );
}
