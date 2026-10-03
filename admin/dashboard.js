const el = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('fr-CA');
let latest = null;
async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  });
  const value = await response.json();
  if (response.status === 401) {
    el('login').hidden = false;
    el('dashboard').hidden = true;
    latest = null;
  }
  if (!response.ok) throw new Error(value.error || 'Serveur indisponible');
  return value;
}
function node(tag, value, className) {
  const n = document.createElement(tag);
  if (value !== undefined) n.textContent = value;
  if (className) n.className = className;
  return n;
}
function render(data) {
  latest = data;
  el('login').hidden = true;
  el('dashboard').hidden = false;
  el('updated').textContent =
    `Actualisé à ${new Date(data.updatedAt).toLocaleTimeString('fr-CA')} · Rafraîchissement toutes les 30 s`;
  const total = data.metrics.reduce((n, m) => n + m.count, 0);
  const ok = data.metrics.filter((m) => m.outcome === 'ok').reduce((n, m) => n + m.count, 0);
  el('cards').replaceChildren(
    ...[
      [
        'Installations participantes',
        number.format(data.totals.installations),
        'Actives sur 30 jours',
      ],
      ['Actives aujourd’hui', number.format(data.totals.active), 'Sur les dernières 24 heures'],
      ['Sessions VAV', number.format(data.totals.sessions), 'Démarrages avec consentement'],
      [
        'Requêtes API',
        number.format(total),
        total
          ? `${((100 * ok) / total).toFixed(1)} % de réponses HTTP réussies`
          : 'Aucune requête mesurée',
      ],
    ].map(([label, value, hint]) => {
      const c = node('div', undefined, 'card');
      c.append(node('span', label), node('strong', value), node('small', hint));
      return c;
    }),
  );
  el('empty').hidden = data.totals.installations > 0;
  const peak = Math.max(1, ...data.daily.map((d) => d.installations));
  el('daily').replaceChildren(
    ...data.daily.map((d) => {
      const c = node('div', undefined, 'day');
      c.title = `${d.day} : ${d.installations} installations`;
      const p = node('progress');
      p.max = peak;
      p.value = d.installations;
      p.setAttribute('aria-label', c.title);
      c.append(p, node('small', d.day.slice(5)));
      return c;
    }),
  );
  el('versions').replaceChildren(
    ...data.versions.map((v) => {
      const c = node('div', undefined, 'version');
      const label = node('div', undefined, 'bar-label');
      label.append(node('span', `v${v.version}`), node('span', number.format(v.installations)));
      const bar = node('progress');
      bar.max = Math.max(1, data.totals.installations);
      bar.value = v.installations;
      bar.setAttribute('aria-label', `Version ${v.version}`);
      c.append(label, bar);
      return c;
    }),
  );
  const groups = new Map();
  for (const m of data.metrics) {
    const g = groups.get(m.operation) || { count: 0, ok: 0, rate_limit: 0, milliseconds: 0 };
    g.count += m.count;
    g.milliseconds += m.milliseconds;
    if (m.outcome === 'ok') g.ok += m.count;
    if (m.outcome === 'rate_limit') g.rate_limit += m.count;
    groups.set(m.operation, g);
  }
  el('api').replaceChildren(
    ...[...groups].map(([operation, g]) => {
      const row = node('tr');
      for (const cell of [
        operation,
        number.format(g.count),
        `${((100 * g.ok) / g.count).toFixed(1)} %`,
        number.format(g.rate_limit),
        number.format(g.count - g.ok - g.rate_limit),
        `${Math.round(g.milliseconds / g.count)} ms`,
      ])
        row.append(node('td', cell));
      return row;
    }),
  );
}
async function refresh() {
  try {
    render(await request('/owner/stats'));
    el('message').textContent = '';
  } catch (e) {
    el('message').textContent = e.message;
  }
}
el('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.target.querySelector('button');
  button.disabled = true;
  try {
    await request('/owner/login', {
      method: 'POST',
      body: JSON.stringify({ secret: el('secret').value }),
    });
    el('secret').value = '';
    await refresh();
  } catch (error) {
    el('message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
el('refresh').addEventListener('click', refresh);
el('logout').addEventListener('click', async () => {
  try {
    await request('/owner/logout', { method: 'POST', body: '{}' });
    latest = null;
    el('dashboard').hidden = true;
    el('login').hidden = false;
    el('message').textContent = '';
  } catch (e) {
    el('message').textContent = e.message;
  }
});
el('export').addEventListener('click', () => {
  if (!latest) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' }),
  );
  const a = node('a');
  a.href = url;
  a.download = `vav-stats-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
setInterval(() => {
  if (latest && !document.hidden) void refresh();
}, 30000);
void refresh();
