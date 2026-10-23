(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  let last = null;

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

  function dur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  function settingsBar(s, providers) {
    const orchProviders = providers.filter(p => p.roles.includes('orchestrator') && p.command.includes('{task}'));
    const orchSel = el('select', { onchange: () => save({ orchestratorProviderId: orchSel.value, orchestratorModel: '' }) },
      el('option', { value: '', text: '(none)' }),
      orchProviders.map(p => el('option', { value: p.id, text: p.name + (p.account ? ' · ' + p.account : ''), selected: p.id === s.orchestratorProviderId })));
    const chosen = providers.find(p => p.id === s.orchestratorProviderId);
    const modelSel = el('select', { onchange: () => save({ orchestratorModel: modelSel.value }) },
      (chosen ? chosen.models : []).map(m => el('option', { value: m, text: m, selected: m === (s.orchestratorModel || chosen.defaultModel) })));
    if (!chosen || !chosen.models.length) modelSel.disabled = true;

    const auto = el('input', { type: 'checkbox', onchange: () => save({ autopilot: auto.checked }) });
    auto.checked = s.autopilot;
    const rev = el('input', { type: 'checkbox', onchange: () => save({ autoReview: rev.checked }) });
    rev.checked = s.autoReview;
    const every = el('input', { type: 'number', min: 10, max: 3600, value: s.intervalSeconds, style: 'width:70px', onchange: () => save({ intervalSeconds: +every.value }) });
    const per = el('input', { type: 'number', min: 1, max: 20, value: s.maxNewPerTick, style: 'width:56px', onchange: () => save({ maxNewPerTick: +per.value }) });

    const resume = el('input', { type: 'checkbox', onchange: () => save({ autoResume: resume.checked }) });
    resume.checked = s.autoResume;
    const retries = el('input', { type: 'number', min: 0, max: 10, value: s.maxAutoRetries, style: 'width:56px', onchange: () => save({ maxAutoRetries: +retries.value }) });

    const objSel = el('select', { onchange: () => save({ objective: objSel.value }), title: 'What the orchestrator optimises when choosing an agent and model' },
      [['balanced', 'Balanced (time + cost)'], ['cost', 'Cheapest'], ['speed', 'Fastest']].map(([v, t]) => el('option', { value: v, text: t, selected: v === s.objective })));
    const failover = el('input', { type: 'checkbox', onchange: () => save({ autoFailover: failover.checked }) });
    failover.checked = s.autoFailover;
    const bg = el('input', { type: 'checkbox', onchange: () => save({ backgroundTerminals: bg.checked }) });
    bg.checked = s.backgroundTerminals;

    return el('div', {},
      el('div', { class: 'bar-row' }, el('label', { class: 'inline' }, el('b', { text: 'Optimise for' }), objSel,
        el('span', { class: 'note', text: 'predicted time + cost + how scarce each provider\'s quota is' }))),
      el('div', { class: 'bar-row' },
        el('label', { class: 'inline', title: 'When a model hits its usage limit: continue on another capable model, or wait for the reset' }, failover, el('b', { text: 'Usage-limit failover' })),
        el('label', { class: 'inline', title: 'Automated sessions run in hidden terminals. Open terminal reveals them.' }, bg, 'run automated sessions in background terminals')),
      el('div', { class: 'bar-row' },
        el('label', { class: 'inline' }, resume, el('b', { text: 'Auto-resume' }), ' interrupted / failed sessions, up to', retries, 'times')),
      el('div', { class: 'bar-row' },
        el('label', { class: 'inline' }, auto, el('b', { text: 'Autopilot' }), ' start Ready tickets automatically'),
        el('label', { class: 'inline' }, rev, 'auto-request a review when a worker finishes'),
        el('span', { class: 'grow' }),
        el('button', { text: 'Agent providers…', onclick: () => send('openProviders') })
      ),
      el('div', { class: 'bar-row' },
        el('label', { class: 'inline' }, 'every', every, 's, up to', per, 'per tick'),
        el('span', { class: 'grow' }),
        el('label', { class: 'inline' }, 'Orchestrator agent', orchSel, modelSel),
        el('button', { text: 'Ask it to plan', title: 'Writes a capacity brief and has the orchestrator agent assign Ready tickets', onclick: () => send('askOrchestrator'), disabled: !chosen })
      )
    );
  }

  function save(patch) { send('saveSettings', { settings: patch }); }

  function capacity(state) {
    const cards = state.providers.map(p => {
      const u = state.usage.find(x => x.providerId === p.id);
      const pct = u.pct === null ? 0 : u.pct;
      const retry = u.retryAt && u.retryAt > state.now ? ' · free in ' + dur(u.retryAt - state.now) : '';
      return el('div', { class: 'cap-card' },
        el('div', { class: 't' }, el('span', { text: p.name + (p.account ? ' · ' + p.account : '') }), el('span', { class: 'pill ' + u.state, text: u.state })),
        el('div', { class: 'm', text: 'Parallel ' + u.running + '/' + u.maxParallel + (u.queued ? ' · ' + u.queued + ' queued' : '') }),
        el('div', { class: 'meter' }, el('i', { class: pct >= 90 ? 'hot' : pct >= 70 ? 'warn' : '', style: 'width:' + (u.maxParallel ? Math.round(u.running / u.maxParallel * 100) : 0) + '%' })),
        el('div', { class: 'm', text: u.pct === null ? 'No rolling-window cap set' : 'Window ' + u.startsInWindow + '/' + u.maxSessionsPerWindow + ' per ' + u.windowMinutes + 'm (' + pct + '%)' }),
        u.pct === null ? null : el('div', { class: 'meter' }, el('i', { class: pct >= 90 ? 'hot' : pct >= 70 ? 'warn' : '', style: 'width:' + pct + '%' })),
        (u.budget && (u.budget.day || u.budget.week || u.budget.month)) ? el('div', { class: 'm', text: 'Spend (est.) ' + [['day', 'today'], ['week', 'week'], ['month', 'month']].filter(([k]) => u.budget[k] > 0).map(([k, l]) => l + ' $' + u.spend[k].toFixed(2) + '/$' + u.budget[k]).join(' \u00b7 ') }) : (u.spend && u.spend.month > 0 ? el('div', { class: 'm', text: 'Spend (est.) today $' + u.spend.day.toFixed(2) + ' \u00b7 month $' + u.spend.month.toFixed(2) }) : null),
        (u.blockedModels || []).length ? el('div', { class: 'blocked', text: 'At limit: ' + u.blockedModels.map(b => b.model + (b.unknown ? ' (reset unknown, retrying)' : ' until ' + new Date(b.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))).join(', ') }) : null,
        u.reason && u.state !== 'ready' ? el('div', { class: 'm', text: u.reason + retry }) : null
      );
    });
    return cards.length ? el('div', { class: 'cap-grid' }, cards) : el('div', { class: 'empty', text: 'No providers configured. Open Agent providers… to add some.' });
  }

  function planTable(state) {
    if (!state.plan.length) return el('div', { class: 'empty', text: 'Nothing to schedule: put tickets in Backlog/Ready (and make sure a provider has free capacity).' });
    return el('table', {},
      el('thead', {}, el('tr', {}, ['Ticket', 'Agent \u00b7 model', 'Est.', 'When', 'Why', ''].map(h => el('th', { text: h })))),
      el('tbody', {}, state.plan.map(d => el('tr', {},
        el('td', {}, el('a', { class: 'link', text: (d.ticketId ? d.ticketId + ' — ' : '') + d.title, onclick: () => send('openTicket', { path: d.ticketPath }) })),
        el('td', { text: d.providerName + (d.model ? ' \u00b7 ' + d.model : '') }),
        el('td', { text: d.estMinutes !== undefined ? '~' + Math.round(d.estMinutes) + ' min \u00b7 ' + (d.estCost > 0 ? '$' + d.estCost.toFixed(2) : 'free') : '' }),
        el('td', {}, el('span', { class: 'pill ' + (d.startsNow ? 'ready' : 'queued'), text: d.startsNow ? 'now' : 'queued' })),
        el('td', {}, el('span', { class: 'note', text: d.reason }),
          (d.alternatives || []).length ? el('div', { class: 'note', text: 'Instead of: ' + d.alternatives.join('  |  ') }) : null),
        el('td', { class: 'actions' }, el('button', { class: 'small', text: 'Start', onclick: () => send('startDecision', { ticketPath: d.ticketPath }) }))
      )))
    );
  }

  const recoverable = s => (s.status === 'interrupted' || s.status === 'failed') && !s.resumedBy;

  function recoveryBanner(state) {
    const need = state.sessions.filter(s => s.attention && (s.status === 'running' || recoverable(s)));
    const n = state.sessions.filter(s => recoverable(s)).length;
    if (need.length && !n) {
      return el('div', { class: 'banner' }, el('span', { text: need.length + ' agent' + (need.length === 1 ? '' : 's') + ' need' + (need.length === 1 ? 's' : '') + ' you: ' + need[0].attention }), el('span', { class: 'grow' }),
        need[0].status === 'running' ? el('button', { class: 'primary', text: 'Open terminal', onclick: () => send('focusSession', { id: need[0].id }) }) : null);
    }
    if (!n) return null;
    return el('div', { class: 'banner' },
      el('span', { text: n + ' agent session' + (n === 1 ? '' : 's') + ' ' + (n === 1 ? 'was' : 'were') + ' interrupted or failed (network error, crash, or the editor/PC closed).' }),
      el('span', { class: 'grow' }),
      el('button', { class: 'primary', text: 'Resume all', onclick: () => send('resumeAll') }));
  }

  function sessionTable(state) {
    if (!state.sessions.length) return el('div', { class: 'empty', text: 'No sessions yet. Assign a ticket to an agent or run the plan.' });
    return el('table', {},
      el('thead', {}, el('tr', {}, ['Status', 'Agent · model', 'Role', 'Ticket', 'Time', ''].map(h => el('th', { text: h })))),
      el('tbody', {}, state.sessions.map(s => {
        const live = s.status === 'running';
        const since = s.startedAt || s.queuedAt;
        return el('tr', { class: s.attention ? 'attention' : '' },
          el('td', {}, el('span', { class: 'pill ' + s.status, text: s.status }), s.attention ? el('div', {}, el('span', { class: 'pill needs', text: 'needs you', title: s.attention })) : null, s.hidden && live ? el('div', { class: 'note', text: 'background' }) : null),
          el('td', { text: s.providerName + (s.model ? ' · ' + s.model : '') }),
          el('td', { text: s.role }),
          el('td', {}, el('a', { class: 'link', text: (s.ticketId ? s.ticketId + ' — ' : '') + s.ticketTitle, onclick: () => send('openTicket', { path: s.ticketPath }) }),
            s.note ? el('div', { class: 'note', text: s.note }) : null,
            s.attention ? el('div', { class: 'note', style: 'color:#f85149', text: s.attention }) : null,
            s.resumeAfter && recoverable(s) ? el('div', { class: 'note', text: 'Auto-continues after ' + new Date(s.resumeAfter).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : null),
          el('td', { 'data-since': live ? since : '', text: live ? dur(state.now - since) : (s.endedAt && s.startedAt ? dur(s.endedAt - s.startedAt) : '') }),
          el('td', { class: 'actions' },
            recoverable(s) ? el('button', { class: 'small primary', text: 'Resume', title: 'Continue the same agent conversation where it left off', onclick: () => send('resumeSession', { id: s.id, mode: 'resume' }) }) : null,
            recoverable(s) ? el('button', { class: 'small', text: 'Restart', title: 'Start over with a fresh agent conversation', onclick: () => send('resumeSession', { id: s.id, mode: 'restart' }) }) : null,
            recoverable(s) ? el('button', { class: 'small', text: 'Dismiss', title: 'It was actually finished', onclick: () => send('dismissSession', { id: s.id }) }) : null,
            live ? el('button', { class: 'small', text: 'Resume', title: 'Hung or lost connection? Stop it and continue the same thread', onclick: () => send('resumeSession', { id: s.id, mode: 'resume' }) }) : null,
            live ? el('button', { class: 'small primary', text: 'Open terminal', onclick: () => send('focusSession', { id: s.id }) }) : null,
            s.role === 'worker' && (live || s.status === 'finished') ? el('button', { class: 'small', text: 'Review', onclick: () => send('requestReview', { id: s.id }) }) : null,
            live ? el('button', { class: 'small', text: 'Mark done', onclick: () => send('markFinished', { id: s.id }) }) : null,
            live || s.status === 'queued' ? el('button', { class: 'small danger', text: 'Cancel', onclick: () => send('cancelSession', { id: s.id }) }) : null)
        );
      }))
    );
  }

  function render(state) {
    last = state;
    // Don't yank a dropdown/input out from under the user mid-edit.
    if (root.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName)) return;
    const running = state.sessions.filter(s => s.status === 'running').length;
    root.replaceChildren(...[
      el('h1', { text: 'Orchestrator' }),
      el('p', { class: 'sub', text: running + ' agent session' + (running === 1 ? '' : 's') + ' running. The orchestrator spreads work across your providers and stays below each one\'s limits so you are not rate-limited.' }),
      recoveryBanner(state),
      settingsBar(state.settings, state.providers),
      el('h2', { text: 'Provider capacity' }), capacity(state),
      el('div', { class: 'bar-row' }, el('h2', { text: 'Proposed plan', style: 'margin:18px 0 0' }), el('span', { class: 'grow' }),
        el('button', { class: 'primary', text: 'Run plan now', disabled: !state.plan.some(d => d.startsNow), onclick: () => send('runPlan') })),
      planTable(state),
      el('h2', { text: 'Sub-agent sessions' }), sessionTable(state)
    ].filter(Boolean));
  }

  setInterval(() => {
    if (!last) return;
    document.querySelectorAll('td[data-since]').forEach(td => {
      const since = +td.getAttribute('data-since');
      if (since) td.textContent = dur(Date.now() - since);
    });
  }, 1000);

  window.addEventListener('message', e => { if (e.data.type === 'state') render(e.data); });
  window.addEventListener('focusout', () => { if (last) setTimeout(() => render(last), 150); });
  vscode.postMessage({ type: 'ready' });
})();
