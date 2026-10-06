import { useEffect, useState } from 'react';
import { gameApi, type NewsItem } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card, TextField } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useGame } from '../store/game';

const SOURCE_LABEL: Record<NewsItem['source'], string> = { world: 'Naija Daily', player: 'Naija Daily', story: 'Exclusive' };

function StoryComposer({ onPublished }: { onPublished: () => void }) {
  const load = useGame((s) => s.load);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; stateName: string }[]>([]);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [claims, setClaims] = useState<{ id: string; label: string; needsParty: boolean }[]>([]);
  const [claim, setClaim] = useState('');
  const [party, setParty] = useState('PUP');
  const { busy, notice, run } = useAction();

  useEffect(() => {
    void gameApi.storyClaims().then((r) => {
      setClaims(r.claims);
      setClaim(r.claims[0]?.id ?? '');
    });
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => void gameApi.searchCharacters(q).then((r) => setResults(r.characters)), 250);
    return () => clearTimeout(t);
  }, [q]);

  const chosen = claims.find((c) => c.id === claim);
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">Write a story</h2>
      <p className="text-xs opacity-75">Your reputation depends on accuracy. True stories build it; false ones damage it more.</p>
      {target ? (
        <p className="text-sm">
          About: <strong>{target.name}</strong>{' '}
          <button type="button" className="underline" onClick={() => setTarget(null)}>
            change
          </button>
        </p>
      ) : (
        <>
          <TextField label="Search for a player" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="text-sm">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" className="underline" onClick={() => setTarget(r)}>
                  {r.name} ({r.stateName})
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Claim
        <select className="rounded-xl border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#12201a]" value={claim} onChange={(e) => setClaim(e.target.value)}>
          {claims.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label.replace('{party}', '…')}
            </option>
          ))}
        </select>
      </label>
      {chosen?.needsParty && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Party
          <select className="rounded-xl border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#12201a]" value={party} onChange={(e) => setParty(e.target.value)}>
            {['PUP', 'NDA', 'PRM', 'LF'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      <Button
        disabled={busy || !target || !claim}
        onClick={async () => {
          const r = await run(() => gameApi.publishStory(target!.id, claim, chosen?.needsParty ? party : undefined), (x) => `Published: ${x.headline}. Your reputation is now ${x.journalistRep}.`);
          if (r) {
            await load();
            onPublished();
          }
        }}
      >
        Publish
      </Button>
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
    </Card>
  );
}

export function NewsScreen() {
  const profile = useGame((s) => s.profile);
  const [scope, setScope] = useState<'all' | 'state'>('all');
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const refresh = async () => setItems((await gameApi.news(scope === 'state' ? profile?.homeStateCode : undefined)).items);
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <header className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-naija-600">Naija Daily</p>
            <h1 className="text-2xl font-black">Latest gist</h1>
          </div>
          <div role="tablist" aria-label="News scope" className="flex gap-1 text-sm">
            {(['all', 'state'] as const).map((s) => (
              <button key={s} role="tab" aria-selected={scope === s} type="button" onClick={() => setScope(s)} className={`rounded-lg px-3 py-1 ${scope === s ? 'bg-naija-600 text-white' : 'border border-black/10 dark:border-white/10'}`}>
                {s === 'all' ? 'Nationwide' : profile?.homeStateName ?? 'My state'}
              </button>
            ))}
          </div>
        </header>
        {!items && <p role="status">Loading news…</p>}
        {items?.length === 0 && <p className="opacity-70">No news yet. Make some!</p>}
        <ul className="flex flex-col gap-2">
          {items?.map((n) => (
            <li key={n.id} className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-[#101c16]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-naija-600">{SOURCE_LABEL[n.source]}</p>
              <p className="font-semibold">{n.headline}</p>
              {n.body && <p className="text-sm opacity-80">{n.body}</p>}
              <p className="text-xs opacity-60">{new Date(n.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
        <StoryComposer onPublished={() => void refresh()} />
      </div>
    </Page>
  );
}
