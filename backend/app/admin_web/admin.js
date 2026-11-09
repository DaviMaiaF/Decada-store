/*
 * Painel do super usuário.
 *
 * Duas regras valem para o arquivo inteiro:
 *
 * - **Dado só entra na tela por textContent**, nunca como HTML. Nome e e-mail são
 *   digitados por qualquer pessoa no cadastro, e a página roda com o token que
 *   alcança todas as contas. A CSP é a segunda barreira, não a primeira.
 * - **O token fica só nesta variável**, sem armazenamento do navegador: recarregar a
 *   página pede a senha de novo, e nada sobra no navegador depois de sair.
 */
"use strict";

const API = "/admin/api";
const PAGE_SIZE = 25;
const SVG_NS = "http://www.w3.org/2000/svg";

const ROLE_LABELS = { paciente: "Paciente", nutricionista: "Nutricionista", admin: "Super usuário" };
const PRESCRIPTION_LABELS = { rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita", recusada: "Recusada" };
const PAYMENT_LABELS = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado" };
const ORIGIN_LABELS = { nfce: "NFC-e", scraping: "Carga inicial", usuario: "Usuário", seed: "Seed (fictício)" };
const ACTION_LABELS = {
  conta_suspensa: "Conta suspensa",
  conta_reativada: "Conta reativada",
  conta_excluida: "Conta excluída",
};

const state = {
  token: null,
  view: "dashboard",
  accounts: { offset: 0, search: "", role: "" },
  actions: { offset: 0 },
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Construção de elementos: o único jeito de pôr coisa na tela
// ---------------------------------------------------------------------------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === "class") node.className = value;
    else if (name === "text") node.textContent = value;
    else if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

const number = new Intl.NumberFormat("pt-BR");
const formatNumber = (value) => number.format(value);
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const formatDateTime = (value) => dateTime.format(new Date(value));
const formatDate = (value) => dateOnly.format(new Date(value));
// A semana vem como data pura, em UTC. Sem o fuso, o Brasil veria o dia anterior.
const shortWeek = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const formatWeek = (value) => shortWeek.format(new Date(`${value}T00:00:00Z`));

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "Não foi possível falar com a API. Se o servidor estava dormindo, tente de novo em instantes.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data.detail === "string" ? data.detail : `Erro ${response.status}.`;
    throw new ApiError(response.status, detail);
  }
  return data;
}

/** Chamada de quem já entrou: token vencido volta para o login. */
async function api(path, options) {
  try {
    return await request(path, options);
  } catch (error) {
    if (error.status === 401) {
      showLogin("Sua sessão terminou. Entre de novo.");
      throw new SessionEnded();
    }
    throw error;
  }
}

class SessionEnded extends Error {}

function showError(error) {
  if (error instanceof SessionEnded) return;
  const banner = $("global-error");
  banner.textContent = error.message;
  banner.hidden = false;
}

function clearMessages() {
  $("global-error").hidden = true;
  $("global-notice").hidden = true;
}

function showNotice(message) {
  const banner = $("global-notice");
  banner.textContent = message;
  banner.hidden = false;
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

function showLogin(message = "") {
  state.token = null;
  if ($("confirm").open) $("confirm").close();
  $("app").hidden = true;
  $("login").hidden = false;
  $("login-password").value = "";
  $("login-error").textContent = message;
  $("login-error").hidden = !message;
  $("login-email").focus();
}

async function showApp(email) {
  $("login").hidden = true;
  $("app").hidden = false;
  $("session-email").textContent = email;
  await Promise.all([loadEnvironment(), openView("dashboard")]);
}

async function loadEnvironment() {
  const health = await request("/health").catch(() => null);
  const badge = $("env-badge");
  badge.hidden = !health || health.env === "prod";
  if (health) badge.textContent = health.env === "demo" ? "Demonstração" : "Desenvolvimento";
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("login-email").value.trim();
  const submit = $("login-submit");
  submit.disabled = true;
  $("login-error").hidden = true;
  try {
    const { access_token: token } = await request("/auth/admin/login", {
      method: "POST",
      body: { email, password: $("login-password").value },
    });
    state.token = token;
    $("login-password").value = "";
    await showApp(email);
  } catch (error) {
    // 401 cobre e-mail, senha e papel, sem dizer qual (decisão 10). 422 é e-mail malformado.
    $("login-error").textContent =
      error.status === 401 || error.status === 422 ? "E-mail ou senha inválidos." : error.message;
    $("login-error").hidden = false;
  } finally {
    submit.disabled = false;
  }
});

$("logout").addEventListener("click", () => showLogin());

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------

async function openView(view) {
  state.view = view;
  clearMessages();
  for (const section of document.querySelectorAll(".view")) {
    section.hidden = section.id !== `view-${view}`;
  }
  for (const tab of document.querySelectorAll(".tab")) {
    if (tab.dataset.view === view) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  try {
    if (view === "dashboard") await loadDashboard();
    if (view === "accounts") await loadAccounts();
    if (view === "actions") await loadActions();
  } catch (error) {
    showError(error);
  }
}

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => openView(tab.dataset.view));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function loadDashboard() {
  const body = $("dashboard-body");
  // Segura o desenho anterior enquanto busca, para a tela não pular.
  body.classList.add("is-loading");
  try {
    renderDashboard(await api(`${API}/dashboard`));
  } finally {
    body.classList.remove("is-loading");
  }
}

$("dashboard-refresh").addEventListener("click", () => {
  clearMessages();
  loadDashboard().catch(showError);
});

function tile(label, value, note) {
  return el(
    "div",
    { class: "card tile" },
    el("span", { class: "tile-label", text: label }),
    el("span", { class: "tile-value", text: formatNumber(value) }),
    note ? el("span", { class: "tile-note", text: note }) : "",
  );
}

function panel(title, subtitle, wide, ...children) {
  return el(
    "section",
    { class: `card panel${wide ? " panel-wide" : ""}` },
    el("div", {}, el("h2", { text: title }), subtitle ? el("p", { class: "panel-sub", text: subtitle }) : ""),
    ...children,
  );
}

/** Barras de uma série só. O valor vai escrito na ponta; categoria zerada não desenha barra. */
function barList(entries) {
  const max = Math.max(1, ...entries.map((entry) => entry.value));
  return el(
    "ul",
    { class: "bars" },
    ...entries.map((entry) => {
      const fill = el("div", { class: "bar-fill" });
      if (entry.value > 0) {
        const segment = el("div", { class: "bar-seg" });
        segment.style.width = "100%";
        // Desconta o espaço do valor, para o maior número caber ao lado da barra.
        fill.style.flex = `0 1 calc(${(entry.value / max) * 100}% - 48px)`;
        fill.style.minWidth = "3px";
        fill.append(segment);
      }
      return el(
        "li",
        { class: "bar-row" },
        el("span", { class: "bar-label", text: entry.label }),
        el("div", { class: "bar-track" }, fill, el("span", { class: "bar-value", text: formatNumber(entry.value) })),
      );
    }),
  );
}

function fromCounts(counts, labels) {
  return Object.keys(labels).map((key) => ({ label: labels[key], value: counts[key] ?? 0 }));
}

/** Teto "redondo" do eixo: 1, 2, 5 vezes uma potência de dez. */
function niceCeiling(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= value) return step * power;
  }
  return 10 * power;
}

function columnChart(weeks, width) {
  const height = 220;
  const margin = { top: 12, right: 8, bottom: 26, left: 34 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const ceiling = niceCeiling(Math.max(...weeks.map((week) => week.count)));
  const y = (value) => margin.top + plotHeight * (1 - value / ceiling);
  const band = plotWidth / weeks.length;
  const barWidth = Math.min(24, band * 0.6);

  const chart = svg("svg", {
    class: "columns",
    // Desenhado na largura real, sem escalar: o texto do eixo fica sempre em 12px.
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: "group",
    "aria-label": "Cadastros por semana",
  });

  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const value = ceiling * tick;
    chart.append(
      svg("line", { class: "gridline", x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value) }),
    );
    const label = svg("text", { x: margin.left - 8, y: y(value) + 4, "text-anchor": "end" });
    label.textContent = formatNumber(value);
    chart.append(label);
  }

  weeks.forEach((week, index) => {
    const left = margin.left + band * index;
    const x = left + (band - barWidth) / 2;
    const description = `Semana de ${formatWeek(week.week_start)}: ${formatNumber(week.count)} ${week.count === 1 ? "cadastro" : "cadastros"}`;

    // A área de toque é a faixa inteira, bem maior que a coluna.
    const hit = svg("rect", {
      class: "hit", x: left, y: margin.top, width: band, height: plotHeight,
      tabindex: 0, role: "img", "aria-label": description,
    });
    bindTooltip(hit, description);
    chart.append(hit);

    if (week.count > 0) {
      const top = y(week.count);
      const bottom = y(0);
      const radius = Math.min(4, bottom - top);
      // Ponta arredondada, base reta.
      chart.append(
        svg("path", {
          class: "mark",
          "pointer-events": "none",
          d: `M${x},${bottom}V${top + radius}Q${x},${top} ${x + radius},${top}H${x + barWidth - radius}Q${x + barWidth},${top} ${x + barWidth},${top + radius}V${bottom}Z`,
        }),
      );
    }

    // Sem espaço para todas as datas, fica uma sim, uma não, a partir da mais recente.
    // Todas continuam no tooltip e na tabela.
    const skipEvery = band < 44 ? 2 : 1;
    if ((weeks.length - 1 - index) % skipEvery === 0) {
      const tickLabel = svg("text", { x: left + band / 2, y: height - 8, "text-anchor": "middle" });
      tickLabel.textContent = formatWeek(week.week_start);
      chart.append(tickLabel);
    }
  });

  return chart;
}

function bindTooltip(node, text) {
  const tooltip = $("tooltip");
  const place = (x, y) => {
    tooltip.textContent = text;
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(x - box.width / 2, window.innerWidth - box.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, y - box.height - 10)}px`;
  };
  const hide = () => { tooltip.hidden = true; };
  node.addEventListener("pointermove", (event) => place(event.clientX, event.clientY));
  node.addEventListener("pointerleave", hide);
  node.addEventListener("focus", () => {
    const box = node.getBoundingClientRect();
    place(box.left + box.width / 2, box.top);
  });
  node.addEventListener("blur", hide);
}

function regionBars(regions) {
  const max = Math.max(1, ...regions.map((region) => region.total));
  return el(
    "ul",
    { class: "bars" },
    ...regions.map((region) => {
      const name = `${region.city} (${region.state_code})`;
      const recent = region.total - region.stale;
      const fill = el("div", { class: "bar-fill" });
      fill.style.flex = `0 1 calc(${(region.total / max) * 100}% - 48px)`;
      if (recent > 0) {
        const segment = el("div", { class: "bar-seg" });
        segment.style.flex = `${recent} 1 0`;
        fill.append(segment);
      }
      if (region.stale > 0) {
        const segment = el("div", { class: "bar-seg bar-seg-2" });
        segment.style.flex = `${region.stale} 1 0`;
        fill.append(segment);
      }
      const row = el(
        "li",
        { class: "bar-row", tabindex: 0, "aria-label": `${name}: ${formatNumber(recent)} recentes e ${formatNumber(region.stale)} antigos` },
        el("span", { class: "bar-label", text: name }),
        el("div", { class: "bar-track" }, fill, el("span", { class: "bar-value", text: formatNumber(region.total) })),
      );
      bindTooltip(row, `${name}: ${formatNumber(recent)} até 30 dias · ${formatNumber(region.stale)} mais antigos`);
      return row;
    }),
  );
}

function dataTable(headers, rows) {
  return el(
    "table",
    { class: "table" },
    el("thead", {}, el("tr", {}, ...headers.map((header, index) =>
      el("th", { scope: "col", class: index ? "num" : "", text: header })))),
    el("tbody", {}, ...rows.map((cells) =>
      el("tr", {}, ...cells.map((cell, index) =>
        el("td", { class: index ? "num" : "", text: index ? formatNumber(cell) : cell }))))),
  );
}

const tableView = (table) => el("details", {}, el("summary", { text: "Ver como tabela" }), table);

let lastDashboard = null;
let resizeTimer;

// O gráfico é desenhado para a largura atual; mudou a largura, desenha de novo.
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (lastDashboard && state.token && state.view === "dashboard") renderDashboard(lastDashboard);
  }, 150);
});

function renderDashboard(data) {
  lastDashboard = data;
  $("dashboard-time").textContent = `Atualizado em ${dateTime.format(new Date(data.generated_at))}`;

  const { accounts, prices, payments, prescriptions, catalog } = data;
  const stalePercent = prices.total ? Math.round((prices.stale / prices.total) * 100) : 0;

  const tiles = el(
    "div",
    { class: "tiles" },
    tile("Contas", accounts.total, accounts.suspended ? `suspensas: ${formatNumber(accounts.suspended)}` : "nenhuma suspensa"),
    tile("Planos alimentares", data.meal_plans, "importados ou aceitos"),
    tile("Listas de compras", data.shopping_lists),
    tile("Pagamentos de teste", payments.total, "nada é cobrado"),
    tile("Registros de preço", prices.total, `${stalePercent}% com mais de 30 dias`),
    tile("Produtos no catálogo", catalog.products, `${formatNumber(catalog.markets)} mercados · ${formatNumber(catalog.recipes)} receitas`),
  );

  const signupsTotal = accounts.signups_by_week.reduce((sum, week) => sum + week.count, 0);
  const shownRegions = prices.by_region.slice(0, 8);
  const hiddenRegions = prices.by_region.length - shownRegions.length;

  const regionPanel = panel(
    "Preços por região",
    hiddenRegions > 0
      ? `As 8 regiões com mais registros, de ${formatNumber(prices.by_region.length)}. A tabela traz todas.`
      : "A média de preço é sempre por região, nunca nacional.",
    true,
    el(
      "div",
      { class: "legend" },
      el("span", { class: "legend-item" }, el("span", { class: "swatch" }), "Até 30 dias"),
      el("span", { class: "legend-item" }, el("span", { class: "swatch swatch-2" }), "Mais antigos (viram estimativa)"),
    ),
    prices.by_region.length
      ? regionBars(shownRegions)
      : el("p", { class: "hint", text: "Nenhum preço registrado ainda." }),
    tableView(dataTable(
      ["Região", "Total", "Até 30 dias", "Mais antigos"],
      prices.by_region.map((region) => [
        `${region.city} (${region.state_code})`, region.total, region.total - region.stale, region.stale,
      ]),
    )),
  );

  const originPanel = panel(
    "Preços por origem",
    "A fonte principal é o QR Code da NFC-e.",
    false,
    barList(fromCounts(prices.by_origin, ORIGIN_LABELS)),
  );
  if ((prices.by_origin.seed ?? 0) > 0) {
    originPanel.append(el("p", { class: "note", text: "Os preços de origem seed são fictícios, carregados só para demonstração." }));
  }

  const charts = el(
    "div",
    { class: "charts" },
    panel(
      "Cadastros por semana",
      `${formatNumber(signupsTotal)} nas últimas 8 semanas, sem contar super usuários.`,
      true,
      columnChart(accounts.signups_by_week, Math.max(280, $("dashboard-body").clientWidth - 34)),
      tableView(dataTable(
        ["Semana de", "Cadastros"],
        accounts.signups_by_week.map((week) => [formatWeek(week.week_start), week.count]),
      )),
    ),
    panel("Contas por papel", null, false, barList(fromCounts(accounts.by_role, ROLE_LABELS))),
    panel(
      "Planos da nutricionista",
      `${formatNumber(prescriptions.total)} no total, por situação.`,
      false,
      barList(fromCounts(prescriptions.by_status, PRESCRIPTION_LABELS)),
    ),
    panel(
      "Pagamentos de teste",
      "Por situação. Pix em modo de teste e cartão simulado.",
      false,
      barList(fromCounts(payments.by_status, PAYMENT_LABELS)),
    ),
    originPanel,
    regionPanel,
  );

  $("dashboard-body").replaceChildren(tiles, charts);
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

let accountsRequest = 0;

async function loadAccounts() {
  // Busca digitada rápido: só a resposta do pedido mais recente vai para a tela.
  accountsRequest += 1;
  const thisRequest = accountsRequest;
  const { offset, search, role } = state.accounts;
  const params = new URLSearchParams({ limit: PAGE_SIZE, offset });
  if (search) params.set("q", search);
  if (role) params.set("role", role);

  const page = await api(`${API}/accounts?${params}`);
  if (thisRequest !== accountsRequest) return undefined;

  // Excluir o último item da última página não pode deixar a tela vazia.
  if (page.items.length === 0 && page.total > 0 && offset > 0) {
    state.accounts.offset = Math.max(0, offset - PAGE_SIZE);
    return loadAccounts();
  }

  $("accounts-total").textContent = `${formatNumber(page.total)} ${page.total === 1 ? "conta" : "contas"}`;
  $("accounts-rows").replaceChildren(...page.items.map(accountRow));
  $("accounts-empty").hidden = page.items.length > 0;
  renderPager($("accounts-pager"), page.total, state.accounts, loadAccounts);
  return undefined;
}

function accountRow(account) {
  const suspended = account.suspended_at !== null;
  const isAdmin = account.role === "admin";
  const plans = account.role === "nutricionista" ? account.prescriptions_count : account.meal_plans_count;

  const actions = el("div", { class: "row-actions" });
  if (isAdmin) {
    actions.append(el("span", { class: "hint", text: "Não alterável aqui" }));
  } else {
    actions.append(
      suspended
        ? el("button", { class: "button button-quiet button-small", type: "button", text: "Reativar", onclick: () => confirmReactivate(account) })
        : el("button", { class: "button button-quiet button-small", type: "button", text: "Suspender", onclick: () => confirmSuspend(account) }),
      el("button", { class: "button button-text-danger button-small", type: "button", text: "Excluir", onclick: () => confirmDelete(account) }),
    );
  }

  return el(
    "tr",
    {},
    el(
      "td",
      {},
      el("div", { class: "account-email", text: account.email }),
      account.full_name ? el("div", { class: "account-name", text: account.full_name }) : "",
    ),
    el("td", { "data-label": "Papel", text: ROLE_LABELS[account.role] ?? account.role }),
    el("td", { class: "num", "data-label": "Planos", text: isAdmin ? "—" : formatNumber(plans) }),
    el("td", { "data-label": "Cadastro", text: formatDate(account.created_at) }),
    el(
      "td",
      {},
      el("span", {
        class: `badge ${suspended ? "badge-danger" : "badge-ok"}`,
        text: suspended ? `Suspensa em ${formatDate(account.suspended_at)}` : "Ativa",
      }),
    ),
    el("td", {}, actions),
  );
}

let searchTimer;
$("accounts-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.accounts.search = event.target.value.trim();
    state.accounts.offset = 0;
    loadAccounts().catch(showError);
  }, 250);
});
$("accounts-role").addEventListener("change", (event) => {
  state.accounts.role = event.target.value;
  state.accounts.offset = 0;
  loadAccounts().catch(showError);
});
$("accounts-filter").addEventListener("submit", (event) => event.preventDefault());

function renderPager(container, total, pageState, reload) {
  if (total <= PAGE_SIZE) {
    container.replaceChildren();
    return;
  }
  const first = pageState.offset + 1;
  const last = Math.min(total, pageState.offset + PAGE_SIZE);
  const go = (offset) => {
    pageState.offset = offset;
    reload().catch(showError);
  };
  const previous = el("button", { class: "button button-quiet button-small", type: "button", text: "Anterior", onclick: () => go(Math.max(0, pageState.offset - PAGE_SIZE)) });
  const next = el("button", { class: "button button-quiet button-small", type: "button", text: "Próxima", onclick: () => go(pageState.offset + PAGE_SIZE) });
  previous.disabled = pageState.offset === 0;
  next.disabled = last >= total;
  container.replaceChildren(
    el("span", { text: `${formatNumber(first)}–${formatNumber(last)} de ${formatNumber(total)}` }),
    previous,
    next,
  );
}

// ---------------------------------------------------------------------------
// Confirmação das ações
// ---------------------------------------------------------------------------

let confirmAction = null;

function openConfirm({ title, text, okLabel, danger, mustType, action }) {
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = text;
  const ok = $("confirm-ok");
  ok.textContent = okLabel;
  ok.className = `button ${danger ? "button-danger" : "button-primary"}`;
  ok.disabled = Boolean(mustType);
  ok.dataset.mustType = mustType ?? "";
  $("confirm-typed-label").hidden = !mustType;
  $("confirm-typed-hint").textContent = mustType ? `Digite ${mustType} para confirmar` : "";
  $("confirm-typed").value = "";
  $("confirm-error").hidden = true;
  confirmAction = action;
  $("confirm").showModal();
  if (mustType) $("confirm-typed").focus();
}

$("confirm-typed").addEventListener("input", (event) => {
  const ok = $("confirm-ok");
  ok.disabled = event.target.value.trim().toLowerCase() !== ok.dataset.mustType.toLowerCase();
});

$("confirm-cancel").addEventListener("click", () => $("confirm").close());

$("confirm-form").addEventListener("submit", async (event) => {
  // method="dialog" fecharia antes de a chamada terminar; o erro precisa aparecer aqui.
  event.preventDefault();
  const ok = $("confirm-ok");
  if (ok.disabled || !confirmAction) return;
  ok.disabled = true;
  try {
    const notice = await confirmAction();
    $("confirm").close();
    clearMessages();
    showNotice(notice);
    await loadAccounts();
  } catch (error) {
    if (error instanceof SessionEnded) return;
    $("confirm-error").textContent = error.message;
    $("confirm-error").hidden = false;
    ok.disabled = false;
  }
});

function confirmSuspend(account) {
  openConfirm({
    title: "Suspender esta conta?",
    text: `${account.email} não vai conseguir entrar, e a sessão aberta para de valer. Nenhum dado é apagado, e dá para reativar depois.`,
    okLabel: "Suspender",
    danger: false,
    action: async () => {
      await api(`${API}/accounts/${account.id}/suspend`, { method: "POST" });
      return `A conta ${account.email} foi suspensa.`;
    },
  });
}

function confirmReactivate(account) {
  openConfirm({
    title: "Reativar esta conta?",
    text: `${account.email} volta a poder entrar no app.`,
    okLabel: "Reativar",
    danger: false,
    action: async () => {
      await api(`${API}/accounts/${account.id}/reactivate`, { method: "POST" });
      return `A conta ${account.email} foi reativada.`;
    },
  });
}

function confirmDelete(account) {
  openConfirm({
    title: "Excluir esta conta?",
    text: `Isso apaga de verdade a conta e os dados pessoais dela, sem volta. Só os preços contribuídos ficam, anonimizados. O histórico não vai guardar qual conta foi.`,
    okLabel: "Excluir para sempre",
    danger: true,
    mustType: account.email,
    action: async () => {
      const receipt = await api(`${API}/accounts/${account.id}`, { method: "DELETE" });
      return (
        `Conta excluída: ${receipt.meal_plans_deleted} planos, ${receipt.pantry_items_deleted} itens de despensa, ` +
        `${receipt.shopping_lists_deleted} listas e ${receipt.prescriptions_deleted} planos de nutricionista apagados; ` +
        `${receipt.price_records_anonymized} preços anonimizados.`
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

async function loadActions() {
  const params = new URLSearchParams({ limit: PAGE_SIZE, offset: state.actions.offset });
  const page = await api(`${API}/actions?${params}`);

  $("actions-rows").replaceChildren(
    ...page.items.map((item) =>
      el(
        "tr",
        {},
        el("td", { "data-label": "Quando", text: formatDateTime(item.created_at) }),
        el("td", { "data-label": "Ação", text: ACTION_LABELS[item.action] ?? item.action }),
        el("td", {
          "data-label": "Conta",
          text: item.target_email ?? `Conta de ${(ROLE_LABELS[item.target_role] ?? item.target_role).toLowerCase()}, já excluída`,
        }),
        el("td", { "data-label": "Feito por", text: item.actor_email ?? "Super usuário que já saiu" }),
      ),
    ),
  );
  $("actions-empty").hidden = page.items.length > 0;
  renderPager($("actions-pager"), page.total, state.actions, loadActions);
}

// ---------------------------------------------------------------------------

showLogin();
