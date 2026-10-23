(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(k => k != null && e.append(k));
    return e;
  }
  const send = (type, extra) => vscode.postMessage(Object.assign({ type }, extra || {}));
  const open = p => send('openFile', { path: p });

  function table(headers, rows, empty) {
    if (!rows.length) return el('div', { class: 'empty', text: empty });
    return el('table', {}, el('thead', {}, el('tr', {}, headers.map(h => el('th', { text: h })))), el('tbody', {}, rows));
  }

  function link(text, path) { return el('a', { class: 'link', text, onclick: () => open(path) }); }

  function render(state) {
    const b = state.board;
    if (!b) {
      root.replaceChildren(
        el('h1', { text: 'Message Board' }),
        el('div', { class: 'empty', text: 'No MessageBoard/ folder found in this workspace. The Message Board is an optional add-on of Bear\'s Agentic Code Framework (Add-ons/MessageBoard). Copy its MessageBoard/ folder into your project root and it shows up here.' }));
      return;
    }
    const live = b.claims.filter(c => !c.expired);
    root.replaceChildren(...[
      el('h1', { text: 'Message Board' }),
      el('p', { class: 'sub', text: b.root }),
      el('div', { class: 'bar-row' },
        el('button', { class: 'primary', text: 'New thread…', onclick: () => send('newThread') }),
        el('button', { text: 'Open README', onclick: () => open(b.root + '/README.md') }),
        el('span', { class: 'grow' }),
        el('span', { class: 'note', text: live.length + ' active claim' + (live.length === 1 ? '' : 's') + ' · ' + b.threads.length + ' thread' + (b.threads.length === 1 ? '' : 's') + ' · ' + b.archived + ' archived' })),

      el('h2', { text: 'Active agents' }),
      table(['Agent', 'Client', 'Focus', 'Claimed areas', 'Ticket', 'Last check-in'],
        b.agents.map(a => el('tr', {}, el('td', { text: a.name }), el('td', { text: a.client }), el('td', { text: a.focus }), el('td', { text: a.claimed }), el('td', { text: a.ticket }), el('td', { text: a.lastCheckin }))),
        'No agents on the roster (ACTIVE_AGENTS.md).'),

      el('h2', { text: 'Claims (who is editing what)' }),
      table(['Claim', 'Held by', 'Ticket', 'Reason', 'Expires', ''],
        b.claims.map(c => el('tr', { class: c.expired ? '' : '' },
          el('td', {}, el('b', { text: c.key })),
          el('td', { text: c.agent }),
          el('td', { text: c.ticket }),
          el('td', {}, el('span', { class: 'note', text: c.reason })),
          el('td', {}, el('span', { class: 'pill ' + (c.expired ? 'cancelled' : 'running'), text: c.expired ? 'expired' : c.minutesLeft + ' min left' })),
          el('td', { class: 'actions' }, c.expired ? el('button', { class: 'small', text: 'Release', title: 'The lease ran out: free it', onclick: () => send('releaseClaim', { key: c.key }) }) : null))),
        'Nothing is claimed right now.'),

      el('h2', { text: 'Threads' }),
      table(['Thread', 'Status', 'Author', 'Created', 'Msgs', 'Last message', ''],
        b.threads.map(t => el('tr', {},
          el('td', {}, link(t.title, t.path), t.ticket && !/^none$/i.test(t.ticket) ? el('div', { class: 'note', text: t.ticket }) : null),
          el('td', {}, t.status ? el('span', { class: 'badge', text: t.status }) : null),
          el('td', { text: t.author }),
          el('td', { text: t.created }),
          el('td', { text: String(t.messages) }),
          el('td', {}, el('span', { class: 'note', text: t.lastMessage })),
          el('td', { class: 'actions' }, el('button', { class: 'small', text: 'Reply…', onclick: () => send('reply', { path: t.path }) })))),
        'No open threads.'),

      b.dms.length ? el('h2', { text: 'Direct messages' }) : null,
      b.dms.length ? table(['To', 'Message', 'File'], b.dms.map(d => el('tr', {}, el('td', { text: d.to }), el('td', {}, link(d.title, d.path)), el('td', {}, el('span', { class: 'note', text: d.file })))), '') : null,

      b.claimsLog.length ? el('h2', { text: 'Recent claim log' }) : null,
      b.claimsLog.length ? el('div', { class: 'note' }, b.claimsLog.map(l => el('div', { text: l }))) : null
    ].filter(Boolean));
  }

  window.addEventListener('message', e => { if (e.data.type === 'state') render(e.data); });
  vscode.postMessage({ type: 'ready' });
})();
