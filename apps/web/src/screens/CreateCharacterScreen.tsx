import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { STATES } from '@avm/data';
import { BACKGROUNDS, BACKGROUND_IDS, INCOMPATIBLE_TRAITS, STAT_KEYS, STAT_LABELS, TRAITS, TRAIT_IDS, buildCharacter, formatNaira, validateCharacter, type TraitId } from '@avm/engine';
import { ApiError, gameApi, type CharacterForm } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card, TextField } from '../components/ui';
import { useAuth } from '../store/auth';
import { useGame } from '../store/game';

const STEPS = ['Who you be', 'Where you from', 'Your background', 'Your traits', 'Confirm'] as const;

export function CreateCharacterScreen() {
  const user = useAuth((s) => s.user);
  const authStatus = useAuth((s) => s.status);
  const setProfile = useGame((s) => s.setProfile);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CharacterForm>({ name: '', gender: 'female', age: 35, homeStateCode: 'LA', homeLgaId: 'LA-001', background: 'lawyer', traits: [] });
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validation = useMemo(() => validateCharacter(form), [form]);
  const errors = validation.ok ? {} : validation.errors;
  const state = STATES.find((s) => s.code === form.homeStateCode);
  const preview = useMemo(() => (validation.ok ? buildCharacter(form) : null), [validation, form]);

  if (authStatus !== 'ready') return <p role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;

  const set = <K extends keyof CharacterForm>(k: K, v: CharacterForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const stepErrors: (keyof CharacterForm)[][] = [['name', 'gender', 'age'], ['homeStateCode', 'homeLgaId'], ['background'], ['traits'], []];
  const stepOk = stepErrors[step]?.every((k) => !(k in errors)) ?? true;

  function toggleTrait(t: TraitId) {
    setForm((f) => {
      if (f.traits.includes(t)) return { ...f, traits: f.traits.filter((x) => x !== t) };
      if (f.traits.length >= 2) return f;
      return { ...f, traits: [...f.traits, t] };
    });
  }
  const clashesWithPicked = (t: TraitId) => INCOMPATIBLE_TRAITS.some(([a, b]) => (a === t && form.traits.includes(b)) || (b === t && form.traits.includes(a)));

  async function submit() {
    setBusy(true);
    setServerError(null);
    try {
      const { character } = await gameApi.createCharacter(form);
      setProfile(character);
      navigate('/dashboard');
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Could not create your character.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Card className="mx-auto mt-4 max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-naija-600">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mb-4 text-2xl font-bold">{STEPS[step]}</h1>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <TextField label="Full name" value={form.name} onChange={(e) => set('name', e.target.value)} hint="Fictional names only. First name and surname." />
            {form.name && errors.name && <Alert>{errors.name}</Alert>}
            <fieldset className="flex gap-4">
              <legend className="mb-1 text-sm font-medium">Gender</legend>
              {(['female', 'male'] as const).map((g) => (
                <label key={g} className="flex items-center gap-2">
                  <input type="radio" name="gender" checked={form.gender === g} onChange={() => set('gender', g)} className="accent-naija-600" />
                  {g === 'female' ? 'Female' : 'Male'}
                </label>
              ))}
            </fieldset>
            <TextField label="Age" type="number" min={25} max={60} value={form.age} onChange={(e) => set('age', Number(e.target.value))} hint="25 to 60" />
            {errors.age && <Alert>{errors.age}</Alert>}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Home state
              <select
                className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base dark:border-white/15 dark:bg-[#12201a]"
                value={form.homeStateCode}
                onChange={(e) => setForm((f) => ({ ...f, homeStateCode: e.target.value, homeLgaId: `${e.target.value}-001` }))}
              >
                {STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Home LGA
              <select
                className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base dark:border-white/15 dark:bg-[#12201a]"
                value={form.homeLgaId}
                onChange={(e) => set('homeLgaId', e.target.value)}
              >
                {state?.lgas.map((l, i) => (
                  <option key={l} value={`${state.code}-${String(i + 1).padStart(3, '0')}`}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {step === 2 && (
          <div role="radiogroup" aria-label="Background" className="grid gap-2 sm:grid-cols-2">
            {BACKGROUND_IDS.map((id) => {
              const b = BACKGROUNDS[id];
              const on = form.background === id;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  key={id}
                  onClick={() => set('background', id)}
                  className={`rounded-xl border p-3 text-left ${on ? 'border-naija-600 bg-naija-50 dark:bg-naija-900/40' : 'border-black/10 dark:border-white/10'}`}
                >
                  <div className="font-semibold">{b.label}</div>
                  <div className="text-xs opacity-75">{b.blurb}</div>
                  <div className="mt-1 text-xs">Starts with {formatNaira(b.startingWallet)}</div>
                </button>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm opacity-75">Pick exactly 2. ({form.traits.length}/2)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TRAIT_IDS.map((id) => {
                const t = TRAITS[id];
                const on = form.traits.includes(id);
                const disabled = !on && (form.traits.length >= 2 || clashesWithPicked(id));
                return (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => toggleTrait(id)}
                    className={`rounded-xl border p-3 text-left disabled:opacity-40 ${on ? 'border-naija-600 bg-naija-50 dark:bg-naija-900/40' : 'border-black/10 dark:border-white/10'}`}
                  >
                    <div className="font-semibold">{t.label}</div>
                    <div className="text-xs opacity-75">{t.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && preview && (
          <div className="flex flex-col gap-3">
            <div>
              <div>
                <div className="text-lg font-bold">{form.name}</div>
                <div className="text-sm opacity-75">
                  {BACKGROUNDS[form.background as keyof typeof BACKGROUNDS].label} from {state?.lgas[Number(form.homeLgaId.split('-')[1]) - 1]}, {state?.name}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {STAT_KEYS.map((k) => (
                <div key={k} className="flex justify-between rounded-lg bg-black/5 px-3 py-1 dark:bg-white/5">
                  <dt>{STAT_LABELS[k]}</dt>
                  <dd className="font-semibold tabular-nums">{preview.stats[k]}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm">Starting wallet: {formatNaira(preview.wallet)}</p>
          </div>
        )}

        {serverError && <div className="mt-4"><Alert>{serverError}</Alert></div>}

        <div className="mt-6 flex justify-between gap-2">
          <Button variant="ghost" type="button" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={!stepOk} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button type="button" disabled={!validation.ok || busy} onClick={() => void submit()}>
              {busy ? 'Creating…' : 'Start my career'}
            </Button>
          )}
        </div>
      </Card>
    </Page>
  );
}
