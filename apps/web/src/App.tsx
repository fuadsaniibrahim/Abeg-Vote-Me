import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Layout } from './components/Layout';
import { StartScreen } from './screens/StartScreen';
import { LoginScreen, RegisterScreen } from './screens/AuthScreens';
import { VerifyScreen } from './screens/VerifyScreen';
import { HomeScreen } from './screens/HomeScreen';
import { useAuth } from './store/auth';
import { applyTheme, useTheme } from './store/theme';

export function App() {
  const location = useLocation();
  const load = useAuth((s) => s.load);
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => applyTheme(theme), [theme]);

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<StartScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/verify" element={<VerifyScreen />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="*" element={<StartScreen />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  );
}
