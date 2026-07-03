// Paleta pessoal do hábito — exatamente 4 cores: Verde, Amarelo, Vermelho,
// Laranja. Tons escolhidos para AA: texto/ícone escuro sobre o tint claro.
const COLORS = ["#16A34A", "#EAB308", "#DC2626", "#EA580C"];
const TINTS = ["#DFF5E7", "#FCF2CF", "#FDE3E3", "#FFE8DC"];
const COLOR_LABELS = ["Verde", "Amarelo", "Vermelho", "Laranja"];
const DEFAULT_COLOR = COLORS[1]; // Amarelo é o padrão de hábito novo
const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const ATTENTION_THRESHOLD = 60; // % mínimo de adesão em 7 dias para estar "em dia"

// Fonte única de verdade das categorias — usada pela Rotina E pela Floresta.
// color = cor viva (gráficos/bordas), tint = fundo claro (AA com --text)
const CATEGORIES = [
  { id: "financeiro", label: "Financeiro", icon: "💰", color: "#F59E0B", tint: "#FEF3C7" },
  { id: "profissional", label: "Profissional", icon: "💼", color: "#7C5CFC", tint: "#EDE7FE" },
  { id: "ingles", label: "Inglês", icon: "🗣️", color: "#38BDF8", tint: "#E1F1FE" },
  { id: "pnl", label: "PNL", icon: "🧠", color: "#F472B6", tint: "#FDE6F2" },
  { id: "faculdade", label: "Faculdade", icon: "🎓", color: "#FF8A5C", tint: "#FFE8DC" },
  { id: "saude", label: "Saúde", icon: "❤️", color: "#4ADE80", tint: "#E3F8E9" },
  { id: "familiar", label: "Familiar", icon: "🏠", color: "#FB7185", tint: "#FFE4E6" },
  { id: "tarefas", label: "Tarefas", icon: "✅", color: "#64748B", tint: "#F1F5F9" },
];

function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

// Migração das categorias antigas da Rotina (função pura, idempotente)
const LEGACY_CATEGORY_MAP = { habito: "tarefas", trabalho: "profissional" };

function migrateCategory(cat) {
  if (CATEGORIES.some((c) => c.id === cat)) return cat;
  return LEGACY_CATEGORY_MAP[cat] || "tarefas";
}

// O ícone de um hábito é sempre o da sua categoria (campo habit.icon antigo
// pode existir no objeto salvo, mas é ignorado — sem migração destrutiva)
function iconForHabit(habit) {
  const cat = categoryById(habit.category);
  return cat ? cat.icon : "✅";
}

// Migração da paleta antiga de 6 cores → 4 (função pura, idempotente).
// Roxo, Azul e Rosa saíram da UI → viram Amarelo; verde/amarelo/laranja
// antigos vão para o tom novo da mesma família.
const LEGACY_COLOR_MAP = {
  "#7C5CFC": "#EAB308", // roxo → amarelo
  "#38BDF8": "#EAB308", // azul → amarelo
  "#F472B6": "#EAB308", // rosa → amarelo
  "#4ADE80": "#16A34A", // verde antigo → verde novo
  "#FBBF24": "#EAB308", // amarelo antigo → amarelo novo
  "#FF8A5C": "#EA580C", // laranja antigo → laranja novo
};

function migrateColor(color) {
  if (COLORS.includes(color)) return color;
  return LEGACY_COLOR_MAP[color] || DEFAULT_COLOR;
}

// Biblioteca de hábitos prontos (categorias já no vocabulário novo)
const LIBRARY = [
  { name: "Beber água", icon: "💧", category: "saude", color: "#38BDF8" },
  { name: "Correr", icon: "🏃", category: "saude", color: "#4ADE80" },
  { name: "Meditar", icon: "🧘", category: "saude", color: "#7C5CFC" },
  { name: "Ler", icon: "📖", category: "tarefas", color: "#F472B6" },
  { name: "Comer saudável", icon: "🥗", category: "saude", color: "#4ADE80" },
  { name: "Dormir cedo", icon: "😴", category: "saude", color: "#7C5CFC" },
  { name: "Escrever no diário", icon: "✍️", category: "tarefas", color: "#FBBF24" },
  { name: "Escovar os dentes", icon: "🦷", category: "saude", color: "#38BDF8" },
  { name: "Planejar o dia", icon: "🎯", category: "profissional", color: "#FF8A5C" },
  { name: "Tomar vitaminas", icon: "💊", category: "saude", color: "#F472B6" },
  { name: "Caminhar", icon: "🚶", category: "saude", color: "#4ADE80" },
  { name: "Menos celular", icon: "📵", category: "tarefas", color: "#FF8A5C" },
];

const XP_PER_MINUTE = 1;
const ABANDON_XP_FACTOR = 0.5; // ao abandonar, só 50% do XP do tempo decorrido

// =====================================================================
// Persistência — chave única "rotina-data":
// { habits: [...], completions: { "YYYY-MM-DD": [habitIds] }, settings: {...} }
// =====================================================================

const STORAGE_KEY = "rotina-data";

function initialState() {
  return { habits: [], completions: {}, settings: { notified: [] }, forest: normalizeForest(null) };
}

// Valida/normaliza o campo forest; recomputa totais a partir das sessões
// se estiverem ausentes ou corrompidos (função pura)
function normalizeForest(raw) {
  const f = raw && typeof raw === "object" ? raw : {};
  const sessions = Array.isArray(f.sessions) ? f.sessions : [];
  let totalXP = typeof f.totalXP === "number" ? f.totalXP : null;
  let xpByCategory =
    f.xpByCategory && typeof f.xpByCategory === "object" && !Array.isArray(f.xpByCategory)
      ? f.xpByCategory
      : null;
  if (totalXP === null || xpByCategory === null) {
    totalXP = 0;
    xpByCategory = {};
    for (const s of sessions) {
      const xp = typeof s.xp === "number" ? s.xp : 0;
      totalXP += xp;
      xpByCategory[s.category] = (xpByCategory[s.category] || 0) + xp;
    }
  }
  return { sessions, totalXP, xpByCategory };
}

// Valida hábitos e migra categorias antigas (função pura, idempotente)
function normalizeHabits(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof h === "object" && typeof h.id === "string" && typeof h.name === "string")
    .map((h) => Object.assign({}, h, {
      category: migrateCategory(h.category),
      color: migrateColor(h.color),
    }));
}

// Valida/normaliza um JSON bruto; retorna null se corrompido (função pura)
function parseState(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !Array.isArray(data.habits)) return null;
    const completions =
      data.completions && typeof data.completions === "object" && !Array.isArray(data.completions)
        ? data.completions
        : {};
    const settings =
      data.settings && typeof data.settings === "object" ? data.settings : {};
    if (!Array.isArray(settings.notified)) settings.notified = [];
    return {
      habits: normalizeHabits(data.habits),
      completions,
      settings,
      forest: normalizeForest(data.forest),
    };
  } catch (_) {
    return null;
  }
}

// Converte o formato antigo (3 chaves; completions por hábito) para o novo
function migrateLegacy() {
  if (localStorage.getItem("habits") === null) return null;
  try {
    const habits = JSON.parse(localStorage.getItem("habits")) || [];
    const byHabit = JSON.parse(localStorage.getItem("completions") || "{}");
    const notified = JSON.parse(localStorage.getItem("notified") || "[]");
    const completions = {};
    for (const [habitId, dates] of Object.entries(byHabit)) {
      if (!Array.isArray(dates)) continue;
      for (const d of dates) (completions[d] = completions[d] || []).push(habitId);
    }
    return {
      habits: normalizeHabits(habits),
      completions,
      settings: { notified: Array.isArray(notified) ? notified : [] },
      forest: normalizeForest(null),
    };
  } catch (_) {
    return null;
  }
}

function loadState() {
  const parsed = parseState(localStorage.getItem(STORAGE_KEY));
  if (parsed) return parsed;

  const migrated = migrateLegacy();
  if (migrated) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      ["habits", "completions", "notified"].forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
    return migrated;
  }

  if (localStorage.getItem(STORAGE_KEY) !== null) {
    console.warn("Rotina: dados corrompidos no LocalStorage, começando do zero.");
  }
  return initialState();
}

const store = {
  data: loadState(),
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (_) {}
  },
};

let selectedDate = startOfDay(new Date());
let selectedCategory = "todos";
let currentView = "rotina";

// =====================================================================
// Funções puras — datas
// =====================================================================

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

function getWeekDates(date) {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = addDays(date, diffToMonday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// 0 = segunda ... 6 = domingo
function weekdayIndex(date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

// =====================================================================
// Funções puras — agenda, conclusão, streak, adesão
// =====================================================================

function isScheduled(recurrence, date) {
  const days = recurrence && recurrence.length ? recurrence : [0, 1, 2, 3, 4, 5, 6];
  return days.includes(weekdayIndex(date));
}

// Hábito só conta a partir da data de criação (evita zerar métricas antigas)
function activeOn(habit, date) {
  return !habit.createdAt || dateKey(date) >= habit.createdAt;
}

function isDoneOn(completions, dateKeyStr, habitId) {
  return (completions[dateKeyStr] || []).includes(habitId);
}

function calcStreak(habit, completions, today) {
  let cursor = startOfDay(today);
  if (isScheduled(habit.recurrence, cursor) && !isDoneOn(completions, dateKey(cursor), habit.id)) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    if (!activeOn(habit, cursor)) break;
    if (!isScheduled(habit.recurrence, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!isDoneOn(completions, dateKey(cursor), habit.id)) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// Adesão de um hábito nos últimos `days` dias terminando em `endDate`
function adherence(habit, completions, endDate, days) {
  let scheduled = 0;
  let done = 0;
  const dots = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(startOfDay(endDate), -i);
    const sched = activeOn(habit, d) && isScheduled(habit.recurrence, d);
    const wasDone = sched && isDoneOn(completions, dateKey(d), habit.id);
    if (sched) {
      scheduled++;
      if (wasDone) done++;
    }
    dots.push(sched ? (wasDone ? "filled" : "") : "off");
  }
  const pct = scheduled ? Math.round((done / scheduled) * 100) : 0;
  return { scheduled, done, pct, dots };
}

function needsAttention(habit, completions, today) {
  return adherence(habit, completions, today, 7).pct < ATTENTION_THRESHOLD;
}

// % agregado de todos os hábitos nos últimos 7 dias
function weekSummary(habits, completions, today) {
  let scheduled = 0;
  let done = 0;
  for (const h of habits) {
    const a = adherence(h, completions, today, 7);
    scheduled += a.scheduled;
    done += a.done;
  }
  return { scheduled, done, pct: scheduled ? Math.round((done / scheduled) * 100) : 0 };
}

// % agregado num intervalo de datas (inclusive) — base dos gráficos
function percentForRange(habits, completions, startDate, endDate) {
  let scheduled = 0;
  let done = 0;
  const end = startOfDay(endDate);
  for (let d = startOfDay(startDate); d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    const key = dateKey(d);
    for (const h of habits) {
      if (!activeOn(h, d) || !isScheduled(h.recurrence, d)) continue;
      scheduled++;
      if (isDoneOn(completions, key, h.id)) done++;
    }
  }
  return scheduled ? Math.round((done / scheduled) * 100) : 0;
}

// Rótulos + valores do gráfico por período ("semana" | "mes" | "ano")
function chartData(period, habits, completions, today) {
  const t = startOfDay(today);
  const labels = [];
  const values = [];

  if (period === "semana") {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(t, -i);
      labels.push(`${WEEKDAY_LABELS[weekdayIndex(d)]} ${pad(d.getDate())}`);
      values.push(percentForRange(habits, completions, d, d));
    }
  } else if (period === "mes") {
    for (let i = 3; i >= 0; i--) {
      const end = addDays(t, -i * 7);
      const start = addDays(end, -6);
      labels.push(`${pad(start.getDate())}/${pad(start.getMonth() + 1)}`);
      values.push(percentForRange(habits, completions, start, end));
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const first = new Date(t.getFullYear(), t.getMonth() - i, 1);
      const lastOfMonth = new Date(t.getFullYear(), t.getMonth() - i + 1, 0);
      const end = lastOfMonth.getTime() > t.getTime() ? t : lastOfMonth;
      labels.push(capitalize(first.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")));
      values.push(percentForRange(habits, completions, first, end));
    }
  }
  return { labels, values };
}

// =====================================================================
// Funções puras — Floresta (XP, sessões, foco por categoria)
// =====================================================================

// XP de uma sessão: completa = minutos planejados; morta = 50% do decorrido
function sessionXP(status, plannedMinutes, elapsedSeconds) {
  if (status === "completed") return Math.round(plannedMinutes * XP_PER_MINUTE);
  return Math.floor((elapsedSeconds / 60) * XP_PER_MINUTE * ABANDON_XP_FACTOR);
}

// Acrescenta uma sessão à floresta sem mutar a original
function applySession(forest, session) {
  const xpByCategory = Object.assign({}, forest.xpByCategory);
  xpByCategory[session.category] = (xpByCategory[session.category] || 0) + session.xp;
  return {
    sessions: forest.sessions.concat([session]),
    totalXP: forest.totalXP + session.xp,
    xpByCategory,
  };
}

// Sessões de uma categoria ("todos" = sem filtro) — função pura
function filterSessions(sessions, categoryId) {
  if (!categoryId || categoryId === "todos") return sessions;
  return sessions.filter((s) => s.category === categoryId);
}

// XP e contagem de árvores de uma lista de sessões — função pura
function forestStats(sessions) {
  let totalXP = 0;
  let alive = 0;
  let dead = 0;
  for (const s of sessions) {
    totalXP += typeof s.xp === "number" ? s.xp : 0;
    if (s.status === "completed") alive++;
    else dead++;
  }
  return { totalXP, alive, dead };
}

// Minutos focados por categoria em [startMs, endMs] (timestamp de término)
function focusByCategory(sessions, startMs, endMs) {
  const minutes = {};
  for (const s of sessions) {
    const t = Date.parse(s.endedAt);
    if (Number.isNaN(t) || t < startMs || t > endMs) continue;
    minutes[s.category] = (minutes[s.category] || 0) + (s.actualMinutes || 0);
  }
  return minutes;
}

// Janela de datas equivalente aos períodos do gráfico de hábitos
function focusWindow(period, today) {
  const t = startOfDay(today);
  const endMs = addDays(t, 1).getTime() - 1;
  let start;
  if (period === "semana") start = addDays(t, -6);
  else if (period === "mes") start = addDays(t, -27);
  else start = new Date(t.getFullYear(), t.getMonth() - 11, 1);
  return { startMs: start.getTime(), endMs };
}

// Segundos → "MM:SS" (minutos podem passar de 99)
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// Valida a duração digitada: qualquer número positivo, sem limite artificial.
// Aceita vírgula decimal (pt-BR) — o input é type="text" para o campo mostrar
// exatamente o que foi digitado (regressão: "100" aparecia como "0,100")
function parseMinutes(value) {
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// =====================================================================
// Utilitários de UI
// =====================================================================

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tintFor(color) {
  const idx = COLORS.indexOf(color);
  return idx >= 0 ? TINTS[idx] : "#F1EEFB";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Picker de categoria compartilhado (modal de hábito + Floresta):
// mesmos botões, mesmas cores, mesmo padrão de aria-pressed
function buildCategoryPicker(containerId, onSelect) {
  const picker = document.getElementById(containerId);
  picker.innerHTML = "";
  for (const cat of CATEGORIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-option";
    btn.dataset.category = cat.id;
    btn.style.setProperty("--cat-color", cat.color);
    btn.style.setProperty("--cat-tint", cat.tint);
    btn.innerHTML = `<span aria-hidden="true">${cat.icon}</span>${cat.label}`;
    btn.addEventListener("click", () => onSelect(cat.id));
    picker.appendChild(btn);
  }
}

function refreshCategoryPicker(containerId, selectedId) {
  document.querySelectorAll(`#${containerId} .cat-option`).forEach((b) => {
    const sel = b.dataset.category === selectedId;
    b.classList.toggle("selected", sel);
    b.setAttribute("aria-pressed", String(sel));
  });
}

// sort: com horário primeiro (crescente), depois "dia todo"
function sortHabits(a, b) {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return 0;
}

function toggleCompletion(dateKeyStr, habitId) {
  const list = store.data.completions[dateKeyStr] || [];
  const idx = list.indexOf(habitId);
  if (idx === -1) list.push(habitId);
  else list.splice(idx, 1);
  if (list.length) store.data.completions[dateKeyStr] = list;
  else delete store.data.completions[dateKeyStr];
  store.save();
  render();
}

// =====================================================================
// Modais acessíveis (foco preso, Esc, foco devolvido ao fechar)
// =====================================================================

let openOverlay = null;
let lastFocused = null;

function focusableIn(container) {
  return Array.from(
    container.querySelectorAll("button, [href], input, select, textarea")
  ).filter((el) => !el.hidden && !el.disabled && el.offsetParent !== null);
}

function openDialog(overlayId, focusEl) {
  const overlay = document.getElementById(overlayId);
  lastFocused = document.activeElement;
  overlay.hidden = false;
  openOverlay = overlay;
  const target = focusEl || focusableIn(overlay)[0];
  if (target) target.focus();
}

function closeDialog() {
  if (!openOverlay) return;
  openOverlay.hidden = true;
  openOverlay = null;
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  lastFocused = null;
}

document.addEventListener("keydown", (e) => {
  if (!openOverlay) return;
  if (e.key === "Escape") {
    e.preventDefault();
    if (openOverlay.id === "modal-overlay") closeModal();
    else closeDialog();
    return;
  }
  if (e.key === "Tab") {
    const els = focusableIn(openOverlay);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// =====================================================================
// Troca de abas
// =====================================================================

const VIEWS = ["rotina", "floresta", "progresso"];

function switchView(view) {
  currentView = view;
  VIEWS.forEach((v) => {
    document.getElementById("view-" + v).hidden = v !== view;
  });
  document.getElementById("add-btn").style.display = view === "rotina" ? "" : "none";
  document.querySelectorAll(".nav-item").forEach((b) => {
    const active = b.dataset.view === view;
    b.classList.toggle("active", active);
    b.setAttribute("aria-current", active ? "page" : "false");
  });
  if (view === "progresso") renderProgress();
  if (view === "floresta") renderForest();
}

// =====================================================================
// Day strip
// =====================================================================

function renderDayStrip() {
  const container = document.getElementById("day-strip");
  container.innerHTML = "";
  const week = getWeekDates(selectedDate);
  const todayKeyStr = dateKey(new Date());

  week.forEach((d, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-cell";
    const selected = isSameDay(d, selectedDate);
    if (selected) btn.classList.add("selected");
    if (dateKey(d) === todayKeyStr) {
      btn.classList.add("today");
      btn.setAttribute("aria-current", "date");
    }
    btn.setAttribute("aria-pressed", String(selected));
    btn.setAttribute(
      "aria-label",
      capitalize(d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))
    );
    btn.innerHTML = `<span class="day-label" aria-hidden="true">${WEEKDAY_LABELS[i]}</span><span class="day-num" aria-hidden="true">${d.getDate()}</span>`;
    btn.addEventListener("click", () => {
      selectedDate = startOfDay(d);
      render();
    });
    container.appendChild(btn);
  });
}

// =====================================================================
// Chips de categoria
// =====================================================================

// Fileira de chips "Todos" + 8 categorias — componente único usado pela
// Rotina (filtro de hábitos), Floresta e Progresso (filtro de sessões)
function renderFilterChips(containerId, selectedId, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const chips = [{ id: "todos", label: "Todos", icon: "", color: "#7C5CFC", tint: "#EDE7FE" }].concat(CATEGORIES);

  chips.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (selectedId === cat.id ? " selected" : "");
    btn.setAttribute("aria-pressed", String(selectedId === cat.id));
    btn.style.setProperty("--cat-color", cat.color);
    btn.style.setProperty("--cat-tint", cat.tint);
    btn.innerHTML = cat.icon ? `<span aria-hidden="true">${cat.icon}</span>${cat.label}` : cat.label;
    btn.addEventListener("click", () => onSelect(cat.id));
    container.appendChild(btn);
  });
}

// =====================================================================
// Cards de hábito (aba Rotina)
// =====================================================================

function habitCard(habit) {
  const dKey = dateKey(selectedDate);
  const done = isDoneOn(store.data.completions, dKey, habit.id);

  const card = document.createElement("div");
  card.className = "habit-card";
  card.style.background = tintFor(habit.color);

  const icon = document.createElement("div");
  icon.className = "habit-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = iconForHabit(habit);
  card.appendChild(icon);

  const timeText = habit.time
    ? `${habit.reminder ? "🔔 " : "🕒 "}${habit.time}`
    : "Dia todo";

  const info = document.createElement("button");
  info.type = "button";
  info.className = "habit-info";
  info.setAttribute("aria-label", `Editar hábito ${habit.name}`);
  info.innerHTML = `
    <span class="habit-time">${timeText}</span>
    <span class="habit-name">${escapeHtml(habit.name)}</span>
  `;
  info.addEventListener("click", () => openModal(habit));
  card.appendChild(info);

  const checkBtn = document.createElement("button");
  checkBtn.type = "button";
  checkBtn.className = "check-btn" + (done ? " done" : "");
  checkBtn.setAttribute("aria-pressed", String(done));
  checkBtn.setAttribute("aria-label", `${done ? "Desmarcar" : "Concluir"} ${habit.name}`);
  checkBtn.textContent = done ? "✓" : "";
  checkBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCompletion(dKey, habit.id);
  });
  card.appendChild(checkBtn);

  return card;
}

function render() {
  renderDayStrip();
  renderFilterChips("category-chips", selectedCategory, (id) => {
    selectedCategory = id;
    render();
  });

  document.getElementById("day-title").textContent = isSameDay(selectedDate, new Date())
    ? "Hoje"
    : capitalize(selectedDate.toLocaleDateString("pt-BR", { weekday: "long" }));

  const list = document.getElementById("habit-list");
  list.innerHTML = "";

  const filtered = store.data.habits
    .filter((h) => (selectedCategory === "todos" || h.category === selectedCategory) && isScheduled(h.recurrence, selectedDate))
    .sort(sortHabits);
  document.getElementById("empty-state").hidden = filtered.length > 0;

  for (const habit of filtered) list.appendChild(habitCard(habit));

  if (currentView === "progresso") renderProgress();
}

// =====================================================================
// Aba Progresso
// =====================================================================

function metricsItem(habit) {
  const streak = calcStreak(habit, store.data.completions, new Date());
  const { scheduled, done, pct, dots } = adherence(habit, store.data.completions, new Date(), 7);
  const item = document.createElement("div");
  item.className = "metrics-item";
  item.innerHTML = `
    <div class="metrics-item-header">
      <div class="metrics-item-icon" style="background:${tintFor(habit.color)}" aria-hidden="true">${iconForHabit(habit)}</div>
      <div class="metrics-item-name">${escapeHtml(habit.name)}</div>
    </div>
    <div class="metrics-item-stats">
      <span>Semana: <b>${done}/${scheduled}</b> (${pct}%)</span>
      <span>Sequência: <b>${streak}</b> dia${streak === 1 ? "" : "s"}</span>
    </div>
    <div class="day-dots" aria-hidden="true">${dots.map((d) => `<div class="day-dot${d ? " " + d : ""}"></div>`).join("")}</div>
  `;
  return item;
}

function renderProgress() {
  const now = new Date();
  const todayKeyStr = dateKey(now);
  const habits = store.data.habits;
  const completions = store.data.completions;

  const week = weekSummary(habits, completions, now);
  const todayScheduled = habits.filter((h) => activeOn(h, now) && isScheduled(h.recurrence, now));
  const todayDone = todayScheduled.filter((h) => isDoneOn(completions, todayKeyStr, h.id)).length;

  document.getElementById("progress-summary").innerHTML = `
    <div class="big">${week.pct}%</div>
    <div class="label">da semana concluída (${week.done} de ${week.scheduled})</div>
    <div class="label">Hoje: ${todayDone} de ${todayScheduled.length} hábitos concluídos</div>
  `;

  const attention = document.getElementById("list-attention");
  const ontrack = document.getElementById("list-ontrack");
  attention.innerHTML = "";
  ontrack.innerHTML = "";

  const empty = habits.length === 0;
  document.getElementById("progress-empty").hidden = !empty;
  document.getElementById("progress-summary").hidden = empty;

  let attentionCount = 0;
  let ontrackCount = 0;

  for (const habit of habits) {
    if (needsAttention(habit, completions, now)) {
      attention.appendChild(metricsItem(habit));
      attentionCount++;
    } else {
      ontrack.appendChild(metricsItem(habit));
      ontrackCount++;
    }
  }

  document.getElementById("section-attention").hidden = attentionCount === 0;
  document.getElementById("section-ontrack").hidden = ontrackCount === 0;

  renderFilterChips("focus-filter-chips", forestFilter, (id) => {
    forestFilter = id;
    renderProgress();
  });

  renderChart();
}

// =====================================================================
// Gráficos — Chart.js via CDN, carregado só quando a aba Progresso abre
// =====================================================================

const CHART_SRC = "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js";
let chartJsPromise = null;
let chart = null;
let focusChart = null;
let chartPeriod = "semana";

function loadChartJs() {
  if (window.Chart) return Promise.resolve(true);
  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = CHART_SRC;
      // CORS permite o service worker cachear a resposta para uso offline
      s.crossOrigin = "anonymous";
      s.onload = () => resolve(true);
      s.onerror = () => {
        chartJsPromise = null; // permite tentar de novo quando voltar online
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }
  return chartJsPromise;
}

async function renderChart() {
  const hasHabits = store.data.habits.length > 0;
  const hasSessions = store.data.forest.sessions.length > 0;
  const area = document.getElementById("charts-area");
  area.hidden = !hasHabits && !hasSessions;
  if (area.hidden) return;

  const loaded = await loadChartJs();
  if (currentView !== "progresso") return;

  const fallback = document.getElementById("chart-fallback");
  const habitsCard = document.getElementById("chart-card-habits");
  const focusCard = document.getElementById("chart-card-focus");
  if (!loaded) {
    fallback.hidden = false;
    habitsCard.hidden = true;
    focusCard.hidden = true;
    return;
  }
  fallback.hidden = true;
  habitsCard.hidden = !hasHabits;
  focusCard.hidden = !hasSessions;
  if (hasHabits) updateHabitChart();
  if (hasSessions) updateFocusChart();
}

function updateHabitChart() {
  const { labels, values } = chartData(chartPeriod, store.data.habits, store.data.completions, new Date());

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update();
    return;
  }

  chart = new Chart(document.getElementById("progress-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: "#7C5CFC", borderRadius: 6, maxBarThickness: 26 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // altura vem do .chart-box
      animation: false, // evita jank em aparelhos de gama média
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.y}% concluído` } },
      },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } },
        x: { grid: { display: false } },
      },
    },
  });
}

// Horas focadas por categoria da Floresta, no mesmo período selecionado
// e respeitando o filtro de categoria compartilhado com a aba Floresta
function updateFocusChart() {
  const { startMs, endMs } = focusWindow(chartPeriod, new Date());
  const sessions = filterSessions(store.data.forest.sessions, forestFilter);
  const minutes = focusByCategory(sessions, startMs, endMs);
  const cats = CATEGORIES.filter((c) => (minutes[c.id] || 0) > 0);

  const box = document.getElementById("focus-chart").parentElement;
  const empty = document.getElementById("focus-empty");
  if (cats.length === 0) {
    box.hidden = true;
    empty.hidden = false;
    return;
  }
  box.hidden = false;
  empty.hidden = true;

  const labels = cats.map((c) => `${c.icon} ${c.label}`);
  const values = cats.map((c) => Math.round((minutes[c.id] / 60) * 10) / 10);
  const colors = cats.map((c) => c.color);

  if (focusChart) {
    focusChart.data.labels = labels;
    focusChart.data.datasets[0].data = values;
    focusChart.data.datasets[0].backgroundColor = colors;
    focusChart.update();
    return;
  }

  focusChart = new Chart(document.getElementById("focus-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 6, maxBarThickness: 22 }],
    },
    options: {
      indexAxis: "y", // barras horizontais: nomes de categoria legíveis no mobile
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.x}h focadas` } },
      },
      scales: {
        x: { min: 0, ticks: { callback: (v) => v + "h" } },
        y: { grid: { display: false } },
      },
    },
  });
}

function initPeriodPicker() {
  document.querySelectorAll(".period-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      chartPeriod = btn.dataset.period;
      document.querySelectorAll(".period-option").forEach((b) => {
        const sel = b.dataset.period === chartPeriod;
        b.classList.toggle("selected", sel);
        b.setAttribute("aria-pressed", String(sel));
      });
      renderChart();
    });
  });
}

// =====================================================================
// Modal: criar/editar hábito
// =====================================================================

let editingHabitId = null;
let selectedColor = DEFAULT_COLOR;
let formCategory = "tarefas";
let formRecurrence = new Set([0, 1, 2, 3, 4, 5, 6]);

function buildPickers() {
  const colorPicker = document.getElementById("color-picker");
  colorPicker.innerHTML = "";
  COLORS.forEach((color, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-option";
    btn.dataset.color = color;
    btn.setAttribute("aria-label", COLOR_LABELS[i]);
    btn.style.background = color;
    btn.addEventListener("click", () => {
      selectedColor = color;
      refreshPickerSelection();
    });
    colorPicker.appendChild(btn);
  });

  buildCategoryPicker("category-picker", (id) => {
    formCategory = id;
    refreshPickerSelection();
  });

  const weekdayPicker = document.getElementById("weekday-picker");
  weekdayPicker.innerHTML = "";
  WEEKDAY_LABELS.forEach((label, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "weekday-option";
    btn.textContent = label[0];
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", () => {
      if (formRecurrence.has(i)) formRecurrence.delete(i);
      else formRecurrence.add(i);
      refreshPickerSelection();
    });
    weekdayPicker.appendChild(btn);
  });

  document.querySelectorAll(".preset-link[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.preset === "daily") formRecurrence = new Set([0, 1, 2, 3, 4, 5, 6]);
      else if (btn.dataset.preset === "weekdays") formRecurrence = new Set([0, 1, 2, 3, 4]);
      refreshPickerSelection();
    });
  });
}

function refreshPickerSelection() {
  const mark = (el, sel) => {
    el.classList.toggle("selected", sel);
    el.setAttribute("aria-pressed", String(sel));
  };
  document.querySelectorAll(".color-option").forEach((b) => mark(b, b.dataset.color === selectedColor));
  refreshCategoryPicker("category-picker", formCategory);
  document.querySelectorAll("#weekday-picker .weekday-option").forEach((b, i) => mark(b, formRecurrence.has(i)));
}

function openModal(habit) {
  editingHabitId = habit ? habit.id : null;
  selectedColor = habit ? habit.color : DEFAULT_COLOR;
  formCategory = habit ? habit.category : "tarefas";
  formRecurrence = habit && habit.recurrence && habit.recurrence.length ? new Set(habit.recurrence) : new Set([0, 1, 2, 3, 4, 5, 6]);

  document.getElementById("modal-title").textContent = habit ? "Editar hábito" : "Novo hábito";
  document.getElementById("habit-name").value = habit ? habit.name : "";
  document.getElementById("habit-time").value = habit && habit.time ? habit.time : "";
  document.getElementById("habit-reminder").checked = habit ? !!habit.reminder : false;
  document.getElementById("delete-habit-btn").hidden = !habit;

  refreshPickerSelection();
  openDialog("modal-overlay", document.getElementById("habit-name"));
}

function closeModal() {
  document.getElementById("habit-form").reset();
  editingHabitId = null;
  closeDialog();
}

async function handleSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("habit-name").value.trim();
  if (!name || formRecurrence.size === 0) return;
  const recurrence = Array.from(formRecurrence).sort();
  const time = document.getElementById("habit-time").value || null;
  let reminder = document.getElementById("habit-reminder").checked && !!time;

  if (reminder) reminder = await ensureNotifPermission();

  if (editingHabitId) {
    const habit = store.data.habits.find((h) => h.id === editingHabitId);
    Object.assign(habit, { name, color: selectedColor, category: formCategory, recurrence, time, reminder });
  } else {
    store.data.habits.push({
      id: crypto.randomUUID(),
      name,
      color: selectedColor,
      category: formCategory,
      recurrence,
      time,
      reminder,
      createdAt: dateKey(new Date()),
    });
    selectedCategory = "todos"; // garante que o hábito recém-criado apareça
  }

  store.save();
  closeModal();
  render();
}

function handleDelete() {
  store.data.habits = store.data.habits.filter((h) => h.id !== editingHabitId);
  for (const key of Object.keys(store.data.completions)) {
    const list = store.data.completions[key].filter((id) => id !== editingHabitId);
    if (list.length) store.data.completions[key] = list;
    else delete store.data.completions[key];
  }
  store.save();
  closeModal();
  render();
}

// =====================================================================
// Biblioteca
// =====================================================================

function renderLibrary() {
  const grid = document.getElementById("library-grid");
  grid.innerHTML = "";
  LIBRARY.forEach((preset) => {
    const already = store.data.habits.some((h) => h.name.toLowerCase() === preset.name.toLowerCase());
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "library-item" + (already ? " added" : "");
    btn.setAttribute("aria-label", already ? `${preset.name} (já adicionado)` : `Adicionar ${preset.name}`);
    btn.innerHTML = `
      <div class="lib-icon" style="background:${tintFor(migrateColor(preset.color))}" aria-hidden="true">${iconForHabit(preset)}</div>
      <div class="lib-name">${preset.name}</div>
      <div class="lib-add" aria-hidden="true">${already ? "✓" : "+"}</div>
    `;
    btn.addEventListener("click", () => {
      if (store.data.habits.some((h) => h.name.toLowerCase() === preset.name.toLowerCase())) return;
      store.data.habits.push({
        id: crypto.randomUUID(),
        name: preset.name,
        color: migrateColor(preset.color),
        category: preset.category,
        recurrence: [0, 1, 2, 3, 4, 5, 6],
        time: null,
        reminder: false,
        createdAt: dateKey(new Date()),
      });
      selectedCategory = "todos"; // garante que o hábito recém-adicionado apareça
      store.save();
      renderLibrary();
      render();
    });
    grid.appendChild(btn);
  });
}

function openLibrary() {
  renderLibrary();
  openDialog("library-overlay");
}

// =====================================================================
// Floresta — sessões de foco (Pomodoro gamificado)
// =====================================================================

let forestPhase = "setup"; // "setup" | "running" | "result"
let forestCategory = CATEGORIES[0].id;
let forestFilter = "todos"; // filtro compartilhado: grid da Floresta + card de foco do Progresso
let forestState = { running: false, category: null, plannedMinutes: 0, startedAt: 0 };
let forestResult = null; // { status, xp }

// ---- Ticker: Web Worker (preciso em background); fallback raro p/ setInterval
let timerWorker = null;
let timerFallback = null;

function startTicker(seconds) {
  stopTicker();
  if (window.Worker) {
    if (!timerWorker) {
      timerWorker = new Worker("timer-worker.js");
      timerWorker.onmessage = (e) => {
        if (e.data.type === "tick") onTimerTick(e.data.remaining);
        else if (e.data.type === "done") completeForestSession();
      };
    }
    timerWorker.postMessage({ cmd: "start", seconds });
  } else {
    const deadline = Date.now() + seconds * 1000;
    timerFallback = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      onTimerTick(remaining);
      if (remaining <= 0) completeForestSession();
    }, 500);
  }
}

function stopTicker() {
  if (timerWorker) timerWorker.postMessage({ cmd: "stop" });
  if (timerFallback) {
    clearInterval(timerFallback);
    timerFallback = null;
  }
}

// Encerra a sessão liberando a thread do worker (recriado sob demanda
// no próximo start — evita manter um worker ocioso vivo indefinidamente)
function disposeTicker() {
  stopTicker();
  if (timerWorker) {
    timerWorker.terminate();
    timerWorker = null;
  }
}

function onTimerTick(remaining) {
  if (!forestState.running) return;
  document.getElementById("forest-countdown").textContent = formatDuration(remaining);
  // árvore cresce em 3 estágios conforme o progresso
  const progress = 1 - remaining / (forestState.plannedMinutes * 60);
  const stage = progress >= 2 / 3 ? "🌳" : progress >= 1 / 3 ? "🌿" : "🌱";
  const treeEl = document.getElementById("forest-tree");
  if (treeEl.textContent !== stage) treeEl.textContent = stage;
}

// ---- Ciclo de vida da sessão

function startForestSession(categoryId, minutes) {
  forestState = { running: true, category: categoryId, plannedMinutes: minutes, startedAt: Date.now() };
  forestPhase = "running";
  const cat = categoryById(categoryId);
  document.getElementById("forest-session-label").textContent = `${cat.icon} ${cat.label} — ${minutes} min`;
  document.getElementById("forest-tree").textContent = "🌱";
  document.getElementById("forest-countdown").textContent = formatDuration(minutes * 60);
  startTicker(minutes * 60);
  renderForest();
}

function saveForestSession(status, elapsedSeconds, xp) {
  const session = {
    id: crypto.randomUUID(),
    category: forestState.category,
    plannedMinutes: forestState.plannedMinutes,
    actualMinutes: Math.round((elapsedSeconds / 60) * 10) / 10,
    status,
    xp,
    endedAt: new Date().toISOString(),
  };
  store.data.forest = applySession(store.data.forest, session);
  store.save();
}

function completeForestSession() {
  if (!forestState.running) return;
  forestState.running = false;
  disposeTicker();
  const planned = forestState.plannedMinutes;
  const xp = sessionXP("completed", planned, planned * 60);
  saveForestSession("completed", planned * 60, xp);
  forestResult = { status: "completed", xp };
  forestPhase = "result";
  const cat = categoryById(forestState.category);
  showNotification("🌳 Árvore plantada!", `+${xp} XP em ${cat.label} — sessão de ${planned} min concluída.`);
  renderForest();
}

function failForestSession() {
  if (!forestState.running) return;
  forestState.running = false;
  disposeTicker();
  const elapsedSeconds = Math.min(
    forestState.plannedMinutes * 60,
    Math.round((Date.now() - forestState.startedAt) / 1000)
  );
  const xp = sessionXP("dead", forestState.plannedMinutes, elapsedSeconds);
  saveForestSession("dead", elapsedSeconds, xp);
  forestResult = { status: "dead", xp };
  forestPhase = "result";
  renderForest();
}

function handleForestSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("forest-minutes");
  const minutes = parseMinutes(input.value);
  if (minutes === null) {
    input.setCustomValidity("Digite um número de minutos maior que zero.");
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");
  startForestSession(forestCategory, minutes);
}

// ---- Renderização da aba

function renderForestGrid(sessions) {
  const section = document.getElementById("forest-history");
  const emptyEl = document.getElementById("forest-empty");
  const grid = document.getElementById("forest-grid");
  const totalGeral = store.data.forest.sessions.length;

  section.hidden = sessions.length === 0;
  emptyEl.hidden = sessions.length > 0;
  if (totalGeral === 0) {
    emptyEl.innerHTML = "Sua floresta está vazia.<br>Plante a primeira árvore acima. 🌱";
  } else if (sessions.length === 0) {
    const cat = categoryById(forestFilter);
    emptyEl.textContent = `Nenhuma árvore em ${cat ? cat.label : forestFilter} ainda. 🌱`;
  }
  grid.innerHTML = "";

  // mais recentes primeiro
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    const cat = categoryById(s.category);
    const dead = s.status === "dead";
    const cell = document.createElement("span");
    cell.className = "tree" + (dead ? " dead" : "");
    cell.style.background = cat ? cat.tint : "#F1EEFB";
    cell.textContent = "🌳";
    cell.setAttribute("role", "img");
    const when = new Date(s.endedAt).toLocaleDateString("pt-BR");
    const desc = `${cat ? cat.label : s.category}, ${s.plannedMinutes} min, ${dead ? "morta" : "completa"}, ${when}, +${s.xp} XP`;
    cell.setAttribute("aria-label", desc);
    cell.title = desc;
    grid.appendChild(cell);
  }
}

function renderForest() {
  renderFilterChips("forest-filter-chips", forestFilter, (id) => {
    forestFilter = id;
    renderForest();
  });

  const filtered = filterSessions(store.data.forest.sessions, forestFilter);
  const { totalXP, alive, dead } = forestStats(filtered);
  const cat = categoryById(forestFilter);
  const escopo = cat ? ` em ${cat.label}` : "";
  document.getElementById("forest-xp-summary").innerHTML = `
    <div class="big">⭐ ${totalXP} XP</div>
    <div class="label">${alive} árvore${alive === 1 ? "" : "s"} viva${alive === 1 ? "" : "s"} · ${dead} morta${dead === 1 ? "" : "s"}${escopo}</div>
  `;

  document.getElementById("forest-setup").hidden = forestPhase !== "setup";
  document.getElementById("forest-session").hidden = forestPhase !== "running";
  document.getElementById("forest-result").hidden = forestPhase !== "result";

  if (forestPhase === "result" && forestResult) {
    const completed = forestResult.status === "completed";
    document.getElementById("forest-result-icon").textContent = completed ? "🌳" : "🥀";
    document.getElementById("forest-result-title").textContent = completed
      ? "Sua árvore cresceu!"
      : "Sua árvore morreu…";
    document.getElementById("forest-result-text").textContent = completed
      ? `+${forestResult.xp} XP. Sessão concluída sem distrações.`
      : `Você saiu durante a sessão. +${forestResult.xp} XP (50% do tempo focado).`;
  }

  renderForestGrid(filtered);
}

// =====================================================================
// Backup — exportar / importar dados (LocalStorage é o único dado do usuário)
// =====================================================================

function setBackupStatus(msg) {
  document.getElementById("backup-status").textContent = msg;
}

function exportData() {
  const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rotina-backup-${dateKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setBackupStatus("Backup exportado. Guarde o arquivo num lugar seguro.");
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    // parseState valida e já aplica as migrações de categoria/cor,
    // então backups de versões antigas do app também funcionam
    const parsed = parseState(String(reader.result));
    if (!parsed) {
      setBackupStatus("Arquivo inválido: isto não parece um backup do Rotina. Nada foi alterado.");
      return;
    }
    const atual = store.data;
    const pergunta =
      `Substituir os dados atuais (${atual.habits.length} hábito(s), ` +
      `${atual.forest.sessions.length} árvore(s)) pelos do backup ` +
      `(${parsed.habits.length} hábito(s), ${parsed.forest.sessions.length} árvore(s))?`;
    if (!confirm(pergunta)) {
      setBackupStatus("Importação cancelada. Nada foi alterado.");
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (_) {
      setBackupStatus("Não foi possível salvar o backup (armazenamento cheio?). Nada foi alterado.");
      return;
    }
    location.reload(); // reidrata o app inteiro a partir do estado importado
  };
  reader.onerror = () => setBackupStatus("Não foi possível ler o arquivo.");
  reader.readAsText(file);
}

// =====================================================================
// Lembretes / notificações
// =====================================================================

async function ensureNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function showNotification(title, body) {
  const opts = { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png" };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {
      try { new Notification(title, opts); } catch (_) {}
    });
  } else {
    try { new Notification(title, opts); } catch (_) {}
  }
}

// Verifica hábitos com horário vencido e ainda não feitos → notifica uma vez por dia
function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const todayKeyStr = dateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const settings = store.data.settings;

  for (const habit of store.data.habits) {
    if (!habit.reminder || !habit.time) continue;
    if (!isScheduled(habit.recurrence, now)) continue;
    if (isDoneOn(store.data.completions, todayKeyStr, habit.id)) continue;

    const [h, m] = habit.time.split(":").map(Number);
    const habitMinutes = h * 60 + m;
    if (nowMinutes < habitMinutes) continue;

    const tag = `${habit.id}:${todayKeyStr}`;
    if (settings.notified.includes(tag)) continue;

    showNotification("Hora de: " + habit.name, "Não esqueça do seu hábito de hoje 💪");
    settings.notified.push(tag);
  }

  // limpa marcações antigas (mantém só de hoje)
  settings.notified = settings.notified.filter((t) => t.endsWith(todayKeyStr));
  store.save();
}

// =====================================================================
// Init
// =====================================================================

function init() {
  buildPickers();
  initPeriodPicker();
  buildCategoryPicker("forest-category-picker", (id) => {
    forestCategory = id;
    refreshCategoryPicker("forest-category-picker", forestCategory);
  });
  refreshCategoryPicker("forest-category-picker", forestCategory);
  render();

  // Floresta
  document.getElementById("forest-setup").addEventListener("submit", handleForestSubmit);
  document.getElementById("forest-giveup-btn").addEventListener("click", failForestSession);
  document.getElementById("forest-result-btn").addEventListener("click", () => {
    forestPhase = "setup";
    forestResult = null;
    document.getElementById("forest-minutes").value = ""; // sem valor residual
    renderForest();
  });
  // Facilita sobrescrever um valor existente num toque
  document.getElementById("forest-minutes").addEventListener("focus", (e) => e.target.select());
  // Page Visibility API: minimizar/trocar de app durante a sessão mata a árvore
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && forestState.running) failForestSession();
  });

  document.getElementById("add-btn").addEventListener("click", () => openModal(null));
  document.getElementById("cancel-btn").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  document.getElementById("habit-form").addEventListener("submit", handleSubmit);
  document.getElementById("delete-habit-btn").addEventListener("click", handleDelete);
  document.getElementById("clear-time-btn").addEventListener("click", () => {
    document.getElementById("habit-time").value = "";
    document.getElementById("habit-reminder").checked = false;
  });

  document.getElementById("library-btn").addEventListener("click", openLibrary);
  document.getElementById("close-library-btn").addEventListener("click", closeDialog);
  document.getElementById("library-overlay").addEventListener("click", (e) => {
    if (e.target.id === "library-overlay") closeDialog();
  });

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Backup
  document.getElementById("export-btn").addEventListener("click", exportData);
  const importInput = document.getElementById("import-file");
  document.getElementById("import-btn").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => {
    if (importInput.files && importInput.files[0]) handleImportFile(importInput.files[0]);
    importInput.value = ""; // permite reimportar o mesmo arquivo
  });

  checkReminders();
  setInterval(checkReminders, 60 * 1000);
}

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// =====================================================================
// Testes internos — console.assert sobre as funções puras
// (rodam uma vez no carregamento; não tocam no LocalStorage nem no DOM)
// =====================================================================

(function runSelfTests() {
  let failed = 0;
  const ok = (cond, msg) => {
    console.assert(cond, msg);
    if (!cond) failed++;
  };

  // 01/06/2026 é segunda-feira → 15/06/2026 também é segunda
  const monday = new Date(2026, 5, 15);

  ok(dateKey(new Date(2026, 0, 5)) === "2026-01-05", "dateKey com zero à esquerda");
  ok(weekdayIndex(monday) === 0, "weekdayIndex: segunda = 0");
  ok(weekdayIndex(new Date(2026, 5, 14)) === 6, "weekdayIndex: domingo = 6");
  ok(isScheduled([], monday) === true, "recorrência vazia = todos os dias");
  ok(isScheduled([5, 6], monday) === false, "seg não agendada em [sáb, dom]");

  // Streak simples: diário, feito sáb 13 e dom 14, hoje (seg 15) ainda não
  const daily = { id: "a", recurrence: [0, 1, 2, 3, 4, 5, 6] };
  const compA = { "2026-06-13": ["a"], "2026-06-14": ["a"] };
  ok(calcStreak(daily, compA, monday) === 2, "streak diário = 2 (hoje pendente não quebra)");
  ok(calcStreak(daily, {}, monday) === 0, "streak sem conclusões = 0");

  // Streak pulando dias não agendados: dias úteis, feito qui 11 e sex 12
  const weekdaysHabit = { id: "b", recurrence: [0, 1, 2, 3, 4] };
  const compB = { "2026-06-11": ["b"], "2026-06-12": ["b"] };
  ok(calcStreak(weekdaysHabit, compB, monday) === 2, "streak ignora fim de semana não agendado");

  // Adesão 7 dias (09–15/06): diário com 3 conclusões → 43%
  const compC = { "2026-06-09": ["a"], "2026-06-10": ["a"], "2026-06-11": ["a"] };
  const a1 = adherence(daily, compC, monday, 7);
  ok(a1.scheduled === 7 && a1.done === 3 && a1.pct === 43, "adesão 3/7 = 43%");
  ok(needsAttention(daily, compC, monday) === true, "43% < 60% → atenção");

  // Exatamente 60% não é "atenção": dias úteis (5 agendados em 09–15), 3 feitos
  const compD = { "2026-06-09": ["b"], "2026-06-10": ["b"], "2026-06-11": ["b"] };
  const a2 = adherence(weekdaysHabit, compD, monday, 7);
  ok(a2.scheduled === 5 && a2.done === 3 && a2.pct === 60, "adesão 3/5 = 60%");
  ok(needsAttention(weekdaysHabit, compD, monday) === false, "60% exato → em dia");

  // Adesão 100% e 0 agendados
  const a3 = adherence(daily, {
    "2026-06-09": ["a"], "2026-06-10": ["a"], "2026-06-11": ["a"], "2026-06-12": ["a"],
    "2026-06-13": ["a"], "2026-06-14": ["a"], "2026-06-15": ["a"],
  }, monday, 7);
  ok(a3.pct === 100, "adesão 7/7 = 100%");
  ok(adherence({ id: "x", recurrence: [5] }, {}, monday, 1).scheduled === 0,
    "dia não agendado não conta como agendado");

  // createdAt limita a janela: criado dom 14, feito 14 e 15 → 2/2 = 100%
  const fresh = { id: "f", recurrence: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-06-14" };
  const compF = { "2026-06-14": ["f"], "2026-06-15": ["f"] };
  const a4 = adherence(fresh, compF, monday, 7);
  ok(a4.scheduled === 2 && a4.pct === 100, "adesão ignora dias antes da criação");

  // Resumo da semana agrega hábitos: 3/7 + 3/5 = 6/12 = 50%
  const compCD = {
    "2026-06-09": ["a", "b"], "2026-06-10": ["a", "b"], "2026-06-11": ["a", "b"],
  };
  const w = weekSummary([daily, weekdaysHabit], compCD, monday);
  ok(w.scheduled === 12 && w.done === 6 && w.pct === 50, "resumo semanal agregado = 50%");

  // percentForRange de um único dia
  ok(percentForRange([daily], compA, new Date(2026, 5, 14), new Date(2026, 5, 14)) === 100,
    "percentForRange dia único feito = 100%");
  ok(percentForRange([daily], compA, monday, monday) === 0,
    "percentForRange dia único pendente = 0%");

  // chartData: semana tem 7 pontos, mês 4, ano 12
  ok(chartData("semana", [daily], compA, monday).values.length === 7, "gráfico semana = 7 barras");
  ok(chartData("mes", [daily], compA, monday).values.length === 4, "gráfico mês = 4 semanas");
  ok(chartData("ano", [daily], compA, monday).labels.length === 12, "gráfico ano = 12 meses");

  // parseState: fallback para dados corrompidos
  ok(parseState("{{{ lixo") === null, "JSON inválido → null");
  ok(parseState('{"habits": 5}') === null, "habits não-array → null");
  const p = parseState('{"habits": [], "completions": {"2026-06-15": ["a"]}}');
  ok(p && p.completions["2026-06-15"][0] === "a" && Array.isArray(p.settings.notified),
    "parseState normaliza settings ausente");
  ok(p && Array.isArray(p.forest.sessions) && p.forest.totalXP === 0,
    "parseState cria forest quando ausente");

  // Migração de categorias antigas → novas (4 casos)
  ok(migrateCategory("habito") === "tarefas", "migração: habito → tarefas");
  ok(migrateCategory("saude") === "saude", "migração: saude → saude");
  ok(migrateCategory("trabalho") === "profissional", "migração: trabalho → profissional");
  ok(migrateCategory("qualquer-lixo") === "tarefas", "migração: desconhecido → tarefas (fallback)");
  ok(migrateCategory("financeiro") === "financeiro", "migração é idempotente para ids novos");
  const pm = parseState('{"habits":[{"id":"1","name":"X","category":"trabalho"},{"id":"2","name":"Y","category":"habito"},"lixo"]}');
  ok(pm && pm.habits.length === 2 && pm.habits[0].category === "profissional" && pm.habits[1].category === "tarefas",
    "parseState migra categorias e descarta hábitos inválidos");

  // Floresta: XP
  ok(sessionXP("completed", 25, 25 * 60) === 25, "XP completo = minutos planejados");
  ok(sessionXP("completed", 90, 90 * 60) === 90, "XP completo sem teto artificial");
  ok(sessionXP("dead", 25, 10 * 60) === 5, "XP morto = 50% dos minutos decorridos");
  ok(sessionXP("dead", 25, 30) === 0, "XP morto com <2min decorridos = 0");

  // Floresta: applySession é imutável e acumula por categoria
  const f0 = { sessions: [], totalXP: 0, xpByCategory: {} };
  const f1 = applySession(f0, { category: "ingles", xp: 10, actualMinutes: 10, endedAt: "2026-06-15T10:00:00.000Z" });
  const f2 = applySession(f1, { category: "ingles", xp: 5, actualMinutes: 10, endedAt: "2026-06-15T11:00:00.000Z" });
  ok(f0.sessions.length === 0 && f1.totalXP === 10, "applySession não muta a floresta original");
  ok(f2.totalXP === 15 && f2.xpByCategory.ingles === 15 && f2.sessions.length === 2,
    "applySession acumula XP por categoria");

  // Floresta: foco por categoria respeita a janela de datas
  const sess = [
    { category: "ingles", actualMinutes: 30, endedAt: "2026-06-15T10:00:00" },
    { category: "ingles", actualMinutes: 15, endedAt: "2026-06-14T10:00:00" },
    { category: "pnl", actualMinutes: 20, endedAt: "2026-06-01T10:00:00" },
  ];
  const win = focusWindow("semana", monday); // 09–15/06
  const foco = focusByCategory(sess, win.startMs, win.endMs);
  ok(foco.ingles === 45 && foco.pnl === undefined, "foco semanal soma só a janela");
  const winAno = focusWindow("ano", monday);
  ok(focusByCategory(sess, winAno.startMs, winAno.endMs).pnl === 20, "janela anual inclui meses antigos");

  // Floresta: normalização recomputa totais corrompidos
  const fn = normalizeForest({ sessions: [{ category: "pnl", xp: 7 }], totalXP: "errado" });
  ok(fn.totalXP === 7 && fn.xpByCategory.pnl === 7, "normalizeForest recomputa totais");

  // Floresta: formatação e validação de entrada
  ok(formatDuration(90) === "01:30", "formatDuration 90s = 01:30");
  ok(formatDuration(3600) === "60:00", "formatDuration 1h = 60:00 (sem teto de 99)");
  ok(parseMinutes("25") === 25 && parseMinutes("2.5") === 2.5, "parseMinutes aceita positivos");
  ok(parseMinutes("0") === null && parseMinutes("-3") === null && parseMinutes("abc") === null,
    "parseMinutes rejeita zero, negativo e texto");

  // Regressão (bug "0,100"): o campo agora é texto e reflete o digitado;
  // o parse aceita vírgula decimal pt-BR sem concatenar nada
  ok(parseMinutes("100") === 100, "regressão: '100' vira exatamente 100");
  ok(parseMinutes("2,5") === 2.5, "vírgula decimal pt-BR aceita");
  ok(parseMinutes("0,100") === 0.1, "regressão: '0,100' é parseado como número");
  ok(parseMinutes(" 45 ") === 45, "espaços em volta são ignorados");

  // Ícone do hábito deriva sempre da categoria (campo icon antigo é ignorado)
  ok(iconForHabit({ category: "saude", icon: "💧" }) === "❤️",
    "ícone vem da categoria mesmo com campo icon antigo presente");
  ok(iconForHabit({ category: "financeiro" }) === "💰", "ícone derivado sem campo icon");
  ok(iconForHabit({ category: "ingles" }) === categoryById("ingles").icon,
    "derivação usa a mesma fonte da Floresta (categoryById)");

  // Migração de cor: 6 tons antigos → 4 novos (roxo/azul/rosa → amarelo)
  ok(migrateColor("#7C5CFC") === "#EAB308", "cor: roxo → amarelo");
  ok(migrateColor("#38BDF8") === "#EAB308", "cor: azul → amarelo");
  ok(migrateColor("#F472B6") === "#EAB308", "cor: rosa → amarelo");
  ok(migrateColor("#4ADE80") === "#16A34A", "cor: verde antigo → verde novo");
  ok(migrateColor("#16A34A") === "#16A34A" && migrateColor(migrateColor("#7C5CFC")) === "#EAB308",
    "migração de cor é idempotente");
  ok(migrateColor("cor-invalida") === "#EAB308", "cor desconhecida → amarelo (fallback)");
  const pcor = parseState('{"habits":[{"id":"1","name":"X","category":"saude","color":"#38BDF8"}]}');
  ok(pcor && pcor.habits[0].color === "#EAB308", "parseState migra cor antiga ao carregar");

  // Filtro de sessões por categoria (Floresta + Progresso)
  const fSess = [
    { category: "ingles", status: "completed", xp: 10 },
    { category: "pnl", status: "dead", xp: 2 },
    { category: "ingles", status: "dead", xp: 1 },
  ];
  ok(filterSessions(fSess, "ingles").length === 2, "filtro retorna só a categoria pedida");
  ok(filterSessions(fSess, "todos").length === 3, "'todos' retorna todas as sessões");
  ok(filterSessions(fSess, "saude").length === 0, "categoria sem sessão → lista vazia");
  const stIngles = forestStats(filterSessions(fSess, "ingles"));
  ok(stIngles.totalXP === 11 && stIngles.alive === 1 && stIngles.dead === 1,
    "stats do filtro: XP e árvores só da categoria");
  const stVazio = forestStats(filterSessions(fSess, "saude"));
  ok(stVazio.totalXP === 0 && stVazio.alive === 0 && stVazio.dead === 0,
    "categoria sem sessão → 0 XP, sem árvores");

  // Backup: roundtrip exportar (JSON.stringify) → importar (parseState)
  const estadoBackup = {
    habits: [{ id: "h", name: "Ler", category: "ingles", color: "#16A34A", recurrence: [0], time: null, reminder: false, createdAt: "2026-06-01" }],
    completions: { "2026-06-15": ["h"] },
    settings: { notified: [] },
    forest: {
      sessions: [{ id: "s", category: "pnl", plannedMinutes: 25, actualMinutes: 25, status: "completed", xp: 25, endedAt: "2026-06-15T10:00:00.000Z" }],
      totalXP: 25,
      xpByCategory: { pnl: 25 },
    },
  };
  const round = parseState(JSON.stringify(estadoBackup));
  ok(round && round.habits.length === 1 && round.habits[0].color === "#16A34A"
    && round.completions["2026-06-15"][0] === "h" && round.forest.totalXP === 25
    && round.forest.sessions[0].category === "pnl",
    "backup: roundtrip preserva hábitos, conclusões e floresta");

  if (failed === 0) console.log("✅ Rotina: todos os testes internos passaram");
  else console.warn(`❌ Rotina: ${failed} teste(s) interno(s) falharam`);
})();
