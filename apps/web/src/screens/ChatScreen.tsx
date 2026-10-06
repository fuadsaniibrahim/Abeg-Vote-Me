import { useEffect, useRef, useState, type FormEvent } from 'react';
import { gameApi, type ChatMessage } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card } from '../components/ui';
import { emitAck, getSocket } from '../realtime';
import { useGame } from '../store/game';

export function ChatScreen() {
  const me = useGame((s) => s.profile);
  const [channels, setChannels] = useState<{ id: string; label: string }[]>([]);
  const [channel, setChannel] = useState('global');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void gameApi.chatChannels().then((r) => setChannels(r.channels));
  }, []);

  useEffect(() => {
    const s = getSocket();
    let active = true;
    setMessages([]);
    setError(null);
    void emitAck<{ messages: ChatMessage[] }>('chat:join', channel).then((r) => {
      if (!active) return;
      if (r.ok) setMessages(r.messages);
      else setError(r.message);
    });
    const onMsg = (m: ChatMessage) => {
      if (m.channel === channel) setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    };
    s.on('chat:message', onMsg);
    return () => {
      active = false;
      s.off('chat:message', onMsg);
      s.emit('chat:leave', channel);
    };
  }, [channel]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const r = await emitAck<{ message: ChatMessage }>('chat:send', { channel, body: text });
    if (r.ok) {
      setText('');
      setError(null);
      setMessages((list) => (list.some((x) => x.id === r.message.id) ? list : [...list, r.message]));
    } else setError(r.message);
  }

  async function act(kind: 'dm' | 'block' | 'report', m: ChatMessage) {
    setInfo(null);
    try {
      if (kind === 'dm') {
        const { channel: ch } = await gameApi.openDm(m.senderId);
        setChannels((cs) => (cs.some((c) => c.id === ch) ? cs : [...cs, { id: ch, label: `DM: ${m.senderName}` }]));
        setChannel(ch);
      } else if (kind === 'block') {
        await gameApi.block(m.senderId);
        setMessages((list) => list.filter((x) => x.senderId !== m.senderId));
        setInfo(`You blocked ${m.senderName}.`);
      } else {
        await gameApi.report('chat_message', String(m.id), 'Reported from chat');
        setInfo('Thanks. A moderator will review it.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    }
  }

  return (
    <Page>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">Chat</h1>
        <div role="tablist" aria-label="Channels" className="flex flex-wrap gap-1 text-sm">
          {channels.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={channel === c.id} onClick={() => setChannel(c.id)} className={`rounded-lg px-3 py-1 ${channel === c.id ? 'bg-naija-600 text-white' : 'border border-black/10 dark:border-white/10'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <Card className="flex h-[55vh] flex-col p-3">
          <ul className="flex-1 overflow-y-auto" aria-live="polite" aria-label="Messages">
            {messages.map((m) => (
              <li key={m.id} className="group py-1 text-sm">
                <strong className={m.senderId === me?.id ? 'text-naija-600' : ''}>{m.senderName}</strong>: {m.body}
                {m.senderId !== me?.id && (
                  <span className="ml-2 hidden gap-2 text-xs opacity-70 group-hover:inline-flex group-focus-within:inline-flex">
                    <button type="button" className="underline" onClick={() => void act('dm', m)}>
                      DM
                    </button>
                    <button type="button" className="underline" onClick={() => void act('block', m)}>
                      Block
                    </button>
                    <button type="button" className="underline" onClick={() => void act('report', m)}>
                      Report
                    </button>
                  </span>
                )}
              </li>
            ))}
            <div ref={bottom} />
          </ul>
          <form onSubmit={send} className="mt-2 flex gap-2">
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <input id="chat-input" className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#12201a]" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Talk your own…" />
            <Button type="submit">Send</Button>
          </form>
        </Card>
        {error && <Alert>{error}</Alert>}
        {info && <Alert kind="info">{info}</Alert>}
      </div>
    </Page>
  );
}
