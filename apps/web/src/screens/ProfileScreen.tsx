import { CIVIC_GROUPS } from '@avm/data';
import { TRAITS, formatNaira, type TraitId } from '@avm/engine';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/Layout';
import { Button, Card } from '../components/ui';
import { useAuth } from '../store/auth';
import { disconnectSocket } from '../realtime';
import { Avatar } from '../components/Avatar';
import { StatBars } from '../components/StatBars';
import { useGame } from '../store/game';

export function ProfileScreen() {
  const p = useGame((s) => s.profile);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  if (!p) return null;
  return (
    <Page>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar seed={p.avatarSeed} name={p.name} size={72} />
          <div>
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <p className="text-sm opacity-75">
              {p.age}, {p.backgroundLabel} from {p.homeLgaName}, {p.homeStateName}
            </p>
            {p.party && (
              <p className="mt-1 text-sm font-semibold" style={{ color: p.party.color }}>
                {p.party.name}
              </p>
            )}
          </div>
        </div>
        <section>
          <h2 className="mb-2 font-semibold">Stats</h2>
          <StatBars stats={p.stats} />
        </section>
        <section className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <h2 className="font-semibold">Traits</h2>
            <ul>
              {p.traits.map((t) => (
                <li key={t}>{TRAITS[t as TraitId]?.label ?? t}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">Perks</h2>
            <ul>
              {p.perks.map((k) => (
                <li key={k.id}>{k.label}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">Groups</h2>
            <p>{p.groups.length ? p.groups.map((g) => CIVIC_GROUPS.find((c) => c.kind === g)?.label ?? g).join(', ') : 'None'}</p>
          </div>
          <div>
            <h2 className="font-semibold">Volunteer roles</h2>
            <p>{p.volunteerRoles.length ? p.volunteerRoles.map((r) => (r === 'ward_agent' ? 'Ward agent' : 'Delegate')).join(', ') : 'None'}</p>
          </div>
          <div>
            <h2 className="font-semibold">Money</h2>
            <p>
              Wallet {formatNaira(p.wallet)} · War chest {formatNaira(p.warChest)}
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Journalist reputation</h2>
            <p>{p.journalistRep}/100</p>
          </div>
        </section>
        <Button
          variant="ghost"
          onClick={async () => {
            await logout();
            disconnectSocket();
            useGame.setState({ profile: null, status: 'idle', notifications: [] });
            navigate('/');
          }}
        >
          Log out
        </Button>
      </Card>
    </Page>
  );
}
