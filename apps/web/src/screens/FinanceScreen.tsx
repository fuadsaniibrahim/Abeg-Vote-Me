import { useEffect, useState } from 'react';
import { BUSINESS_SECTORS } from '@avm/data';
import { formatNaira } from '@avm/engine';
import { gameApi, type Finance } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card, TextField } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useGame } from '../store/game';

const REASONS: Record<string, string> = {
  starting_funds: 'Starting funds',
  donation_to_party: 'Donation to party',
  donation_to_candidate: 'Donation to candidate',
  donation_received: 'Donation received',
  business_start: 'Started business',
  business_income: 'Business income',
  protest_fine: 'Protest fine',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
};

export function FinanceScreen() {
  const load = useGame((s) => s.load);
  const [fin, setFin] = useState<Finance | null>(null);
  const biz = useAction();
  const move = useAction();
  const [name, setName] = useState('');
  const [sector, setSector] = useState(BUSINESS_SECTORS[0]?.id ?? 'pos');
  const [capital, setCapital] = useState(BUSINESS_SECTORS[0]?.minCapital ?? 200_000);
  const [amount, setAmount] = useState(10_000);
  const refresh = async () => setFin(await gameApi.finance());
  useEffect(() => {
    void refresh();
  }, []);

  if (!fin) return <p role="status">Loading finances…</p>;
  const chosen = BUSINESS_SECTORS.find((s) => s.id === sector);

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Finance</h1>
        <Card>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs opacity-70">Personal wallet</dt>
              <dd className="text-xl font-bold tabular-nums">{formatNaira(fin.wallet)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Campaign war chest</dt>
              <dd className="text-xl font-bold tabular-nums">{formatNaira(fin.warChest)}</dd>
            </div>
          </dl>
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await move.run(() => gameApi.transfer('wallet', 'warChest', amount), () => `Moved ${formatNaira(amount)} to your war chest.`)) await Promise.all([refresh(), load()]);
            }}
          >
            <TextField label="Move to war chest (₦)" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <Button type="submit" disabled={move.busy}>
              Move
            </Button>
          </form>
          {move.notice && <div className="mt-2"><Alert kind={move.notice.kind}>{move.notice.text}</Alert></div>}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Businesses ({fin.businesses.length}/3)</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {fin.businesses.map((b) => (
              <li key={b.id} className="flex justify-between rounded-lg bg-black/5 px-3 py-2 dark:bg-white/5">
                <span>
                  <strong>{b.name}</strong> · {b.sectorLabel}
                </span>
                <span className="tabular-nums">earned {formatNaira(b.earned)}</span>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await biz.run(() => gameApi.startBusiness(name, sector, capital), (r) => `Business don open! It cost ${formatNaira(r.cost)}.`)) {
                setName('');
                await Promise.all([refresh(), load()]);
              }
            }}
          >
            <TextField label="Business name" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              Sector
              <select
                className="rounded-xl border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#12201a]"
                value={sector}
                onChange={(e) => {
                  setSector(e.target.value);
                  setCapital(BUSINESS_SECTORS.find((s) => s.id === e.target.value)?.minCapital ?? capital);
                }}
              >
                {BUSINESS_SECTORS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} (from {formatNaira(s.minCapital)})
                  </option>
                ))}
              </select>
            </label>
            <TextField label="Capital (₦)" type="number" min={chosen?.minCapital} value={capital} onChange={(e) => setCapital(Number(e.target.value))} />
            <Button type="submit" disabled={biz.busy}>
              Start business
            </Button>
          </form>
          {biz.notice && <Alert kind={biz.notice.kind}>{biz.notice.text}</Alert>}
          <p className="text-xs opacity-70">Income is paid once per in-game month and depends on the economy and security where you operate.</p>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Transactions</h2>
          <ul className="flex flex-col divide-y divide-black/5 text-sm dark:divide-white/5">
            {fin.transactions.map((t) => (
              <li key={t.id} className="flex justify-between py-2">
                <span>
                  {REASONS[t.reason] ?? t.reason} <span className="text-xs opacity-60">({t.account === 'wallet' ? 'wallet' : 'war chest'})</span>
                </span>
                <span className={`tabular-nums ${t.delta < 0 ? 'text-red-600' : 'text-naija-600'}`}>
                  {t.delta > 0 ? '+' : ''}
                  {formatNaira(t.delta)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
