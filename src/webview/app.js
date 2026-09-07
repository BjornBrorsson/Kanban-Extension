(function () {
  const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : { postMessage: console.log };

  // Error logging bridge to VS Code host
  window.onerror = function (message, source, lineno, colno, error) {
    vscode.postMessage({
      type: 'log',
      level: 'error',
      text: `Webview JS Error: ${message} (line ${lineno}:${colno})`
    });
  };

  window.addEventListener('unhandledrejection', function (event) {
    vscode.postMessage({
      type: 'log',
      level: 'error',
      text: `Webview Unhandled Rejection: ${event.reason}`
    });
  });

  // Persistent in-memory drag state
  let activeDragData = null; // { ticket, path, sourceColumn, sourceSubfolder }

  let state = {
    boards: [],
    currentBoard: null,
    overview: null,
    isOverview: false,
    searchQuery: '',
    selectedTag: '',
    selectedAssignee: '',
    selectedPriority: '',
    columnSubfolderFilter: {}, // colName -> subfolderName or null
    expandedGuides: {}, // colName -> boolean
    activeDragTicket: null,
    activeDetailTicket: null
  };

  // DOM Elements
  const boardSelect = document.getElementById('boardSelect');
  const btnBoardView = document.getElementById('btnBoardView');
  const btnOverviewView = document.getElementById('btnOverviewView');
  const btnPlanDoc = document.getElementById('btnPlanDoc');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const tagFilter = document.getElementById('tagFilter');
  const assigneeFilter = document.getElementById('assigneeFilter');
  const priorityFilter = document.getElementById('priorityFilter');
  const btnNewTicket = document.getElementById('btnNewTicket');
  const btnConfig = document.getElementById('btnConfig');
  const btnRefresh = document.getElementById('btnRefresh');

  const boardView = document.getElementById('boardView');
  const overviewView = document.getElementById('overviewView');
  const columnsContainer = document.getElementById('columnsContainer');

  // Overview DOM elements
  const statTotalBoards = document.getElementById('statTotalBoards');
  const statTotalTickets = document.getElementById('statTotalTickets');
  const statOngoingTickets = document.getElementById('statOngoingTickets');
  const statAssistanceTickets = document.getElementById('statAssistanceTickets');
  const statBlockedTickets = document.getElementById('statBlockedTickets');
  const parallelWorkContainer = document.getElementById('parallelWorkContainer');
  const projectBoardsGrid = document.getElementById('projectBoardsGrid');

  // Modal elements
  const newTicketModal = document.getElementById('newTicketModal');
  const closeNewTicketModal = document.getElementById('closeNewTicketModal');
  const btnCancelTicket = document.getElementById('btnCancelTicket');
  const btnSubmitTicket = document.getElementById('btnSubmitTicket');
  const newTicketTitle = document.getElementById('newTicketTitle');
  const newTicketColumn = document.getElementById('newTicketColumn');
  const newTicketSubfolder = document.getElementById('newTicketSubfolder');
  const newTicketPriority = document.getElementById('newTicketPriority');
  const newTicketAssignee = document.getElementById('newTicketAssignee');
  const newTicketSummary = document.getElementById('newTicketSummary');

  const ticketDetailModal = document.getElementById('ticketDetailModal');
  const closeDetailModal = document.getElementById('closeDetailModal');
  const modalBadges = document.getElementById('modalBadges');
  const modalDetailBody = document.getElementById('modalDetailBody');
  const btnOpenInEditor = document.getElementById('btnOpenInEditor');
  const btnCopyPromptModal = document.getElementById('btnCopyPromptModal');
  const btnAssignModal = document.getElementById('btnAssignModal');
  const assignModalBtnText = document.getElementById('assignModalBtnText');
  const btnRunInChatModal = document.getElementById('btnRunInChatModal');

  // Notify extension host that webview is ready
  vscode.postMessage({ type: 'ready' });

  // Listen for messages from extension host
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'state') {
      state.boards = message.boards || [];
      state.currentBoard = message.currentBoard || null;
      state.overview = message.overview || null;
      state.isOverview = !!message.isOverview;

      updateNavigation();
      if (state.isOverview) {
        renderOverview();
      } else {
        renderBoard();
      }
    }
  });

  // Event Listeners for Nav
  boardSelect.addEventListener('change', () => {
    const selectedId = boardSelect.value;
    if (selectedId) {
      vscode.postMessage({ type: 'switchBoard', boardId: selectedId });
    }
  });

  btnBoardView.addEventListener('click', () => {
    if (state.isOverview && state.boards.length > 0) {
      const targetId = state.currentBoard ? state.currentBoard.id : state.boards[0].id;
      vscode.postMessage({ type: 'switchBoard', boardId: targetId });
    }
  });

  btnOverviewView.addEventListener('click', () => {
    vscode.postMessage({ type: 'showOverview' });
  });

  btnPlanDoc.addEventListener('click', () => {
    if (state.currentBoard && state.currentBoard.planDocument) {
      vscode.postMessage({
        type: 'openPlan',
        filePath: state.currentBoard.planDocument.path
      });
    }
  });

  btnConfig.addEventListener('click', () => {
    if (state.currentBoard) {
      vscode.postMessage({ type: 'openConfig', boardId: state.currentBoard.id });
    }
  });

  btnRefresh.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  // Filter & Search
  searchInput.addEventListener('input', e => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
    filterBoardCards();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    filterBoardCards();
  });

  tagFilter.addEventListener('change', e => {
    state.selectedTag = e.target.value;
    filterBoardCards();
  });

  assigneeFilter.addEventListener('change', e => {
    state.selectedAssignee = e.target.value;
    filterBoardCards();
  });

  priorityFilter.addEventListener('change', e => {
    state.selectedPriority = e.target.value;
    filterBoardCards();
  });

  // Modal Triggers
  btnNewTicket.addEventListener('click', () => {
    openNewTicketModal();
  });

  closeNewTicketModal.addEventListener('click', () => {
    newTicketModal.style.display = 'none';
  });

  btnCancelTicket.addEventListener('click', () => {
    newTicketModal.style.display = 'none';
  });

  closeDetailModal.addEventListener('click', () => {
    ticketDetailModal.style.display = 'none';
  });

  btnOpenInEditor.addEventListener('click', () => {
    if (state.activeDetailTicket) {
      vscode.postMessage({
        type: 'openTicketFile',
        filePath: state.activeDetailTicket.path
      });
      ticketDetailModal.style.display = 'none';
    }
  });

  if (btnAssignModal) {
    btnAssignModal.addEventListener('click', e => {
      e.stopPropagation();
      if (state.activeDetailTicket) {
        showAssignMenu(btnAssignModal, state.activeDetailTicket);
      }
    });
  }

  if (btnCopyPromptModal) {
    btnCopyPromptModal.addEventListener('click', () => {
      if (state.activeDetailTicket) {
        vscode.postMessage({
          type: 'copyAgentPrompt',
          ticket: state.activeDetailTicket,
          boardId: state.currentBoard ? state.currentBoard.id : ''
        });
      }
    });
  }

  if (btnRunInChatModal) {
    btnRunInChatModal.addEventListener('click', () => {
      if (state.activeDetailTicket) {
        vscode.postMessage({
          type: 'runInChat',
          ticket: state.activeDetailTicket
        });
      }
    });
  }

  // Create Ticket Submit
  btnSubmitTicket.addEventListener('click', () => {
    const title = newTicketTitle.value.trim();
    if (!title) {
      newTicketTitle.focus();
      return;
    }

    if (!state.currentBoard) return;

    const column = newTicketColumn.value;
    const subfolder = newTicketSubfolder.value || null;
    const priority = newTicketPriority.value;
    const assignee = newTicketAssignee.value;
    const summary = newTicketSummary.value.trim();

    let initialContent = `# ${title}\n\n`;
    initialContent += `| Field | Value |\n|-------|-------|\n`;
    initialContent += `| **Priority** | ${priority} |\n`;
    initialContent += `| **Status** | ${column} |\n`;
    if (assignee) {
      initialContent += `| **Assignee** | ${assignee} |\n`;
    }
    initialContent += `| **Labels** | |\n\n`;

    if (summary) {
      initialContent += `## Summary\n${summary}\n\n`;
    } else {
      initialContent += `## Summary\n\n`;
    }

    initialContent += `## Acceptance Criteria\n- [ ] Requirements specified\n- [ ] Implemented\n- [ ] Tested\n`;

    vscode.postMessage({
      type: 'createTicket',
      boardId: state.currentBoard.id,
      targetColumn: column,
      targetSubfolder: subfolder,
      title,
      content: initialContent,
      openImmediately: true
    });

    newTicketModal.style.display = 'none';
  });

  newTicketColumn.addEventListener('change', () => {
    updateSubfoldersInNewTicketModal();
  });

  // -------------------------------------------------------------
  // RENDER FUNCTIONS
  // -------------------------------------------------------------

  function updateNavigation() {
    // Populate Board Selector
    boardSelect.innerHTML = '';
    state.boards.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      if (state.currentBoard && state.currentBoard.id === b.id) {
        opt.selected = true;
      }
      boardSelect.appendChild(opt);
    });

    // Toggle Buttons Active State
    if (state.isOverview) {
      btnBoardView.classList.remove('active');
      btnOverviewView.classList.add('active');
      boardSelect.disabled = true;
    } else {
      btnBoardView.classList.add('active');
      btnOverviewView.classList.remove('active');
      boardSelect.disabled = false;
    }

    // Plan button visibility
    if (!state.isOverview && state.currentBoard && state.currentBoard.planDocument) {
      btnPlanDoc.style.display = 'flex';
      btnPlanDoc.title = `Open Plan: ${state.currentBoard.planDocument.title}`;
    } else {
      btnPlanDoc.style.display = 'none';
    }

    // Update Filter Selects
    if (!state.isOverview && state.currentBoard) {
      const tags = new Set();
      const assignees = new Set();

      state.currentBoard.columns.forEach(col => {
        col.tickets.forEach(t => {
          t.labels.forEach(l => tags.add(l));
          if (t.assignee) assignees.add(t.assignee);
        });
      });

      // Populate tags
      const currentTag = tagFilter.value;
      tagFilter.innerHTML = '<option value="">All Tags</option>';
      Array.from(tags).sort().forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = tag;
        if (opt.value === currentTag) opt.selected = true;
        tagFilter.appendChild(opt);
      });

      // Populate assignees
      const currentAssignee = assigneeFilter.value;
      assigneeFilter.innerHTML = '<option value="">All Assignees</option>';
      Array.from(assignees).sort().forEach(ass => {
        const opt = document.createElement('option');
        opt.value = ass;
        opt.textContent = ass;
        if (opt.value === currentAssignee) opt.selected = true;
        assigneeFilter.appendChild(opt);
      });

      // Add assignees from config
      if (state.currentBoard.config && state.currentBoard.config.assignees) {
        state.currentBoard.config.assignees.forEach(a => {
          if (!assignees.has(a.name)) {
            const opt = document.createElement('option');
            opt.value = a.name;
            opt.textContent = a.name + (a.type === 'agent' ? ' 🤖' : ' 👤');
            assigneeFilter.appendChild(opt);
          }
        });
      }
    }
  }

  function renderBoard() {
    boardView.style.display = 'block';
    overviewView.style.display = 'none';
    columnsContainer.innerHTML = '';

    if (!state.currentBoard || !state.currentBoard.columns.length) {
      columnsContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
          <h3>No Columns Found</h3>
          <p>Create folders inside the board root to define Kanban columns.</p>
        </div>
      `;
      return;
    }

    state.currentBoard.columns.forEach(column => {
      const colEl = document.createElement('div');
      colEl.className = 'kanban-column';
      colEl.dataset.columnName = column.name;

      // Header
      const headerEl = document.createElement('div');
      headerEl.className = 'column-header';

      const headerTop = document.createElement('div');
      headerTop.className = 'column-header-top';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'col-title-wrap';

      const title = document.createElement('span');
      title.className = 'col-title';
      title.textContent = column.name;

      const badge = document.createElement('span');
      badge.className = 'col-count-badge';
      badge.textContent = column.tickets.length;

      titleWrap.appendChild(title);
      titleWrap.appendChild(badge);

      const colActions = document.createElement('div');
      colActions.className = 'col-actions';

      // Column Guidance Button (Whatwhy.md)
      if (column.whatWhyGuide) {
        const guideBtn = document.createElement('button');
        guideBtn.className = 'guide-icon-btn';
        guideBtn.title = 'Folder Guidance (Whatwhy.md)';
        guideBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        `;
        guideBtn.addEventListener('click', () => {
          state.expandedGuides[column.name] = !state.expandedGuides[column.name];
          const guidePanel = colEl.querySelector('.guide-panel');
          if (guidePanel) {
            guidePanel.style.display = state.expandedGuides[column.name] ? 'block' : 'none';
          }
        });
        colActions.appendChild(guideBtn);
      }

      headerTop.appendChild(titleWrap);
      headerTop.appendChild(colActions);
      headerEl.appendChild(headerTop);

      // Expandable guidance panel
      if (column.whatWhyGuide) {
        const guidePanel = document.createElement('div');
        guidePanel.className = 'guide-panel';
        guidePanel.textContent = column.whatWhyGuide;
        guidePanel.style.display = state.expandedGuides[column.name] ? 'block' : 'none';
        headerEl.appendChild(guidePanel);
      }

      colEl.appendChild(headerEl);

      // Subfolder Filters Bar
      if (column.subfolders && column.subfolders.length > 0) {
        const chipsBar = document.createElement('div');
        chipsBar.className = 'subfolder-chips-bar';

        const activeSubfolder = state.columnSubfolderFilter[column.name] || null;

        // "All" chip
        const allChip = document.createElement('span');
        allChip.className = `subfolder-chip ${activeSubfolder === null ? 'active' : ''}`;
        allChip.textContent = `All (${column.tickets.length})`;
        allChip.addEventListener('click', () => {
          state.columnSubfolderFilter[column.name] = null;
          renderBoard();
        });
        chipsBar.appendChild(allChip);

        // Individual subfolder chips
        column.subfolders.forEach(sub => {
          const chip = document.createElement('span');
          chip.className = `subfolder-chip ${activeSubfolder === sub.name ? 'active' : ''}`;
          chip.textContent = `${sub.name} (${sub.ticketCount})`;
          chip.title = sub.whatWhyGuide || sub.name;
          chip.addEventListener('click', () => {
            state.columnSubfolderFilter[column.name] = state.columnSubfolderFilter[column.name] === sub.name ? null : sub.name;
            renderBoard();
          });
          chipsBar.appendChild(chip);
        });

        colEl.appendChild(chipsBar);
      }

      // Cards Scroll Area (Drop target)
      const scrollArea = document.createElement('div');
      scrollArea.className = 'cards-scroll-area';
      scrollArea.dataset.columnName = column.name;

      setupDropZone(scrollArea, column.name, null);

      // If column has subfolders and a card is being dragged, show subfolder drop targets
      if (column.subfolders && column.subfolders.length > 0) {
        const subDropZonesWrap = document.createElement('div');
        subDropZonesWrap.className = 'subfolder-dropzones';
        subDropZonesWrap.style.display = 'none';

        column.subfolders.forEach(sub => {
          const zone = document.createElement('div');
          zone.className = 'subfolder-dropzone';
          zone.textContent = `Drop in: ${sub.name}`;
          setupDropZone(zone, column.name, sub.name);
          subDropZonesWrap.appendChild(zone);
        });

        scrollArea.appendChild(subDropZonesWrap);
      }

      // Set column dropzone
      setupDropZone(colEl, column.name, null);

      // Filter tickets for this column
      const activeSub = state.columnSubfolderFilter[column.name] || null;
      const visibleTickets = column.tickets.filter(t => {
        if (activeSub && t.subfolder !== activeSub) return false;
        return matchesSearchAndFilters(t);
      });

      visibleTickets.forEach(ticket => {
        const card = createTicketCardElement(ticket, column.name);
        scrollArea.appendChild(card);
      });

      colEl.appendChild(scrollArea);
      columnsContainer.appendChild(colEl);
    });
  }

  function renderOverview() {
    boardView.style.display = 'none';
    overviewView.style.display = 'flex';

    const overview = state.overview;
    if (!overview) return;

    statTotalBoards.textContent = overview.totalBoards;
    statTotalTickets.textContent = overview.totalTickets;
    statOngoingTickets.textContent = overview.ongoingTicketsCount;
    statAssistanceTickets.textContent = overview.assistanceRequiredCount;
    statBlockedTickets.textContent = overview.blockedTicketsCount;

    // Parallel Active Work Grid
    parallelWorkContainer.innerHTML = '';
    if (!overview.activeTickets || overview.activeTickets.length === 0) {
      parallelWorkContainer.innerHTML = `<div class="empty-state" style="padding: 20px;">No tickets currently ongoing or needing assistance.</div>`;
    } else {
      overview.activeTickets.forEach(({ ticket, boardId, boardName }) => {
        const card = document.createElement('div');
        card.className = 'parallel-card';
        card.innerHTML = `
          <div class="parallel-card-board">📂 ${boardName} &bull; ${ticket.column}</div>
          <div class="ticket-card-title">${ticket.title}</div>
          <div class="ticket-card-summary">${ticket.summary || 'No summary available.'}</div>
          <div class="ticket-card-footer">
            <span class="assignee-pill ${isAgentAssignee(ticket.assignee) ? 'agent' : ''}">
              ${isAgentAssignee(ticket.assignee) ? '🤖' : '👤'} ${ticket.assignee || 'Unassigned'}
            </span>
            <span class="priority-pill priority-${ticket.priority.toLowerCase()}">${ticket.priority}</span>
          </div>
        `;
        card.addEventListener('click', () => {
          vscode.postMessage({ type: 'switchBoard', boardId });
        });
        parallelWorkContainer.appendChild(card);
      });
    }

    // Project Boards Grid
    projectBoardsGrid.innerHTML = '';
    overview.boards.forEach(b => {
      const boardCard = document.createElement('div');
      boardCard.className = 'board-summary-card';

      let colsHtml = '';
      for (const [colName, count] of Object.entries(b.columnsSummary)) {
        colsHtml += `<span class="col-pill-badge"><strong>${colName}:</strong> ${count}</span>`;
      }

      boardCard.innerHTML = `
        <div class="board-card-header">
          <div class="board-card-name">${b.name}</div>
          <div class="col-count-badge">${b.ticketCount} tickets</div>
        </div>
        <div class="board-card-path">${b.rootPath}</div>
        <div class="board-cols-bar">${colsHtml}</div>
      `;

      boardCard.addEventListener('click', () => {
        vscode.postMessage({ type: 'switchBoard', boardId: b.id });
      });

      projectBoardsGrid.appendChild(boardCard);
    });
  }

  // -------------------------------------------------------------
  // ASSIGN MENU POPOVER
  // -------------------------------------------------------------
  let activeAssignPopover = null;

  function closeAssignMenu() {
    if (activeAssignPopover) {
      activeAssignPopover.remove();
      activeAssignPopover = null;
    }
  }

  document.addEventListener('click', e => {
    if (
      activeAssignPopover &&
      !activeAssignPopover.contains(e.target) &&
      !e.target.closest('[data-action="assign"]') &&
      !e.target.closest('.assignee-pill') &&
      !e.target.closest('#btnAssignModal') &&
      !e.target.closest('#detailAssigneeRow') &&
      !e.target.closest('.clickable-row')
    ) {
      closeAssignMenu();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAssignMenu();
    }
  });

  function showAssignMenu(anchorEl, ticket) {
    closeAssignMenu();
    let board = state.currentBoard;
    if (!board || !board.config) {
      if (state.boards && state.boards.length > 0) {
        board = state.boards.find(b => ticket.path && b.rootPath && ticket.path.toLowerCase().startsWith(b.rootPath.toLowerCase())) || state.boards[0];
      }
    }
    if (!board || !board.config) return;

    const popover = document.createElement('div');
    popover.className = 'assign-popover';

    const assignees = board.config.assignees || [];
    const agents = assignees.filter(a => a.type === 'agent');
    const humans = assignees.filter(a => a.type !== 'agent');

    let html = `
      <div class="assign-popover-header">
        <div class="assign-popover-title">Assign Ticket</div>
        <div class="assign-popover-subtitle">${ticket.title}</div>
      </div>
    `;

    // Agents section (Runs CLI in terminal)
    if (agents.length > 0) {
      html += `<div class="assign-section-title"><span>AI Agents</span> <span style="font-size:9.5px;color:#38bdf8;">(CLI in Terminal)</span></div>`;
      agents.forEach(agent => {
        const isCurrent =
          ticket.assignee &&
          (ticket.assignee.toLowerCase() === agent.name.toLowerCase() ||
            ticket.assignee.toLowerCase() === agent.id.toLowerCase());
        const cmdSummary =
          agent.agentConfig && agent.agentConfig.command
            ? agent.agentConfig.command.split(' ')[0]
            : 'CLI Agent';
        html += `
          <div class="assign-item ${isCurrent ? 'selected' : ''}" data-assign-type="agent" data-id="${agent.id}" data-name="${agent.name}">
            <div class="assign-item-icon">🤖</div>
            <div class="assign-item-info">
              <div class="assign-item-name">${agent.name}</div>
              <div class="assign-item-detail">${agent.description || cmdSummary}</div>
            </div>
            <span class="assign-item-badge">CLI</span>
          </div>
        `;
      });
    }

    // Humans section
    if (humans.length > 0) {
      html += `<div class="assign-section-title">Team Members</div>`;
      humans.forEach(human => {
        const isCurrent =
          ticket.assignee &&
          (ticket.assignee.toLowerCase() === human.name.toLowerCase() ||
            ticket.assignee.toLowerCase() === human.id.toLowerCase());
        html += `
          <div class="assign-item ${isCurrent ? 'selected' : ''}" data-assign-type="human" data-id="${human.id}" data-name="${human.name}">
            <div class="assign-item-icon">👤</div>
            <div class="assign-item-info">
              <div class="assign-item-name">${human.name}</div>
              <div class="assign-item-detail">${human.role || 'Human Developer'}</div>
            </div>
          </div>
        `;
      });
    }

    // Unassign option
    if (ticket.assignee) {
      html += `
        <div class="assign-item-divider"></div>
        <div class="assign-item unassign" data-assign-type="unassign">
          <div class="assign-item-icon">✕</div>
          <div class="assign-item-info">
            <div class="assign-item-name">Unassign Ticket</div>
          </div>
        </div>
      `;
    }

    popover.innerHTML = html;
    document.body.appendChild(popover);
    activeAssignPopover = popover;

    // Positioning
    const rect = anchorEl.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    const popoverHeight = popoverRect.height || 320;
    const popoverWidth = popoverRect.width || 300;

    let top = rect.bottom + 6;
    let left = rect.left;

    if (top + popoverHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - popoverHeight - 6);
    }

    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 12);
    }

    top = Math.max(12, Math.min(top, window.innerHeight - Math.min(popoverHeight, 400)));
    left = Math.max(12, Math.min(left, window.innerWidth - popoverWidth));

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    // Click events on popover items
    popover.querySelectorAll('.assign-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const type = item.dataset.assignType;
        const id = item.dataset.id;
        const name = item.dataset.name;

        closeAssignMenu();

        try {
          const boardId = board.id || (state.currentBoard ? state.currentBoard.id : '');
          if (type === 'unassign') {
            ticket.assignee = null;
            vscode.postMessage({
              type: 'assignTicket',
              boardId,
              ticketPath: ticket.path,
              ticketId: ticket.id,
              ticketTitle: ticket.title,
              assigneeId: '',
              assigneeName: '',
              runCli: false
            });
          } else if (type === 'agent') {
            ticket.assignee = name;
            vscode.postMessage({
              type: 'assignTicket',
              boardId,
              ticketPath: ticket.path,
              ticketId: ticket.id,
              ticketTitle: ticket.title,
              assigneeId: id || '',
              assigneeName: name || '',
              runCli: true
            });
          } else {
            ticket.assignee = name;
            vscode.postMessage({
              type: 'assignTicket',
              boardId,
              ticketPath: ticket.path,
              ticketId: ticket.id,
              ticketTitle: ticket.title,
              assigneeId: id || '',
              assigneeName: name || '',
              runCli: false
            });
          }
        } catch (err) {
          console.error('[Kanban Assign Error]', err);
          vscode.postMessage({
            type: 'log',
            level: 'error',
            text: `Assign click error: ${err && err.message ? err.message : err}`
          });
        }

        if (state.isOverview) {
          renderOverview();
        } else {
          renderBoard();
        }

        if (state.activeDetailTicket && state.activeDetailTicket.path === ticket.path) {
          openTicketDetailModal(ticket);
        }
      });
    });
  }

  // -------------------------------------------------------------
  // TICKET CARD COMPONENT & DRAG-AND-DROP
  // -------------------------------------------------------------

  function createTicketCardElement(ticket, columnName) {
    const card = document.createElement('div');
    card.className = 'ticket-card';
    card.draggable = true;
    card.dataset.ticketPath = ticket.path;
    card.dataset.column = columnName;
    card.dataset.subfolder = ticket.subfolder || '';

    // Drag events
    card.addEventListener('dragstart', e => {
      activeDragData = {
        ticket: ticket,
        path: ticket.path,
        column: columnName,
        subfolder: ticket.subfolder || null
      };
      state.activeDragTicket = ticket;
      window.__activeDragData = activeDragData;

      card.classList.add('dragging');
      document.body.classList.add('is-dragging-card');
      if (e.dataTransfer) {
        try {
          e.dataTransfer.setData('text/plain', ticket.path);
          e.dataTransfer.effectAllowed = 'move';
        } catch {}
      }

      // Show subfolder dropzones in columns
      document.querySelectorAll('.subfolder-dropzones').forEach(el => el.style.display = 'flex');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.body.classList.remove('is-dragging-card');
      document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
      document.querySelectorAll('.cards-scroll-area').forEach(c => c.classList.remove('drag-over'));
      document.querySelectorAll('.subfolder-dropzones').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.subfolder-dropzone').forEach(el => el.classList.remove('drag-hover'));

      // Keep activeDragData alive for 500ms so handleDrop can read it if dragend fired first
      setTimeout(() => {
        activeDragData = null;
        state.activeDragTicket = null;
        window.__activeDragData = null;
      }, 500);
    });

    // Click -> detail modal
    card.addEventListener('click', e => {
      if (e.target.closest('.card-action-btn') || e.target.closest('.assignee-pill')) return;
      openTicketDetailModal(ticket);
    });

    // Double-click -> open file
    card.addEventListener('dblclick', () => {
      vscode.postMessage({ type: 'openTicketFile', filePath: ticket.path });
    });

    // Priority pill class
    const priorityClass = `priority-${ticket.priority.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    // Acceptance Criteria progress
    let progressHtml = '';
    if (ticket.progress.total > 0) {
      const pct = Math.round((ticket.progress.done / ticket.progress.total) * 100);
      progressHtml = `
        <div class="ticket-progress-wrap">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${pct}%"></div>
          </div>
          <span>${ticket.progress.done}/${ticket.progress.total}</span>
        </div>
      `;
    }

    // Labels
    let labelsHtml = '';
    if (ticket.labels && ticket.labels.length > 0) {
      labelsHtml = `<div class="ticket-labels-wrap">` +
        ticket.labels.slice(0, 3).map(l => `<span class="ticket-label">${l}</span>`).join('') +
        (ticket.labels.length > 3 ? `<span class="ticket-label">+${ticket.labels.length - 3}</span>` : '') +
        `</div>`;
    }

    // Assignee Pill (Interactive)
    const isAgent = isAgentAssignee(ticket.assignee);
    const assigneeHtml = ticket.assignee ? `
      <span class="assignee-pill ${isAgent ? 'agent' : ''}" title="Click to assign or re-assign">
        ${isAgent ? '🤖' : '👤'} ${ticket.assignee}
      </span>
    ` : `
      <span class="assignee-pill unassigned" title="Click to assign">+ Assign</span>
    `;

    // Subfolder tag
    const subfolderHtml = ticket.subfolder ? `
      <span class="subfolder-tag">📁 ${ticket.subfolder}</span>
    ` : '';

    // Orchestration attempt badge
    let attemptBadgeHtml = '';
    if (ticket.attemptState) {
      const statusClass = `attempt-${(ticket.attemptState.status || '').toLowerCase()}`;
      attemptBadgeHtml = `
        <span class="attempt-badge ${statusClass}" title="Attempt #${ticket.attemptState.generation}: ${ticket.attemptState.status} (${ticket.attemptState.tier})">
          ⚙ ${ticket.attemptState.status} #${ticket.attemptState.generation}
        </span>
      `;
    }

    card.innerHTML = `
      <div class="ticket-card-top">
        <div class="ticket-badges-left">
          <span class="ticket-id-badge">${ticket.id}</span>
          <span class="priority-pill ${priorityClass}">${ticket.priority}</span>
          ${attemptBadgeHtml}
          ${subfolderHtml}
        </div>
        <div class="card-hover-actions">
          <button class="card-action-btn copy-prompt-btn" title="Copy Agent Task Prompt" data-action="copy-prompt">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          </button>
          <button class="card-action-btn run-chat-btn" title="Run in IDE Chat" data-action="run-chat">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button class="card-action-btn assign-btn" title="Assign Ticket (Human or Agent CLI)" data-action="assign">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <line x1="19" y1="8" x2="19" y2="14"></line>
              <line x1="22" y1="11" x2="16" y2="11"></line>
            </svg>
          </button>
          <button class="card-action-btn" title="Open Markdown File" data-action="open-file">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="ticket-card-title">${ticket.title}</div>
      ${ticket.summary ? `<div class="ticket-card-summary">${ticket.summary}</div>` : ''}
      ${progressHtml}
      ${labelsHtml}

      <div class="ticket-card-footer">
        ${assigneeHtml}
        ${ticket.estimate ? `<span style="font-size:10.5px;color:var(--text-muted);">⏱ ${ticket.estimate}</span>` : ''}
      </div>
    `;

    // Action button listeners
    const copyPromptBtn = card.querySelector('[data-action="copy-prompt"]');
    if (copyPromptBtn) {
      copyPromptBtn.addEventListener('click', e => {
        e.stopPropagation();
        vscode.postMessage({
          type: 'copyAgentPrompt',
          ticket,
          boardId: state.currentBoard ? state.currentBoard.id : ''
        });
      });
    }

    const runChatBtn = card.querySelector('[data-action="run-chat"]');
    if (runChatBtn) {
      runChatBtn.addEventListener('click', e => {
        e.stopPropagation();
        vscode.postMessage({ type: 'runInChat', ticket });
      });
    }

    const assignBtn = card.querySelector('[data-action="assign"]');
    if (assignBtn) {
      assignBtn.addEventListener('click', e => {
        e.stopPropagation();
        showAssignMenu(assignBtn, ticket);
      });
    }

    const pill = card.querySelector('.assignee-pill');
    if (pill) {
      pill.addEventListener('click', e => {
        e.stopPropagation();
        showAssignMenu(pill, ticket);
      });
    }

    const openFileBtn = card.querySelector('[data-action="open-file"]');
    if (openFileBtn) {
      openFileBtn.addEventListener('click', e => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openTicketFile', filePath: ticket.path });
      });
    }

    // Also register card as a dropzone for its column so dropping on cards works
    setupDropZone(card, columnName, null);

    return card;
  }

  function setupDropZone(element, targetColumn, targetSubfolder) {
    element.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      if (targetSubfolder) {
        element.classList.add('drag-hover');
      } else {
        const col = element.closest('.kanban-column');
        if (col) col.classList.add('drag-over');
      }
    });

    element.addEventListener('dragenter', e => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    });

    element.addEventListener('dragleave', e => {
      if (targetSubfolder) {
        element.classList.remove('drag-hover');
      } else {
        const col = element.closest('.kanban-column');
        if (col && !col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over');
        }
      }
    });

    element.addEventListener('drop', e => {
      handleDrop(e, targetColumn, targetSubfolder);
    });
  }

  function handleDrop(e, targetColumn, targetSubfolder) {
    e.preventDefault();
    e.stopPropagation();

    document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
    document.querySelectorAll('.cards-scroll-area').forEach(c => c.classList.remove('drag-over'));
    document.querySelectorAll('.subfolder-dropzone').forEach(el => el.classList.remove('drag-hover'));
    document.querySelectorAll('.subfolder-dropzones').forEach(el => el.style.display = 'none');
    document.body.classList.remove('is-dragging-card');

    const dragInfo = activeDragData || window.__activeDragData || (state.activeDragTicket ? {
      ticket: state.activeDragTicket,
      path: state.activeDragTicket.path,
      column: state.activeDragTicket.column,
      subfolder: state.activeDragTicket.subfolder || null
    } : null);

    let ticketPath = '';
    if (e.dataTransfer) {
      try {
        ticketPath = e.dataTransfer.getData('text/plain');
      } catch {}
    }
    if (!ticketPath && dragInfo) {
      ticketPath = dragInfo.path;
    }

    if (!ticketPath || !state.currentBoard || !targetColumn) {
      console.warn('[Kanban DragDrop] Drop canceled, missing path or column:', { ticketPath, targetColumn });
      return;
    }

    // Check if dropped back into same column and subfolder
    const sourceCol = dragInfo ? dragInfo.column : (state.activeDragTicket ? state.activeDragTicket.column : null);
    const sourceSub = dragInfo ? dragInfo.subfolder : (state.activeDragTicket ? (state.activeDragTicket.subfolder || null) : null);
    if (sourceCol === targetColumn && (sourceSub || null) === (targetSubfolder || null)) {
      return; // Dropped back in same column/subfolder
    }

    // Calculate destination filesystem path
    const filename = ticketPath.replace(/^.*[\\\/]/, '');
    const sep = state.currentBoard.rootPath.includes('\\') ? '\\' : '/';
    let newDir = state.currentBoard.rootPath + sep + targetColumn;
    if (targetSubfolder) {
      newDir += sep + targetSubfolder;
    }
    const newTicketPath = newDir + sep + filename;

    // Optimistic UI move
    let movedTicket = dragInfo ? dragInfo.ticket : state.activeDragTicket;
    if (state.currentBoard && state.currentBoard.columns) {
      for (const col of state.currentBoard.columns) {
        const idx = col.tickets.findIndex(t => t.path === ticketPath || t.path.toLowerCase() === ticketPath.toLowerCase());
        if (idx !== -1) {
          movedTicket = col.tickets.splice(idx, 1)[0];
          break;
        }
      }

      if (movedTicket) {
        movedTicket.column = targetColumn;
        movedTicket.subfolder = targetSubfolder || null;
        movedTicket.status = targetColumn;
        movedTicket.path = newTicketPath; // Crucial: update ticket path in memory!

        const targetCol = state.currentBoard.columns.find(c => c.name === targetColumn);
        if (targetCol) {
          targetCol.tickets.push(movedTicket);
        }
        renderBoard();
      }
    }

    // Clear active drag data
    activeDragData = null;
    state.activeDragTicket = null;
    window.__activeDragData = null;

    // Send move message to VS Code host
    vscode.postMessage({
      type: 'moveTicket',
      boardId: state.currentBoard.id,
      ticketPath,
      targetColumn,
      targetSubfolder: targetSubfolder || null
    });
  }

  // -------------------------------------------------------------
  // FILTERING & SEARCH
  // -------------------------------------------------------------

  function filterBoardCards() {
    renderBoard();
  }

  function matchesSearchAndFilters(ticket) {
    // Search query
    if (state.searchQuery) {
      const q = state.searchQuery;
      const idMatch = ticket.id.toLowerCase().includes(q);
      const titleMatch = ticket.title.toLowerCase().includes(q);
      const summaryMatch = ticket.summary.toLowerCase().includes(q);
      const epicMatch = ticket.epic && ticket.epic.toLowerCase().includes(q);
      const labelMatch = ticket.labels.some(l => l.toLowerCase().includes(q));
      if (!idMatch && !titleMatch && !summaryMatch && !epicMatch && !labelMatch) {
        return false;
      }
    }

    // Tag filter
    if (state.selectedTag && !ticket.labels.includes(state.selectedTag)) {
      return false;
    }

    // Assignee filter
    if (state.selectedAssignee && ticket.assignee !== state.selectedAssignee) {
      return false;
    }

    // Priority filter
    if (state.selectedPriority) {
      const p = ticket.priority.toLowerCase();
      const sp = state.selectedPriority.toLowerCase();
      if (!p.includes(sp)) return false;
    }

    return true;
  }

  // -------------------------------------------------------------
  // MODALS
  // -------------------------------------------------------------

  function openNewTicketModal() {
    if (!state.currentBoard) return;

    newTicketTitle.value = '';
    newTicketSummary.value = '';

    // Populate columns
    newTicketColumn.innerHTML = '';
    state.currentBoard.columns.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      newTicketColumn.appendChild(opt);
    });

    updateSubfoldersInNewTicketModal();

    // Populate assignees
    newTicketAssignee.innerHTML = '<option value="">(Unassigned)</option>';
    if (state.currentBoard.config && state.currentBoard.config.assignees) {
      state.currentBoard.config.assignees.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name;
        opt.textContent = a.name + (a.type === 'agent' ? ' (Agent)' : ' (Human)');
        newTicketAssignee.appendChild(opt);
      });
    }

    newTicketModal.style.display = 'flex';
    newTicketTitle.focus();
  }

  function updateSubfoldersInNewTicketModal() {
    if (!state.currentBoard) return;
    const selectedCol = newTicketColumn.value;
    const col = state.currentBoard.columns.find(c => c.name === selectedCol);

    newTicketSubfolder.innerHTML = '<option value="">(None - Column Root)</option>';
    if (col && col.subfolders && col.subfolders.length > 0) {
      col.subfolders.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = s.name;
        newTicketSubfolder.appendChild(opt);
      });
    }
  }

  function openTicketDetailModal(ticket) {
    state.activeDetailTicket = ticket;

    // Badges in header
    modalBadges.innerHTML = `
      <span class="ticket-id-badge">${ticket.id}</span>
      <span class="priority-pill priority-${ticket.priority.toLowerCase().replace(/[^a-z0-9]/g, '')}">${ticket.priority}</span>
      <span class="col-count-badge">${ticket.column}${ticket.subfolder ? ' / ' + ticket.subfolder : ''}</span>
    `;

    // Body content
    let fieldsHtml = `
      <table class="detail-table">
        ${ticket.epic ? `<tr><td>Epic</td><td>${ticket.epic}</td></tr>` : ''}
        ${ticket.type ? `<tr><td>Type</td><td>${ticket.type}</td></tr>` : ''}
        ${ticket.status ? `<tr><td>Status</td><td>${ticket.status}</td></tr>` : ''}
        ${ticket.estimate ? `<tr><td>Estimate</td><td>${ticket.estimate}</td></tr>` : ''}
        ${ticket.milestone ? `<tr><td>Milestone</td><td>${ticket.milestone}</td></tr>` : ''}
        <tr class="clickable-row" id="detailAssigneeRow" style="cursor:pointer;" title="Click to assign or re-assign">
          <td>Assignee</td>
          <td>${ticket.assignee ? `<span class="assignee-pill ${isAgentAssignee(ticket.assignee) ? 'agent' : ''}">${isAgentAssignee(ticket.assignee) ? '🤖' : '👤'} ${ticket.assignee}</span>` : '<span class="assignee-pill unassigned">+ Assign</span>'}</td>
        </tr>
        ${ticket.dependsOn.length ? `<tr><td>Depends on</td><td>${ticket.dependsOn.join(', ')}</td></tr>` : ''}
        ${ticket.blocks.length ? `<tr><td>Blocks</td><td>${ticket.blocks.join(', ')}</td></tr>` : ''}
        ${ticket.labels.length ? `<tr><td>Labels</td><td>${ticket.labels.map(l => `<span class="ticket-label">${l}</span>`).join(' ')}</td></tr>` : ''}
      </table>
    `;

    let checklistHtml = '';
    if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
      checklistHtml = `
        <h4 style="margin-top:14px;margin-bottom:6px;font-size:12.5px;color:var(--text-main);">Acceptance Criteria (${ticket.progress.done}/${ticket.progress.total})</h4>
        <div class="checklist-container">
          ${ticket.acceptanceCriteria.map(item => `
            <div class="checklist-item">
              <input type="checkbox" ${item.done ? 'checked' : ''} disabled />
              <span>${item.text}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    let evidenceHtml = '';
    if (ticket.attemptState) {
      const att = ticket.attemptState;
      const statusClass = `attempt-${(att.status || '').toLowerCase()}`;
      evidenceHtml = `
        <div class="evidence-drawer-section" style="margin-top:14px;border-top:1px solid var(--border-subtle);padding-top:10px;">
          <div style="font-size:12.5px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
            <span>🔍 Orchestration Attempt</span>
            <span class="attempt-badge ${statusClass}">Attempt #${att.generation} — ${att.status} (${att.tier})</span>
          </div>
          ${att.patch ? `
            <div style="margin-bottom:8px;">
              <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--text-muted);">Unified Diff / Patch</div>
              <pre class="diff-viewer" style="background:var(--bg-primary);padding:8px;border-radius:4px;font-size:11px;overflow-x:auto;max-height:180px;border:1px solid var(--border-subtle);">${escapeHtml(att.patch)}</pre>
            </div>
          ` : ''}
          ${att.evidence && att.evidence.length > 0 ? `
            <div style="margin-bottom:8px;">
              <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--text-muted);">Verification Checks</div>
              ${att.evidence.map(ev => `
                <div style="font-size:11px;background:var(--bg-primary);padding:6px;border-radius:4px;margin-bottom:4px;border:1px solid var(--border-subtle);">
                  <div style="display:flex;justify-content:space-between;">
                    <code>${escapeHtml(ev.command)}</code>
                    <span style="color:${ev.exitCode === 0 ? '#4ade80' : '#f87171'};font-weight:600;">Exit: ${ev.exitCode}</span>
                  </div>
                  <pre style="margin:4px 0 0 0;font-size:10.5px;color:var(--text-muted);">${escapeHtml(ev.output)}</pre>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${att.handoff ? `
            <div style="margin-bottom:8px;font-size:11px;background:var(--bg-primary);padding:6px;border-radius:4px;border:1px solid var(--border-subtle);">
              <div style="font-weight:600;margin-bottom:2px;color:var(--text-muted);">Lead ➔ Worker Delegation</div>
              <div><strong>Scope:</strong> <code>${escapeHtml(att.handoff.allowedScope ? att.handoff.allowedScope.join(', ') : 'All')}</code></div>
              <div><strong>Next Action:</strong> ${escapeHtml(att.handoff.nextSuggestedAction || 'Implement changes')}</div>
            </div>
          ` : ''}
          ${att.escalation ? `
            <div style="margin-bottom:8px;font-size:11px;background:rgba(239, 68, 68, 0.1);padding:6px;border-radius:4px;border:1px solid #ef4444;">
              <div style="font-weight:600;margin-bottom:2px;color:#ef4444;">Worker ➔ Lead Escalation (${escapeHtml(att.escalation.triggerType || '')})</div>
              <div>${escapeHtml(att.escalation.message || '')}</div>
              ${att.escalation.resolutionStrategy ? `<div><strong>Strategy:</strong> ${escapeHtml(att.escalation.resolutionStrategy)}</div>` : ''}
            </div>
          ` : ''}
          ${att.reviewDecision ? `
            <div style="margin-bottom:8px;font-size:11px;background:rgba(74, 222, 128, 0.08);padding:6px;border-radius:4px;border:1px solid #4ade80;">
              <div style="font-weight:600;margin-bottom:2px;color:#4ade80;">Fresh Lead Review: ${att.reviewDecision.approved ? 'Approved ✓' : 'Changes Requested ✗'}</div>
              <div>${escapeHtml(att.reviewDecision.feedback || '')}</div>
            </div>
          ` : ''}
          ${att.failureReason ? `<div style="font-size:11.5px;color:#f87171;margin-top:4px;"><strong>Failure Reason:</strong> ${escapeHtml(att.failureReason)}</div>` : ''}
        </div>
      `;
    }

    modalDetailBody.innerHTML = `
      <div class="detail-modal-title">${ticket.title}</div>
      ${fieldsHtml}
      ${ticket.summary ? `<div style="margin: 10px 0;"><h4 style="font-size:12.5px;margin-bottom:4px;">Summary</h4><p style="font-size:12px;color:var(--text-muted);">${ticket.summary}</p></div>` : ''}
      ${checklistHtml}
      ${evidenceHtml}
    `;

    // Make detail modal assignee row clickable
    const detailAssigneeRow = modalDetailBody.querySelector('#detailAssigneeRow');
    if (detailAssigneeRow) {
      detailAssigneeRow.addEventListener('click', e => {
        e.stopPropagation();
        showAssignMenu(detailAssigneeRow, ticket);
      });
    }

    // Configure Assign button in footer
    if (btnAssignModal && assignModalBtnText) {
      assignModalBtnText.textContent = ticket.assignee ? `Assigned: ${ticket.assignee}` : 'Assign...';
    }

    ticketDetailModal.style.display = 'flex';
  }

  // -------------------------------------------------------------
  // HELPER UTILITIES
  // -------------------------------------------------------------

  function isAgentAssignee(assigneeName) {
    if (!assigneeName) return false;
    let assignees = [];
    if (state.currentBoard && state.currentBoard.config && state.currentBoard.config.assignees) {
      assignees = state.currentBoard.config.assignees;
    } else if (state.boards) {
      for (const b of state.boards) {
        if (b.config && b.config.assignees) {
          assignees.push(...b.config.assignees);
        }
      }
    }
    const a = assignees.find(
      x => x.name.toLowerCase() === assigneeName.toLowerCase() || x.id.toLowerCase() === assigneeName.toLowerCase()
    );
    return a ? a.type === 'agent' : false;
  }

  function findAgentForTicket(ticket) {
    let assignees = [];
    if (state.currentBoard && state.currentBoard.config && state.currentBoard.config.assignees) {
      assignees = state.currentBoard.config.assignees;
    } else if (state.boards) {
      const b = state.boards.find(x => ticket.path && x.rootPath && ticket.path.toLowerCase().startsWith(x.rootPath.toLowerCase()));
      if (b && b.config && b.config.assignees) {
        assignees = b.config.assignees;
      }
    }

    // Check if ticket's assigned user is an agent
    if (ticket.assignee) {
      const found = assignees.find(
        a => a.type === 'agent' && (a.name.toLowerCase() === ticket.assignee.toLowerCase() || a.id.toLowerCase() === ticket.assignee.toLowerCase())
      );
      if (found) return found;
    }

    // Otherwise check default agent
    const defaultAgentId = state.currentBoard && state.currentBoard.config ? state.currentBoard.config.defaultAgent : null;
    if (defaultAgentId) {
      const defaultAgent = assignees.find(a => a.type === 'agent' && a.id === defaultAgentId);
      if (defaultAgent) return defaultAgent;
    }

    return null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
