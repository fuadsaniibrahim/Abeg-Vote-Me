import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getState } from '@avm/data';
import { formatNaira } from '@avm/engine';
import { ApiError, gameApi, type Eligibility, type SeatDetail, type SeatHistoryEntry } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card, TextField } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { Breadcrumbs, HolderLine, PartyBadge, SeatLink, relativeDays, shortDate } from '../components/seats';
import { useAction } from '../hooks/useAction';
import { useGame } from '../store/game';

const START_LABELS: Record<string, string> = {
  seeded: 'In office when the world began',
  election: 'Won the election',
  by_election: 'Won a by-election',
  succession: 'Stepped up as deputy',
  appointed: 'Appointed',
  npc_returned: 'Returned for a new term',
  npc_replaced: 'Took over from a term-limited holder',
  takeover: 'Took over the seat',
};
const END_LABELS: Record<string, string> = {
  defeated: 'Lost the seat',
  resigned: 'Resigned',
  inactive: 'Removed for inactivity',
  removed: 'Removed',
  succeeded: 'Moved up to the top job',
  replaced: 'Replaced',
  term_expired: 'Term ended',
  term_limited: 'Reached the term limit',
};

function ChiefOfStaffPanel({ current, onChange }: { current: SeatDetail['chiefOfStaff']; onChange: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; stateName: string }[]>([]);
  const { busy, notice, run } = useAction();
  const me = useGame((s) => s.profile?.id);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">Chief of staff</h3>
      <p className="text-sm opacity-75">Your chief of staff acts for you when your office goes on autopilot because you have been away.</p>
      <p className="text-sm">
        Current: <strong>{current ? current.name : 'Nobody'}</strong>
      </p>
      {notice && <Alert kind={notice.kind === 'info' ? 'info' : notice.kind}>{notice.text}</Alert>}
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => gameApi.searchCharacters(q));
          if (r) setResults(r.characters.filter((c) => c.id !== me));
        }}
      >
        <div className="flex-1">
          <TextField label="Find a player" value={q} onChange={(e) => setQ(e.target.value)} minLength={2} />
        </div>
        <Button type="submit" variant="ghost" disabled={busy || q.trim().length < 2}>
          Search
        </Button>
      </form>
      <ul className="flex flex-col gap-1">
        {results.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {c.name} <span className="opacity-60">({c.stateName})</span>
            </span>
            <Button
              className="px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={async () => {
                if (await run(() => gameApi.setChiefOfStaff(c.id), () => `${c.name} is now your chief of staff.`)) {
                  setResults([]);
                  await onChange();
                }
              }}
            >
              Name {c.name.split(' ')[0]}
            </Button>
          </li>
        ))}
      </ul>
      {current && (
        <Button
          variant="ghost"
          className="self-start px-3 py-1.5 text-sm"
          disabled={busy}
          onClick={async () => {
            if (await run(() => gameApi.setChiefOfStaff(null), () => 'Chief of staff removed.')) await onChange();
          }}
        >
          Remove chief of staff
        </Button>
      )}
    </section>
  );
}

function ResignPanel({ seatName, onDone }: { seatName: string; onDone: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const { busy, notice, run } = useAction();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">Resign</h3>
      {notice && <Alert kind={notice.kind === 'info' ? 'info' : notice.kind}>{notice.text}</Alert>}
      {!confirming ? (
        <Button variant="ghost" className="self-start" onClick={() => setConfirming(true)}>
          Resign from office
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-red-600/30 p-3">
          <p className="text-sm">Resign as {seatName}? You cannot undo this. Your deputy steps up, or a by-election is called.</p>
          <div className="flex gap-2">
            <Button
              className="bg-red-700 hover:bg-red-800"
              disabled={busy}
              onClick={async () => {
                if (await run(() => gameApi.resign(), () => `You resigned as ${seatName}.`)) await onDone();
              }}
            >
              Yes, resign
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function SeatScreen() {
  const { id = '' } = useParams();
  const [data, setData] = useState<SeatDetail | null>(null);
  const [history, setHistory] = useState<SeatHistoryEntry[]>([]);
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadProfile = useGame((s) => s.load);

  const refresh = useCallback(async () => {
    try {
      const [d, h, e] = await Promise.all([gameApi.seat(id), gameApi.seatHistory(id), gameApi.eligibility(id).catch(() => null)]);
      setData(d);
      setHistory(h.history);
      setElig(e);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this seat.');
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setError(null);
    void refresh();
  }, [refresh]);

  const seat = data?.seat;
  const state = seat?.stateCode ? getState(seat.stateCode) : undefined;
  const h = seat?.holder;
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ to: '/map', label: 'Nigeria' }, ...(state ? [{ to: `/map/${state.code}`, label: state.name }] : []), { label: seat?.kindLabel ?? 'Seat' }]} />
        {error && <Alert>{error}</Alert>}
        {!data && !error && <p role="status">Loading…</p>}
        {data && seat && (
          <>
            <Card className="flex flex-col gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide opacity-70">{seat.kindLabel}</p>
                <h1 className="text-2xl font-bold">{seat.name}</h1>
              </div>
              {h ? (
                <div className="flex items-center gap-3">
                  {h.type === 'player' && h.avatarSeed ? (
                    <Avatar seed={h.avatarSeed} name={h.name} size={56} />
                  ) : (
                    <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-black/5 text-2xl dark:bg-white/10">
                      🏛️
                    </span>
                  )}
                  <div className="flex flex-col gap-1">
                    <HolderLine holder={h} />
                    <p className="text-xs opacity-75">
                      {START_LABELS[h.startReason] ?? h.startReason} · since {shortDate(h.since)}
                    </p>
                  </div>
                </div>
              ) : (
                <Alert kind="info">This seat is vacant.</Alert>
              )}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {h?.termEndsAt && (
                  <div>
                    <dt className="text-xs opacity-70">Term ends</dt>
                    <dd className="font-semibold">{h.holdingOver ? `Ended ${relativeDays(h.termEndsAt)} (holding over)` : relativeDays(h.termEndsAt)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs opacity-70">Monthly salary</dt>
                  <dd className="font-semibold tabular-nums">{formatNaira(seat.salary)}</dd>
                </div>
                {data.acting && data.acting.type !== 'holder' && (
                  <div className="col-span-2">
                    <dt className="text-xs opacity-70">Acting while the holder is away</dt>
                    <dd className="font-semibold">
                      {data.acting.type === 'autopilot' ? 'Autopilot (nobody named)' : `${data.acting.name} (${data.acting.type === 'chief_of_staff' ? 'chief of staff' : 'deputy'})`}
                    </dd>
                  </div>
                )}
              </dl>
              {data.openElection && (
                <Alert kind="info">
                  {data.openElection.kind === 'by_election' ? 'By-election' : 'Election'} scheduled {relativeDays(data.openElection.scheduledFor)}.
                </Alert>
              )}
              {data.deputy && <SeatLink seat={data.deputy} label={`Deputy: ${data.deputy.kindLabel}`} />}
              {data.principal && <SeatLink seat={data.principal} label={`Principal: ${data.principal.kindLabel}`} />}
              {seat.constituencyId && (
                <Link to={`/map/constituency/${seat.constituencyId}`} className="text-sm underline underline-offset-2">
                  View the constituency
                </Link>
              )}
              {seat.lgaId && (
                <Link to={`/map/lga/${seat.lgaId}`} className="text-sm underline underline-offset-2">
                  View the LGA and its wards
                </Link>
              )}
            </Card>

            {seat.mine && (
              <Card className="flex flex-col gap-4">
                <h2 className="text-lg font-bold">Your office</h2>
                <ChiefOfStaffPanel current={data.chiefOfStaff} onChange={refresh} />
                <ResignPanel
                  seatName={seat.name}
                  onDone={async () => {
                    await Promise.all([refresh(), loadProfile()]);
                  }}
                />
              </Card>
            )}

            {elig && !seat.mine && (
              <Card>
                <h2 className="mb-2 font-semibold">Could you hold this seat?</h2>
                {elig.eligible ? (
                  <p className="text-sm">Yes. You meet every rule for this office.</p>
                ) : (
                  <ul className="list-inside list-disc text-sm" aria-label="Why you cannot hold this seat">
                    {elig.reasons.map((r) => (
                      <li key={r.code}>{r.message}</li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            <Card>
              <h2 className="mb-2 font-semibold">Seat history</h2>
              <ol className="flex flex-col divide-y divide-black/5 dark:divide-white/10" aria-label="Past and present holders">
                {history.map((e) => (
                  <li key={e.tenureId} className="flex flex-col gap-0.5 py-2 text-sm">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <strong>{e.name}</strong>
                      {e.party && <PartyBadge party={e.party} />}
                      <span className="text-xs opacity-60">{e.type === 'player' ? 'Player' : 'NPC'}</span>
                    </span>
                    <span className="text-xs opacity-75">
                      {shortDate(e.startedAt)} – {e.endedAt ? shortDate(e.endedAt) : 'now'} · {START_LABELS[e.startReason] ?? e.startReason}
                      {e.endReason ? ` · ${END_LABELS[e.endReason] ?? e.endReason}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </>
        )}
      </div>
    </Page>
  );
}
