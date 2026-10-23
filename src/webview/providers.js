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

    f.models = input('models', 'text', p.models.join(', '), { placeholder: 'comma separated, e.g. opus, sonnet, haiku' });
    f.defaultModel = input('defaultModel', 'text', p.defaultModel, { placeholder: 'used when none is picked' });
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
        command: f.command.value, modelFlag: f.modelFlag.value,
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
        el('button', { class: 'small', text: 'Duplicate', title: 'Same provider, another account', onclick: () => vscode.postMessage({ type: 'duplicateProvider', id: p.id }) }),
        el('button', { class: 'small danger', text: 'Delete', onclick: () => vscode.postMessage({ type: 'deleteProvider', id: p.id }) })
      ),
      el('div', { class: 'grid' },
        el('div', { class: 'wide' }, field('Command template', f.command,
          'Placeholders: {task} {model_args} {model} {ticket_path} {ticket_title} {ticket_id} {workspace_root}. ' +
          (hasTask ? '' : 'No {task}: this provider can only work on tickets (not review or plan).'))),
        field('Models', f.models, 'Shown in the Assign menu'),
        field('Default model', f.defaultModel),
        field('Model flag', f.modelFlag, 'Builds {model_args}'),
        field('Max parallel sessions', f.maxParallel),
        field('Sessions per window (0 = no cap)', f.maxSessionsPerWindow, 'Your plan\'s rolling limit'),
        field('Window (minutes)', f.windowMinutes),
        field('Min seconds between starts', f.minSpacingSeconds),
        field('Safety margin %', f.safetyMarginPct, 'Headroom kept free'),
        field('Working directory', f.workingDir),
        field('Executable path', f.path)
      ),
      el('div', { class: 'bar-row' }, 'Roles:', roleBox('worker'), roleBox('reviewer'), roleBox('orchestrator'))
    );
  }

  function render(state) {
    presets = state.presets;
    const list = document.getElementById('providerList') || (() => {
      const kindSel = el('select', { id: 'newKind' }, presets.map(p => el('option', { value: p.kind, text: p.label })));
      root.replaceChildren(
        el('h1', { text: 'Agent Providers' }),
        el('p', { class: 'sub', text: 'Configure the agents you can assign tickets to. Rename them, add several of the same kind (e.g. two Devin accounts), pick models and set parallel / rate-limit guards.' }),
        el('div', { class: 'bar-row' }, kindSel,
          el('button', { class: 'primary', text: '+ Add provider', onclick: () => vscode.postMessage({ type: 'addProvider', kindId: kindSel.value }) })),
        el('div', { id: 'providerList' })
      );
      return document.getElementById('providerList');
    })();

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
