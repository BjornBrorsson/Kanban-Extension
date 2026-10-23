(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  let presets = [];
  const dirty = new Set();

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

  function field(label, input, help) {
    return el('label', {}, label, input, help ? el('span', { class: 'help', text: help }) : null);
  }

  function providerCard(p) {
    const f = {};
    const mark = () => { dirty.add(p.id); save.disabled = false; save.textContent = 'Save changes'; };
    const input = (key, type, value, extra) => {
      const i = el('input', Object.assign({ type, value: value ?? '' }, extra || {}));
      i.addEventListener('input', mark);
      f[key] = i;
      return i;
    };

    f.name = input('name', 'text', p.name, { class: 'name', placeholder: 'Display name' });
    f.account = input('account', 'text', p.account, { placeholder: 'e.g. work / personal', style: 'width:170px' });
    f.enabled = el('input', { type: 'checkbox' });
    f.enabled.checked = p.enabled;
    f.enabled.addEventListener('change', mark);

    f.command = el('textarea', { spellcheck: 'false' });
    f.command.value = p.command;
    f.command.addEventListener('input', mark);

    f.resumeCommand = el('textarea', { spellcheck: 'false', placeholder: 'Optional. e.g. claude --resume {session_id} -p "{task}"' });
    f.resumeCommand.value = p.resumeCommand || '';
    f.resumeCommand.addEventListener('input', mark);
    f.budgetDaily = input('budgetDaily', 'number', p.budgetDaily, { min: 0, step: '0.5' });
    f.budgetWeekly = input('budgetWeekly', 'number', p.budgetWeekly, { min: 0, step: '1' });
    f.budgetMonthly = input('budgetMonthly', 'number', p.budgetMonthly, { min: 0, step: '1' });
    f.listCommand = input('listCommand', 'text', p.listCommand, { placeholder: 'e.g. mytool models  (built in for devin, agy, ollama)' });
    f.agentic = el('input', { type: 'checkbox' });
    f.agentic.checked = p.agentic !== false;
    f.agentic.addEventListener('change', mark);
    f.pinned = input('pinnedModels', 'text', (p.pinnedModels || []).join(', '), { placeholder: 'e.g. swe-2-medium, fusion-claude-opus-5-5-high-sidekick-swe-2-medium' });
    f.modelTiers = input('modelTiers', 'text', p.modelTiers, { placeholder: 'opus=5, sonnet=4, haiku=2' });
    f.models = input('models', 'text', p.models.join(', '), { placeholder: 'comma separated, e.g. opus, sonnet, haiku' });
    // Default model is a real dropdown fed by the Models field (and refreshed as you type).
    f.defaultModel = el('select', {});
    const fillModels = () => {
      const list = f.models.value.split(',').map(s => s.trim()).filter(Boolean);
      const keep = f.defaultModel.dataset.value !== undefined ? f.defaultModel.dataset.value : p.defaultModel;
      f.defaultModel.replaceChildren(el('option', { value: '', text: list.length ? '(first model)' : '(none – add models first)' }),
        ...list.map(m => el('option', { value: m, text: m, selected: m === keep })));
      f.defaultModel.dataset.value = f.defaultModel.value;
    };
    f.models.addEventListener('input', fillModels);
    f.defaultModel.addEventListener('change', () => { f.defaultModel.dataset.value = f.defaultModel.value; mark(); });
    fillModels();
    f.modelFlag = input('modelFlag', 'text', p.modelFlag, { placeholder: '--model' });

    f.maxParallel = input('maxParallel', 'number', p.maxParallel, { min: 1, max: 32 });
    f.maxSessionsPerWindow = input('maxSessionsPerWindow', 'number', p.maxSessionsPerWindow, { min: 0 });
    f.windowMinutes = input('windowMinutes', 'number', p.windowMinutes, { min: 1 });
    f.minSpacingSeconds = input('minSpacingSeconds', 'number', p.minSpacingSeconds, { min: 0 });
    f.safetyMarginPct = input('safetyMarginPct', 'number', p.safetyMarginPct, { min: 0, max: 50 });
    f.workingDir = input('workingDir', 'text', p.workingDir, { placeholder: '{workspace_root}' });
    f.path = input('path', 'text', p.path, { placeholder: 'optional executable path' });

    const roleBox = r => {
      const c = el('input', { type: 'checkbox' });
      c.checked = p.roles.includes(r);
      c.addEventListener('change', mark);
      f['role_' + r] = c;
      return el('label', { class: 'inline' }, c, r);
    };

    const save = el('button', { class: 'primary small', text: 'Saved', disabled: true });
    save.addEventListener('click', () => {
      const models = f.models.value.split(',').map(s => s.trim()).filter(Boolean);
      const roles = ['worker', 'reviewer', 'orchestrator'].filter(r => f['role_' + r].checked);
      const out = {
        id: p.id, kind: p.kind, type: p.type,
        name: f.name.value, account: f.account.value, enabled: f.enabled.checked,
        command: f.command.value, resumeCommand: f.resumeCommand.value, modelTiers: f.modelTiers.value,
        pinnedModels: f.pinned.value.split(',').map(s => s.trim()).filter(Boolean),
        budgetDaily: +f.budgetDaily.value, budgetWeekly: +f.budgetWeekly.value, budgetMonthly: +f.budgetMonthly.value,
        listCommand: f.listCommand.value, agentic: f.agentic.checked, modelFlag: f.modelFlag.value,
        models, defaultModel: f.defaultModel.value,
        maxParallel: +f.maxParallel.value, maxSessionsPerWindow: +f.maxSessionsPerWindow.value,
        windowMinutes: +f.windowMinutes.value, minSpacingSeconds: +f.minSpacingSeconds.value,
        safetyMarginPct: +f.safetyMarginPct.value,
        workingDir: f.workingDir.value, path: f.path.value, prompt: p.prompt, roles
      };
      dirty.delete(p.id);
      vscode.postMessage({ type: 'saveProvider', provider: out });
    });

    const hasTask = p.command.includes('{task}');
    return el('div', { class: 'card' + (p.enabled ? '' : ' disabled'), 'data-id': p.id },
      el('div', { class: 'card-head' },
        f.enabled, f.name, f.account,
        el('span', { class: 'badge', text: p.kind }),
        el('span', { class: 'grow' }),
        save,
        el('button', { class: 'small', text: 'Import models', title: 'Copy a model list first (e.g. GitHub Copilot model-policy page), then click: only models marked Enabled are used', onclick: () => vscode.postMessage({ type: 'importModels', id: p.id }) }),
        el('button', { class: 'small', text: 'Detect', title: 'Find the executable path and installed models automatically', onclick: () => vscode.postMessage({ type: 'detectProvider', id: p.id }) }),
        el('button', { class: 'small', text: 'Duplicate', title: 'Same provider, another account', onclick: () => vscode.postMessage({ type: 'duplicateProvider', id: p.id }) }),
        el('button', { class: 'small danger', text: 'Delete', onclick: () => vscode.postMessage({ type: 'deleteProvider', id: p.id }) })
      ),
      el('div', { class: 'grid' },
        el('div', { class: 'wide' }, field('Command template', f.command,
          'Placeholders: {task} {model_args} {model} {ticket_path} {ticket_title} {ticket_id} {workspace_root}. ' +
          (hasTask ? '' : 'No {task}: this provider can only work on tickets (not review or plan).'))),
        el('div', { class: 'wide' }, field('Resume command (optional)', f.resumeCommand,
          'Continues an interrupted conversation via {session_id}. Without it, a resume re-runs the command with a "check the ticket and git state, then continue" prompt.')),
        el('div', { class: 'wide' }, field('Pinned models (always available)', f.pinned, 'Add model ids by hand (comma separated). They survive catalog refreshes even if hidden or missing, and the orchestrator considers them.')),
        field('Budget per day (USD, 0 = none)', f.budgetDaily, 'Orchestrator stays under this'),
        field('Budget per week (USD)', f.budgetWeekly),
        field('Budget per month (USD)', f.budgetMonthly),
        field('List command (optional)', f.listCommand, 'Prints this provider\'s models, one per line'),
        field('Model capability 1-5 (optional)', f.modelTiers, 'Used to pick a replacement when a model hits its usage limit'),
        field('Models', f.models, p.kind === 'ollama' ? 'Use Detect to list your installed Ollama models' : 'Shown in the Assign menu'),
        field('Default model', f.defaultModel, 'Pre-selected in the Assign menu'),
        field('Model flag', f.modelFlag, 'Builds {model_args}'),
        field('Max parallel sessions', f.maxParallel),
        field('Sessions per window (0 = no cap)', f.maxSessionsPerWindow, 'Your plan\'s rolling limit'),
        field('Window (minutes)', f.windowMinutes),
        field('Min seconds between starts', f.minSpacingSeconds),
        field('Safety margin %', f.safetyMarginPct, 'Headroom kept free'),
        field('Working directory', f.workingDir),
        field('Executable path', f.path, p.path ? '' : 'Empty = use PATH; Detect fills it in')
      ),
      el('div', { class: 'bar-row' }, 'Roles:', roleBox('worker'), roleBox('reviewer'), roleBox('orchestrator'),
        el('label', { class: 'inline', title: 'Unticked = answers only (e.g. plain ollama run): never given coding tickets automatically' }, f.agentic, 'can edit files (agentic)'))
    );
  }

  let showHidden = false;
  let lastCatalog = null;

  function renderCatalog(cat) {
    lastCatalog = cat;
    let host = document.getElementById('catalogHost');
    if (!host) {
      host = el('div', { id: 'catalogHost' });
      root.append(host);
    }
    const models = (cat && cat.models) || [];
    const shown = models.filter(m => !m.hidden);
    const hiddenN = models.length - shown.length;
    const when = cat && cat.generatedAt ? new Date(cat.generatedAt).toLocaleString() : 'never';
    const price = m => m.free ? 'free' : m.outPerM !== undefined && m.outPerM !== null ? '$' + (m.inPerM ?? '?') + ' / $' + m.outPerM + (m.priceSource === 'estimated' ? ' (est.)' : m.priceSource === 'reference' ? ' (ref.)' : '') : '?';
    const rows = (showHidden ? models : shown).map(m => el('tr', { style: m.hidden ? 'opacity:.55' : '' },
      el('td', { text: m.providerId }),
      el('td', { text: m.id }),
      el('td', {}, el('span', { class: 'badge', text: m.category })),
      el('td', { text: 'T' + m.tier }),
      el('td', { text: price(m) }),
      el('td', {}, m.hidden ? el('span', { class: 'note', text: m.reason || 'hidden' }) : (m.efforts && m.efforts.length ? el('span', { class: 'note', text: m.efforts.join(' / ') }) : null))));
    const toggle = el('input', { type: 'checkbox', onchange: () => { showHidden = toggle.checked; renderCatalog(lastCatalog); } });
    toggle.checked = showHidden;
    host.replaceChildren(...[
      el('h2', { text: 'Model catalog' }),
      el('p', { class: 'sub', text: models.length ? shown.length + ' shown, ' + hiddenN + ' hidden (newest ' + (cat.keep || 2) + ' versions of each family kept) \u00b7 updated ' + when + ' \u00b7 prices per 1M tokens (input / output); (est.) = estimated, (ref.) = borrowed from another provider. Override in pricing.overrides.json.' : 'Not generated yet. Click "Refresh models & prices".' }),
      models.length ? el('label', { class: 'inline' }, toggle, 'show hidden / superseded models') : null,
      models.length ? el('table', {}, el('thead', {}, el('tr', {}, ['Provider', 'Model', 'Category', 'Tier', 'Price', 'Notes'].map(h => el('th', { text: h })))), el('tbody', {}, rows)) : null
    ].filter(Boolean));
  }

  function render(state) {
    presets = state.presets;
    const list = document.getElementById('providerList') || (() => {
      const kindSel = el('select', { id: 'newKind' }, presets.map(p => el('option', { value: p.kind, text: p.label })));
      root.replaceChildren(
        el('h1', { text: 'Agent Providers' }),
        el('p', { class: 'sub', text: 'Configure the agents you can assign tickets to. Rename them, add several of the same kind (e.g. two Devin accounts), pick models and set parallel / rate-limit guards.' }),
        el('div', { class: 'bar-row' }, kindSel,
          el('button', { class: 'primary', text: '+ Add provider', onclick: () => vscode.postMessage({ type: 'addProvider', kindId: kindSel.value }) }),
          el('span', { class: 'grow' }),
          el('button', { text: 'Refresh models & prices', title: 'Ask every provider for its models (devin models list, agy models, Ollama...), then categorise, price and hide superseded ones', onclick: () => vscode.postMessage({ type: 'refreshModels', apply: false }) }),
          el('button', { text: 'Refresh + apply to providers', title: 'Also write the curated model list, default model and capability tiers into each provider', onclick: () => vscode.postMessage({ type: 'refreshModels', apply: true }) }),
          el('button', { text: 'Auto-detect installed agents', title: 'Scan PATH and common install folders, add missing providers, list Ollama models', onclick: () => vscode.postMessage({ type: 'detectAll' }) })),
        el('div', { id: 'providerList' })
      );
      return document.getElementById('providerList');
    })();

    renderCatalog(state.catalog);
    const existing = new Map(Array.from(list.children).map(c => [c.dataset.id, c]));
    const ids = state.providers.map(p => p.id);
    existing.forEach((node, id) => { if (!ids.includes(id)) node.remove(); });
    state.providers.forEach((p, i) => {
      const old = existing.get(p.id);
      let node = old;
      // Never clobber a card the user is editing.
      if (!old || !dirty.has(p.id)) node = providerCard(p);
      if (old && node !== old) old.replaceWith(node);
      else if (!old) list.append(node);
      if (list.children[i] !== node) list.insertBefore(node, list.children[i] || null);
    });
    if (!state.providers.length) {
      list.replaceChildren(el('div', { class: 'empty', text: 'No providers yet. Add one above.' }));
    } else if (list.querySelector('.empty')) {
      list.querySelector('.empty').remove();
    }
  }

  window.addEventListener('message', e => { if (e.data.type === 'state') render(e.data); });
  vscode.postMessage({ type: 'ready' });
})();
