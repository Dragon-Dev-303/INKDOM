'use client';

import Link from 'next/link';
import { useState } from 'react';
import { services } from '@/services';
import { MESSAGE_KINDS, type InboxMessage, type MessageKind } from '@/services/inbox';
import { fmtDateTime, fmtRelative, nowFor } from './format';
import { useServiceData } from './hooks';
import { Chip, Empty, ErrorNote, HubPage, Loading, Panel } from './ui';

type Filter = 'all' | 'unread' | MessageKind;

export default function InboxScreen() {
  const res = useServiceData('inbox', () => services.inbox.list());
  return (
    <HubPage featureId="inbox">
      {res.status === 'loading' && <Loading />}
      {res.status === 'error' && <ErrorNote error={res.error} />}
      {res.status === 'ready' && <Inbox initial={res.data} />}
    </HubPage>
  );
}

function Inbox({ initial }: { initial: InboxMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(initial[0]?.id ?? null);
  const shown = messages.filter((m) => (filter === 'all' ? true : filter === 'unread' ? !m.read : m.kind === filter));
  const open = messages.find((m) => m.id === openId) ?? null;
  const unread = messages.filter((m) => !m.read).length;

  const select = (m: InboxMessage) => {
    setOpenId(m.id);
    if (!m.read) {
      setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
      void services.inbox.markRead(m.id).then(() => window.dispatchEvent(new Event('inkdom:inbox-changed')));
    }
  };
  const filters: Filter[] = ['all', 'unread', 'siege', 'team', 'diplomacy', 'reward', 'system', 'direct'];

  return (
    <>
      <div className="segmented" role="group" aria-label="Filter messages" style={{ marginBottom: 14 }}>
        {filters.map((f) => (
          <button key={f} className={`btn small${filter === f ? ' active' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'unread' ? `Unread (${unread})` : `${MESSAGE_KINDS[f].icon} ${MESSAGE_KINDS[f].label}`}
          </button>
        ))}
      </div>
      <div className="hub-inbox">
        <div>
          {shown.length === 0 ? (
            <Empty title="Nothing here" />
          ) : (
            <ul className="hub-msg-list" aria-label="Messages">
              {shown.map((m) => (
                <li key={m.id}>
                  <button className={`hub-msg${m.read ? '' : ' unread'}${m.id === openId ? ' selected' : ''}`} onClick={() => select(m)} aria-current={m.id === openId ? 'true' : undefined}>
                    <span aria-hidden="true" style={{ fontSize: 18 }}>{MESSAGE_KINDS[m.kind].icon}</span>
                    <span className="hub-msg-body">
                      <span className="hub-msg-subject">{m.read ? '' : <span className="sr-unread">Unread: </span>}{m.subject}</span>
                      <span className="hub-msg-meta">{m.from} · {fmtRelative(m.at, nowFor(m.isSample))}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Panel title={open?.subject ?? 'No message selected'} icon={open ? MESSAGE_KINDS[open.kind].icon : '✉'}>
          {open ? (
            <article aria-live="polite">
              <div className="hub-row" style={{ marginBottom: 10 }}>
                <Chip>{MESSAGE_KINDS[open.kind].label}</Chip>
                <span className="muted small">From {open.from} · {fmtDateTime(open.at)}</span>
              </div>
              <p style={{ lineHeight: 1.6 }}>{open.body}</p>
              <div className="hub-row">
                {open.action && <Link href={open.action.href} className="btn primary small">{open.action.label}</Link>}
                {open.kind === 'direct' && <button className="btn small" disabled title="Coming soon">Reply</button>}
              </div>
            </article>
          ) : (
            <p className="muted">Select a message to read it.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
