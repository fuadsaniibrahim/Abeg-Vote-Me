import { useEffect, useState, type FormEvent } from 'react';
import { CIVIC_GROUPS, PROTEST_ISSUES } from '@avm/data';
import { formatNaira } from '@avm/engine';
import { gameApi, type Petition, type Protest } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card, TextField } from '../components/ui';
import { useAction, type Notice } from '../hooks/useAction';
import { useGame } from '../store/game';

function NoticeBox({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return <Alert kind={notice.kind}>{notice.text}</Alert>;
}

function RallyCard() {
  const { load, profile } = useGame();
  const { busy, notice, run } = useAction();
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">Attend a rally</h2>
      <p className="text-sm opacity-75">Costs 15 energy. You have {profile?.energy ?? 0}.</p>
      <Button
        disabled={busy}
        onClick={async () => {
          const r = await run(() => gameApi.rally(), (x) => x.outcome.text);
          if (r) await load();
        }}
      >
        Go to rally
      </Button>
      <NoticeBox notice={notice} />
    </Card>
  );
}

function DonateCard() {
  const { load, profile } = useGame();
  const { busy, notice, run } = useAction();
  const [amount, setAmount] = useState(10_000);
  const [party, setParty] = useState(profile?.party?.code ?? 'PUP');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => gameApi.donate('party', party, amount), (r) => `You donated ${formatNaira(amount)} to ${r.recipient}.`)) await load();
  }
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <h2 className="font-semibold">Donate to a party</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Party
          <select className="rounded-xl border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#12201a]" value={party} onChange={(e) => setParty(e.target.value)}>
            {['PUP', 'NDA', 'PRM', 'LF'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <TextField label="Amount (₦)" type="number" min={1000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <Button type="submit" disabled={busy}>
          Donate
        </Button>
        <NoticeBox notice={notice} />
      </form>
    </Card>
  );
}

function VolunteerCard() {
  const { load, profile } = useGame();
  const { busy, notice, run } = useAction();
  const roles = profile?.volunteerRoles ?? [];
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">Volunteer for your party</h2>
      {!profile?.party && <p className="text-sm opacity-75">Join a party first.</p>}
      <div className="flex flex-wrap gap-2">
        {(['ward_agent', 'delegate'] as const).map((role) => (
          <Button
            key={role}
            variant="ghost"
            disabled={busy || !profile?.party || roles.includes(role)}
            onClick={async () => {
              if (await run(() => gameApi.volunteer(role), () => `You are now a ${role === 'ward_agent' ? 'ward agent' : 'delegate'}.`)) await load();
            }}
          >
            {roles.includes(role) ? '✓ ' : ''}
            {role === 'ward_agent' ? 'Ward agent' : 'Delegate'}
          </Button>
        ))}
      </div>
      <NoticeBox notice={notice} />
    </Card>
  );
}

function GroupsCard() {
  const { load, profile } = useGame();
  const { busy, notice, run } = useAction();
  const mine = profile?.groups ?? [];
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">Civic groups</h2>
      <ul className="flex flex-col gap-2">
        {CIVIC_GROUPS.map((g) => {
          const member = mine.includes(g.kind);
          return (
            <li key={g.kind} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <strong>{g.label}</strong> <span className="opacity-70">{g.blurb}</span>
              </span>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (await run(() => (member ? gameApi.leaveGroup(g.kind) : gameApi.joinGroup(g.kind)), () => (member ? `You left the ${g.label}.` : `You joined the ${g.label}.`))) await load();
                }}
              >
                {member ? 'Leave' : 'Join'}
              </Button>
            </li>
          );
        })}
      </ul>
      <NoticeBox notice={notice} />
    </Card>
  );
}

function PetitionsCard() {
  const [list, setList] = useState<Petition[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const { busy, notice, run } = useAction();
  const refresh = async () => setList((await gameApi.petitions()).petitions);
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">Petitions</h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => gameApi.createPetition(title, body), () => 'Petition published.')) {
            setTitle('');
            setBody('');
            await refresh();
          }
        }}
      >
        <TextField label="Petition title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="flex flex-col gap-1 text-sm font-medium">
          What should change?
          <textarea className="min-h-20 rounded-xl border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#12201a]" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <Button type="submit" disabled={busy}>
          Start petition
        </Button>
      </form>
      <NoticeBox notice={notice} />
      <ul className="flex flex-col gap-2">
        {list.map((p) => (
          <li key={p.id} className="rounded-xl border border-black/10 p-3 text-sm dark:border-white/10">
            <div className="font-semibold">{p.title}</div>
            <div className="opacity-75">by {p.creatorName} · {p.signatures} signatures</div>
            <Button
              variant="ghost"
              className="mt-2"
              disabled={busy || p.signed}
              onClick={async () => {
                if (await run(() => gameApi.signPetition(p.id), (r) => `Signed! ${r.signatures} signatures now.`)) await refresh();
              }}
            >
              {p.signed ? 'Signed' : 'Sign'}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProtestsCard() {
  const { load } = useGame();
  const [list, setList] = useState<Protest[]>([]);
  const [issue, setIssue] = useState<string>(PROTEST_ISSUES[0]);
  const [title, setTitle] = useState('');
  const { busy, notice, run } = useAction();
  const refresh = async () => setList((await gameApi.protests()).protests);
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">Protests</h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => gameApi.callProtest(issue, title), () => 'Protest called in your state.')) {
            setTitle('');
            await refresh();
          }
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          Issue
          <select className="rounded-xl border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#12201a]" value={issue} onChange={(e) => setIssue(e.target.value)}>
            {PROTEST_ISSUES.map((i) => (
              <option key={i} value={i}>
                {i.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Protest slogan" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" disabled={busy}>
          Call a protest
        </Button>
      </form>
      <NoticeBox notice={notice} />
      <ul className="flex flex-col gap-2">
        {list.map((p) => (
          <li key={p.id} className="rounded-xl border border-black/10 p-3 text-sm dark:border-white/10">
            <div className="font-semibold">{p.title}</div>
            <div className="opacity-75">
              {p.stateName} · {p.issue.replace('_', ' ')} · {p.participants} marching
            </div>
            <Button
              variant="ghost"
              className="mt-2"
              disabled={busy}
              onClick={async () => {
                const r = await run(() => gameApi.joinProtest(p.id), (x) => x.outcome.text + (x.outcome.fined ? ` (Fine: ${formatNaira(x.outcome.fined)})` : ''));
                if (r) await Promise.all([load(), refresh()]);
              }}
            >
              Join (25 energy)
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ActionsScreen() {
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Citizen actions</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <RallyCard />
          <DonateCard />
          <VolunteerCard />
          <GroupsCard />
        </div>
        <PetitionsCard />
        <ProtestsCard />
      </div>
    </Page>
  );
}
