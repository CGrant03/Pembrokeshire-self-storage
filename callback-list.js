(function () {
  'use strict';

  const STATUSES = {
    to_call: 'To call',
    waiting_list: 'Waiting list',
    waiting_reply: 'Waiting on reply',
    booked: 'Booked',
    closed: 'Closed',
  };
  const BUSINESSES = ['Pembrokeshire Self Storage', 'Miles John Williams Limited'];
  const state = { rows: [], loaded: false, editing: null, busy: false };
  const el = id => document.getElementById(id);
  const field = key => el('cbForm').elements.namedItem(key);
  const clean = value => (value || '').trim();
  const textNode = (tag, value, cls) => {
    const node = document.createElement(tag);
    node.textContent = value || '';
    if (cls) node.className = cls;
    return node;
  };
  const londonToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(new Date());
  const prettyDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';
  const notify = (message, error = false) => {
    const note = el('cbMessage');
    if (!note) return;
    note.textContent = message || '';
    note.classList.toggle('cb-error', error);
  };

  function makeUI() {
    const app = el('app');
    const stats = app?.querySelector('.stats');
    const toolbar = app?.firstElementChild?.lastElementChild;
    if (!app || !stats || !toolbar || el('cbPanel')) return;

    const css = document.createElement('style');
    css.textContent = `
      .cb-page-header{flex-wrap:wrap}
      .cb-shortcut{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;border-left:5px solid #e9bb58;margin-top:18px}
      .cb-shortcut h2{margin:0 0 7px;font-size:23px}
      .cb-shortcut p{margin:0;line-height:1.5}
      .cb-shortcut .btn{min-height:48px;font-size:16px}
      @media(max-width:650px){.cb-page-header>div{width:100%}.cb-page-header>div:last-child{justify-content:flex-start!important}.cb-shortcut .btn{width:100%}}
      .cb-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0}
      .cb-panel{border-top:4px solid #e9bb58}
      .cb-panel h2{margin:0 0 6px}
      .cb-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .cb-field{display:flex;flex-direction:column;gap:6px;margin:4px 0;font-weight:700;font-size:15px}
      .cb-field input,.cb-field select,.cb-field textarea,.cb-toolbar input,.cb-toolbar select{font:inherit;font-weight:400;padding:11px;border:1px solid #bbcbd4;border-radius:8px;background:#fff;max-width:100%}
      .cb-field textarea{min-height:90px;resize:vertical}
      .cb-wide{grid-column:1/-1}
      .cb-actions{display:flex;flex-wrap:wrap;gap:9px;margin:16px 0}
      .cb-status{font-size:14px;font-weight:700;padding:5px 10px;border-radius:999px;background:#eaf1f7;color:#173a63}
      .cb-to_call{background:#fff2d9;color:#81551c}
      .cb-waiting_list{background:#e7efff;color:#284a90}
      .cb-booked{background:#e4f5e9;color:#196439}
      .cb-closed{background:#f0f1f3;color:#59636e}
      .cb-counts{display:flex;flex-wrap:wrap;gap:9px;margin:15px 0}
      .cb-counts span{padding:10px 14px;border:1px solid #dce5ec;border-radius:10px;background:#f7fafc}
      .cb-list{display:grid;gap:12px}
      .cb-item{border:1px solid #dbe4ea;border-radius:12px;padding:16px;background:#fff}
      .cb-item-head{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center}
      .cb-item h3{margin:0;font-size:19px}
      .cb-item p{margin:8px 0;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
      .cb-item small{color:#536c7c;font-size:14px}
      .cb-item a{color:#063d64;font-weight:700}
      .cb-overdue{color:#ad2727;font-weight:700}
      .cb-error{color:#a52828!important}
      .cb-message{font-weight:700;min-height:20px;color:#17537b}
      .cb-quiet{color:#5b6c7a}
      @media(max-width:650px){.cb-fields{grid-template-columns:1fr}.cb-toolbar>*{width:100%}.cb-item-head{align-items:flex-start}}
    `;
    document.head.appendChild(css);

    const openButton = document.createElement('button');
    openButton.className = 'btn btn2';
    openButton.type = 'button';
    openButton.id = 'cbOpen';
    openButton.textContent = 'Callbacks';
    openButton.setAttribute('aria-controls', 'cbPanel');
    openButton.setAttribute('aria-expanded', 'false');
    app.firstElementChild.classList.add('cb-page-header');
    openButton.textContent = 'Open callbacks & waiting list';
    const shortcut = document.createElement('section');
    shortcut.className = 'card cb-shortcut';
    const introduction = document.createElement('div');
    introduction.innerHTML = '<h2>Callbacks &amp; waiting list</h2><p class="muted">Save phone calls, follow-up dates and waiting-list enquiries here.</p>';
    shortcut.append(introduction, openButton);
    stats.before(shortcut);

    const panel = document.createElement('section');
    panel.id = 'cbPanel';
    panel.className = 'card cb-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <h2>Callbacks &amp; waiting list</h2>
      <p class="muted">Private call notes and reminders. Kept separately from paying customers and rental records.</p>
      <div id="cbCounts" class="cb-counts" aria-live="polite"></div>
      <div class="cb-actions">
        <button type="button" class="btn" id="cbAdd">Add caller</button>
        <button type="button" class="btn btn2" id="cbRefresh">Refresh</button>
        <button type="button" class="btn btn2" id="cbClose">Close list</button>
      </div>
      <p id="cbMessage" class="cb-message" role="status" aria-live="polite"></p>
      <form id="cbForm" class="card" hidden>
        <h3 id="cbFormTitle">Add a caller</h3>
        <div class="cb-fields">
          <label class="cb-field">Caller name * <input name="caller_name" required maxlength="150" autocomplete="name"></label>
          <label class="cb-field">Phone number <input name="phone" type="tel" maxlength="50" autocomplete="tel"></label>
          <label class="cb-field">Business
            <select name="business"><option>Pembrokeshire Self Storage</option><option>Miles John Williams Limited</option></select>
          </label>
          <label class="cb-field">Call back by <input name="callback_date" type="date"></label>
          <label class="cb-field">Enquiry / interested in <input name="enquiry" maxlength="200" placeholder="20ft container, bathroom quote…"></label>
          <label class="cb-field">Status
            <select name="status"><option value="to_call">To call</option><option value="waiting_list">Waiting list</option><option value="waiting_reply">Waiting on reply</option><option value="booked">Booked</option><option value="closed">Closed</option></select>
          </label>
          <label class="cb-field cb-wide">What we discussed <textarea name="call_notes" maxlength="4000" placeholder="What was agreed and anything to remember"></textarea></label>
          <label class="cb-field">Last contacted <input name="last_contacted" type="date"></label>
          <label class="cb-field">Next action / notes <textarea name="next_action" maxlength="2000" placeholder="Ring on Wednesday, check availability…"></textarea></label>
        </div>
        <div class="cb-actions"><button class="btn" type="submit" id="cbSave">Save caller</button><button type="button" class="btn btn2" id="cbCancel">Cancel</button></div>
      </form>
      <div class="cb-toolbar">
        <input id="cbSearch" type="search" aria-label="Search callers" placeholder="Search name, number or notes">
        <select id="cbStatusFilter" aria-label="Filter by callback status"><option value="outstanding">Outstanding</option><option value="all">All statuses</option><option value="to_call">To call</option><option value="waiting_list">Waiting list</option><option value="waiting_reply">Waiting on reply</option><option value="booked">Booked</option><option value="closed">Closed</option></select>
        <select id="cbBusinessFilter" aria-label="Filter by business"><option value="all">Both businesses</option><option>Pembrokeshire Self Storage</option><option>Miles John Williams Limited</option></select>
      </div>
      <div id="cbList" class="cb-list"><p class="cb-quiet">Open the list to load your callbacks.</p></div>
    `;
    stats.before(panel);

    openButton.addEventListener('click', () => toggle(!panel.hidden));
    el('cbClose').addEventListener('click', () => toggle(false));
    el('cbAdd').addEventListener('click', () => edit(null));
    el('cbCancel').addEventListener('click', () => { el('cbForm').hidden = true; state.editing = null; });
    el('cbRefresh').addEventListener('click', () => load());
    el('cbForm').addEventListener('submit', save);
    for (const id of ['cbSearch', 'cbStatusFilter', 'cbBusinessFilter']) el(id).addEventListener('input', render);
    el('cbList').addEventListener('click', event => {
      const button = event.target.closest('button[data-edit]');
      if (button) edit(state.rows.find(row => row.id === button.dataset.edit));
    });
    // The existing dashboard decides who can see #app; Supabase RLS checks permissions again for every query.
    // Open automatically after staff sign-in, including for the direct callbacks link.
    const openForStaff = () => {
      if (app.style.display !== 'block') return;
      if (panel.hidden) {
        panel.hidden = false;
        openButton.setAttribute('aria-expanded', 'true');
        openButton.textContent = 'Hide callbacks & waiting list';
      }
      if (!state.loaded && !state.busy) load();
    };
    const appObserver = new MutationObserver(openForStaff);
    appObserver.observe(app, { attributes: true, attributeFilter: ['style'] });
    openForStaff();
    db.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        state.rows = []; state.loaded = false; state.editing = null;
        panel.hidden = true; el('cbForm').hidden = true;
        openButton.setAttribute('aria-expanded', 'false');
        el('cbList').replaceChildren(textNode('p', 'Sign in to see callbacks.', 'cb-quiet'));
      }
    });
  }

  async function toggle(open) {
    const panel = el('cbPanel');
    if (!panel) return;
    panel.hidden = !open;
    el('cbOpen').setAttribute('aria-expanded', String(open));
    el('cbOpen').textContent = open ? 'Hide callbacks & waiting list' : 'Open callbacks & waiting list';
    if (open && !state.loaded) await load();
    if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function load() {
    if (state.busy) return;
    state.busy = true;
    notify('Loading callbacks…');
    try {
      const { data: { session }, error: authError } = await db.auth.getSession();
      if (authError) throw authError;
      if (!session) throw new Error('Please sign in again.');
      const { data, error } = await db.from('callback_list')
        .select('id,created_at,updated_at,business,caller_name,phone,enquiry,call_notes,callback_date,status,last_contacted,next_action')
        .order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      state.rows = data || [];
      state.loaded = true;
      notify('');
      render();
      if (new URLSearchParams(location.search).get('callbacks') === '1') {
        requestAnimationFrame(() => el('cbPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    } catch (err) {
      state.loaded = false;
      notify('Could not load callbacks: ' + (err.message || String(err)), true);
      el('cbList').replaceChildren(textNode('p', 'Your records were not loaded.', 'cb-error'));
    } finally { state.busy = false; }
  }

  function edit(row) {
    const form = el('cbForm');
    state.editing = row?.id || null;
    form.reset();
    field('business').value = 'Pembrokeshire Self Storage';
    field('status').value = 'to_call';
    if (row) {
      for (const key of ['caller_name', 'phone', 'business', 'callback_date', 'enquiry', 'status', 'call_notes', 'last_contacted', 'next_action']) {
        field(key).value = row[key] || '';
      }
    }
    el('cbFormTitle').textContent = row ? 'Edit caller' : 'Add a caller';
    el('cbSave').textContent = row ? 'Save changes' : 'Save caller';
    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    field('caller_name').focus();
  }

  async function save(event) {
    event.preventDefault();
    if (state.busy) return;
    const name = clean(field('caller_name').value);
    if (!name) { notify('Please add the caller’s name.', true); return; }
    const business = field('business').value;
    const status = field('status').value;
    if (!BUSINESSES.includes(business) || !STATUSES[status]) { notify('Check the business and status.', true); return; }
    const payload = {
      caller_name: name,
      phone: clean(field('phone').value) || null,
      business,
      enquiry: clean(field('enquiry').value) || null,
      call_notes: clean(field('call_notes').value) || null,
      callback_date: field('callback_date').value || null,
      status,
      last_contacted: field('last_contacted').value || null,
      next_action: clean(field('next_action').value) || null,
      updated_at: new Date().toISOString(),
    };
    state.busy = true;
    el('cbSave').disabled = true;
    notify('Saving caller…');
    try {
      const command = state.editing
        ? db.from('callback_list').update(payload).eq('id', state.editing)
        : db.from('callback_list').insert(payload);
      const { error } = await command.select('id').single();
      if (error) throw error;
      state.editing = null;
      el('cbForm').hidden = true;
      state.busy = false;
      await load();
      notify('Caller saved.');
    } catch (err) {
      notify('Could not save caller: ' + (err.message || String(err)), true);
    } finally {
      state.busy = false;
      el('cbSave').disabled = false;
    }
  }

  function render() {
    if (!state.loaded) return;
    const rows = state.rows;
    const counts = el('cbCounts');
    counts.replaceChildren();
    for (const [key, label] of [['to_call', 'To call'], ['waiting_list', 'Waiting list'], ['waiting_reply', 'Waiting on reply'], ['booked', 'Booked']]) {
      counts.appendChild(textNode('span', label + ': ' + rows.filter(row => row.status === key).length));
    }
    const search = clean(el('cbSearch').value).toLowerCase();
    const status = el('cbStatusFilter').value;
    const business = el('cbBusinessFilter').value;
    const filtered = rows.filter(row => {
      const statusMatch = status === 'all' || (status === 'outstanding' ? !['booked', 'closed'].includes(row.status) : row.status === status);
      const businessMatch = business === 'all' || row.business === business;
      const haystack = [row.caller_name, row.phone, row.enquiry, row.call_notes, row.next_action].filter(Boolean).join(' ').toLowerCase();
      return statusMatch && businessMatch && (!search || haystack.includes(search));
    }).sort((a, b) => {
      const rank = { to_call: 0, waiting_list: 1, waiting_reply: 2, booked: 3, closed: 4 };
      return (rank[a.status] ?? 5) - (rank[b.status] ?? 5) || (a.callback_date || '9999').localeCompare(b.callback_date || '9999') || (b.created_at || '').localeCompare(a.created_at || '');
    });
    const target = el('cbList');
    target.replaceChildren();
    if (!filtered.length) {
      target.appendChild(textNode('p', rows.length ? 'No callbacks match those filters.' : 'No callers saved yet. Use Add caller to start your list.', 'cb-quiet'));
      return;
    }
    for (const row of filtered) {
      const card = textNode('article', '', 'cb-item');
      const head = textNode('div', '', 'cb-item-head');
      const heading = textNode('h3', row.caller_name || 'Caller');
      const badge = textNode('span', STATUSES[row.status] || row.status, 'cb-status cb-' + row.status);
      head.append(heading, badge);
      card.append(head);
      card.appendChild(textNode('small', row.business));
      const phone = textNode('p');
      if (row.phone) {
        const link = textNode('a', row.phone);
        link.href = 'tel:' + row.phone.replace(/[^\d+]/g, '');
        phone.appendChild(link);
      } else phone.textContent = 'No phone saved';
      card.appendChild(phone);
      if (row.enquiry) card.appendChild(textNode('p', 'Enquiry: ' + row.enquiry));
      if (row.call_notes) card.appendChild(textNode('p', 'Discussed: ' + row.call_notes));
      const when = textNode('p', 'Call back: ' + prettyDate(row.callback_date));
      if (row.callback_date && row.callback_date < londonToday() && row.status === 'to_call') {
        when.className = 'cb-overdue'; when.textContent += ' — OVERDUE';
      }
      card.appendChild(when);
      if (row.last_contacted) card.appendChild(textNode('p', 'Last contacted: ' + prettyDate(row.last_contacted)));
      if (row.next_action) card.appendChild(textNode('p', 'Next: ' + row.next_action));
      const editButton = textNode('button', 'Edit / update', 'btn btn2');
      editButton.type = 'button'; editButton.dataset.edit = row.id;
      card.appendChild(editButton);
      target.appendChild(card);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeUI);
  else makeUI();
})();
