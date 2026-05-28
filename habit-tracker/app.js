const PROFILE_KEY = "ht_profile";
const SETTINGS_KEY = "ht_settings";
const HABITS_KEY = "ht_habits";
const COMPLETIONS_KEY = "ht_completions";
const CLOUD_TOKEN_KEY = "hf_cloud_token";
const CLOUD_EMAIL_KEY = "hf_cloud_email";

const defaultProfile = { name: "Friend", avatar: "🧑‍💻" };
const defaultSettings = {
  globalStart: "06:00",
  globalEnd: "22:00",
  notifyBefore: true,
  notifyMorning: true
};

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getProfile() {
  return { ...defaultProfile, ...readJson(PROFILE_KEY, defaultProfile) };
}

function saveProfile(obj) {
  writeJson(PROFILE_KEY, obj);
}

function getSettings() {
  return { ...defaultSettings, ...readJson(SETTINGS_KEY, defaultSettings) };
}

function saveSettings(obj) {
  writeJson(SETTINGS_KEY, obj);
}

function getHabits() {
  return readJson(HABITS_KEY, []);
}

function saveHabits(arr) {
  writeJson(HABITS_KEY, arr);
}

function getCompletions() {
  return readJson(COMPLETIONS_KEY, {});
}

function saveCompletions(obj) {
  writeJson(COMPLETIONS_KEY, obj);
}

function getHabitById(id) {
  return getHabits().find((habit) => habit.id === id) || null;
}

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function generateId() {
  return "h_" + Date.now();
}

function formatDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function getStreakCount(habitId) {
  const habitDays = getCompletions()[habitId] || {};
  const today = getTodayString();
  const keys = Object.keys(habitDays).filter((key) => key <= today).sort();
  let best = 0;
  let run = 0;

  keys.forEach((key, index) => {
    const entry = habitDays[key];
    const prev = keys[index - 1];
    const consecutive = !prev || dateKey(addDays(new Date(prev + "T00:00:00"), 1)) === key;
    if (entry.status === "done" || entry.status === "partial") {
      run = consecutive ? run + 1 : 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  });

  let current = 0;
  let expected = keys[keys.length - 1];
  for (let i = keys.length - 1; i >= 0 && expected; i -= 1) {
    const key = keys[i];
    const entry = habitDays[key];
    if (key !== expected || (entry.status !== "done" && entry.status !== "partial")) break;
    current += 1;
    expected = dateKey(addDays(new Date(key + "T00:00:00"), -1));
  }

  return { current, best };
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeToMinutes(time) {
  const normalized = normalizeTime(time);
  if (!normalized) return NaN;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizeTime(time) {
  const value = String(time || "").trim();
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function wireTimeInput(input) {
  input.addEventListener("blur", () => {
    const normalized = normalizeTime(input.value);
    if (normalized) input.value = normalized;
  });
}

function getHabitWindow(habit) {
  const settings = getSettings();
  return {
    start: habit.habitStart || settings.globalStart,
    end: habit.habitEnd || settings.globalEnd
  };
}

function windowState(habit) {
  const now = minutesNow();
  const window = getHabitWindow(habit);
  const start = timeToMinutes(window.start);
  const end = timeToMinutes(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "open";
  if (now < start) return "before";
  if (now > end) return "after";
  return "open";
}

function markMissedIfNeeded() {
  const today = getTodayString();
  const completions = getCompletions();
  let changed = false;

  getHabits().forEach((habit) => {
    const state = windowState(habit);
    completions[habit.id] = completions[habit.id] || {};
    if (state === "after" && !completions[habit.id][today]) {
      completions[habit.id][today] = {
        status: "missed",
        minutesLogged: 0,
        completedAt: null
      };
      changed = true;
    }
  });

  if (changed) saveCompletions(completions);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

function showToast(message, type = "success") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 3000);
}

function toast(message, type = "success") {
  showToast(message, type);
}

function showModal(title, message, confirmText, onConfirm) {
  let backdrop = document.querySelector(".modal-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal card">
        <h2 id="modalTitle"></h2>
        <p id="modalBody" class="muted"></p>
        <div class="actions">
          <button class="btn danger" id="modalConfirm">Delete</button>
          <button class="btn ghost" id="modalCancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
  }
  backdrop.querySelector("#modalTitle").textContent = title;
  backdrop.querySelector("#modalBody").textContent = message;
  backdrop.querySelector("#modalConfirm").textContent = confirmText;
  backdrop.querySelector("#modalConfirm").className = "btn danger";
  backdrop.querySelector("#modalCancel").textContent = "Cancel";
  backdrop.classList.add("open");
  backdrop.querySelector("#modalCancel").onclick = () => backdrop.classList.remove("open");
  backdrop.querySelector("#modalConfirm").onclick = () => {
    backdrop.classList.remove("open");
    onConfirm();
  };
  document.onkeydown = (event) => {
    if (event.key === "Escape") backdrop.classList.remove("open");
  };
}

function openModal(title, body, onConfirm, options = {}) {
  showModal(title, body, options.confirmText || "Delete", onConfirm);
  const confirm = document.querySelector("#modalConfirm");
  confirm.className = `btn ${options.confirmClass || "danger"}`;
}

function navMarkup(active) {
  const links = [
    ["index.html", "🏠", "Dashboard", "dashboard"],
    ["add-habit.html", "➕", "Add", "add"],
    ["timer.html", "⏱️", "Timer", "timer"],
    ["detail.html", "🔥", "Detail", "detail"],
    ["settings.html", "⚙️", "Settings", "settings"]
  ];
  const items = links.map(([href, icon, text, key]) => `
    <a class="nav-link ${active === key ? "active" : ""}" href="${href}">
      <span class="nav-icon">${icon}</span><span class="nav-text">${text}</span>
    </a>`).join("");
  return `<aside class="sidebar"><div class="brand"><span class="brand-mark">🔥</span><span>HabitFlow</span></div><nav class="nav-list">${items}</nav></aside><nav class="bottom-nav">${items}</nav>`;
}

function pageInit(active) {
  document.body.insertAdjacentHTML("afterbegin", navMarkup(active));
  registerServiceWorker();
  markMissedIfNeeded();
}

function formatLongDate(date) {
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function renderRing(logged, target, status) {
  const pct = Math.min(100, Math.round((logged / target) * 100) || 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const stroke = status === "done" ? "var(--color-success)" : status === "partial" ? "var(--color-accent)" : "var(--color-muted)";
  const center = status === "done" ? `<text x="54" y="62" text-anchor="middle" class="ring-check">✓</text>` : `<text x="54" y="57" text-anchor="middle" class="ring-text">${logged} / ${target}</text><text x="54" y="72" text-anchor="middle" class="ring-text">min</text>`;
  return `
    <svg class="progress-ring" viewBox="0 0 108 108" role="img" aria-label="${pct}% complete">
      <circle class="ring-bg" cx="54" cy="54" r="${radius}" fill="none" stroke-width="10"></circle>
      <circle class="ring-meter" cx="54" cy="54" r="${radius}" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
      ${center}
    </svg>`;
}

function initDashboard() {
  pageInit("dashboard");
  const toastMessage = qs("toast");
  if (toastMessage === "saved") toast("Habit saved! ✅");
  if (toastMessage === "deleted") toast("Habit deleted.");
  if (toastMessage) history.replaceState(null, "", "index.html");
  const profile = getProfile();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  document.querySelector("#greeting").textContent = `Good ${greeting}, ${profile.name}`;
  document.querySelector("#todayDate").textContent = formatLongDate(new Date());

  const habits = getHabits();
  const list = document.querySelector("#habitList");
  const empty = document.querySelector("#emptyState");
  if (!habits.length) {
    empty.hidden = false;
    list.hidden = true;
  } else {
    empty.hidden = true;
    list.hidden = false;
    const today = getTodayString();
    const completions = getCompletions();
    list.innerHTML = habits.map((habit) => {
      const entry = completions[habit.id]?.[today];
      const status = entry?.status || "none";
      const logged = entry?.minutesLogged || 0;
      const state = windowState(habit);
      let button = `<a class="btn primary" href="timer.html?id=${habit.id}" onclick="event.stopPropagation()">Start Timer</a>`;
      if (status === "done") button = `<button class="btn disabled" disabled onclick="event.stopPropagation()">✅ Done</button>`;
      const habitWindow = getHabitWindow(habit);
      if (status !== "done" && state === "before") button = `<button class="btn disabled" disabled title="This habit opens at ${habitWindow.start}" onclick="event.stopPropagation()">⏰ Not Yet</button>`;
      if (status !== "done" && state === "after") button = `<button class="btn disabled" disabled title="This habit closed at ${habitWindow.end}" onclick="event.stopPropagation()">⌛ Window Closed</button>`;
      return `
        <article class="habit-card card" onclick="location.href='detail.html?id=${habit.id}'">
          <div class="habit-top">
            <div class="habit-name-wrap"><span class="dot" style="background:${habit.color}"></span><span class="habit-name">${habit.name}</span></div>
            <span class="pill">${habit.category}</span>
          </div>
          <div class="progress-wrap">${renderRing(logged, habit.targetMinutes, status)}</div>
          <div class="habit-bottom"><span class="muted">${habitWindow.start} → ${habitWindow.end}</span>${button}</div>
        </article>`;
    }).join("");
  }

  const todayEntries = Object.values(getCompletions()).map((days) => days[getTodayString()]).filter(Boolean);
  document.querySelector("#completedCount").textContent = todayEntries.filter((entry) => entry.status === "done").length;
  document.querySelector("#missedCount").textContent = todayEntries.filter((entry) => entry.status === "missed").length;
  document.querySelector("#activeCount").textContent = habits.filter((habit) => getStreakCount(habit.id).current > 0).length;
}

const categoryColors = {
  Study: "#6C63FF",
  Health: "#22C55E",
  Fitness: "#F97316",
  Creative: "#EC4899",
  Other: "#8888AA"
};

function setFieldError(id, message) {
  const node = document.querySelector(`#${id}Error`);
  if (node) node.textContent = message;
}

function minutesFromDuration(value, unit) {
  return unit === "hours" ? value * 60 : value;
}

function durationFromMinutes(minutes) {
  if (minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

function initHabitForm() {
  pageInit("add");
  const id = qs("id");
  const habit = id ? getHabitById(id) : null;
  if (id && !habit) {
    location.href = "index.html";
    return;
  }

  const form = document.querySelector("#habitForm");
  const isEdit = Boolean(habit);
  const nameInput = form.elements.name;
  const notesInput = form.elements.notes;
  const categoryInput = form.elements.category;
  const colorInput = form.elements.color;
  const durationValue = form.elements.durationValue;
  const durationUnit = form.elements.durationUnit;
  const deleteButton = document.querySelector("#deleteHabitForm");
  const settings = getSettings();

  document.querySelector("#formTitle").textContent = isEdit ? "Edit Habit" : "Add New Habit";
  deleteButton.hidden = !isEdit;

  function updateCounters() {
    document.querySelector("#nameCounter").textContent = `${nameInput.value.length}/40`;
    document.querySelector("#notesCounter").textContent = `${notesInput.value.length}/200`;
  }

  function updateCategoryDot() {
    document.querySelector("#categoryDot").style.background = categoryColors[categoryInput.value] || categoryColors.Other;
  }

  function selectColor(color) {
    colorInput.value = color;
    document.querySelectorAll(".swatch").forEach((swatch) => {
      swatch.classList.toggle("selected", swatch.dataset.color === color);
    });
  }

  if (isEdit) {
    nameInput.value = habit.name;
    categoryInput.value = habit.category;
    selectColor(habit.color);
    const duration = durationFromMinutes(habit.targetMinutes);
    durationValue.value = duration.value;
    durationUnit.value = duration.unit;
    form.elements.habitStart.value = habit.habitStart || settings.globalStart;
    form.elements.habitEnd.value = habit.habitEnd || settings.globalEnd;
    form.elements.streakGoalDays.value = String(habit.streakGoalDays);
    notesInput.value = habit.notes || "";
  } else {
    categoryInput.value = "Study";
    selectColor("#6C63FF");
    durationValue.value = "";
    durationUnit.value = "hours";
    form.elements.habitStart.value = settings.globalStart || "06:00";
    form.elements.habitEnd.value = settings.globalEnd || "22:00";
    form.elements.streakGoalDays.value = "30";
  }

  updateCounters();
  updateCategoryDot();
  wireTimeInput(form.elements.habitStart);
  wireTimeInput(form.elements.habitEnd);

  nameInput.addEventListener("input", updateCounters);
  notesInput.addEventListener("input", updateCounters);
  categoryInput.addEventListener("change", updateCategoryDot);
  document.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => selectColor(swatch.dataset.color));
  });

  if (isEdit) {
    deleteButton.addEventListener("click", () => {
      openModal(
        `Delete ${habit.name}?`,
        "This will remove all streak history. This cannot be undone.",
        () => {
          saveHabits(getHabits().filter((item) => item.id !== habit.id));
          const completions = getCompletions();
          delete completions[habit.id];
          saveCompletions(completions);
          location.href = "index.html?toast=deleted";
        },
        { confirmText: "Yes, Delete", confirmClass: "danger" }
      );
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    ["name", "category", "color", "duration", "time", "streak", "notes"].forEach((field) => setFieldError(field, ""));

    const name = nameInput.value.trim();
    const category = categoryInput.value;
    const color = colorInput.value;
    const amount = Number(durationValue.value);
    const habitStart = normalizeTime(form.elements.habitStart.value || settings.globalStart || "06:00");
    const habitEnd = normalizeTime(form.elements.habitEnd.value || settings.globalEnd || "22:00");
    form.elements.habitStart.value = habitStart;
    form.elements.habitEnd.value = habitEnd;
    const streakGoalDays = Number(form.elements.streakGoalDays.value);
    const notes = notesInput.value.trim();
    let valid = true;

    if (!name) {
      setFieldError("name", "Habit name is required.");
      valid = false;
    }
    if (!category) {
      setFieldError("category", "Category is required.");
      valid = false;
    }
    if (!color) {
      setFieldError("color", "Choose a color tag.");
      valid = false;
    }
    if (!Number.isFinite(amount) || amount < 1 || amount > 999) {
      setFieldError("duration", "Enter a duration from 1 to 999.");
      valid = false;
    }
    if (!habitStart || !habitEnd) {
      setFieldError("time", "Start and end times are required.");
      valid = false;
    } else if (!Number.isFinite(timeToMinutes(habitStart)) || !Number.isFinite(timeToMinutes(habitEnd))) {
      setFieldError("time", "Use 24-hour time like 03:00 or 17:30.");
      valid = false;
    } else if (timeToMinutes(habitEnd) <= timeToMinutes(habitStart)) {
      setFieldError("time", "End time must be after start time.");
      valid = false;
    }
    if (!streakGoalDays) {
      setFieldError("streak", "Choose a streak goal.");
      valid = false;
    }
    if (notes.length > 200) {
      setFieldError("notes", "Notes must be 200 characters or less.");
      valid = false;
    }
    if (!valid) return;

    const saved = {
      id: habit?.id || generateId(),
      name,
      category,
      color,
      targetMinutes: minutesFromDuration(amount, durationUnit.value),
      habitStart,
      habitEnd,
      streakGoalDays,
      createdAt: habit?.createdAt || new Date().toISOString(),
      notes
    };
    const habits = getHabits();
    const next = isEdit ? habits.map((item) => item.id === habit.id ? saved : item) : [...habits, saved];
    saveHabits(next);
    location.href = "index.html?toast=saved";
  });
}

let timerInterval = null;
let elapsedSeconds = 0;
let totalSeconds = 0;
let activeHabit = null;
let timerRunning = false;
let timerDisabled = false;
let ringCircumference = 0;
let timerStartedAt = null;
let baseElapsedSeconds = 0;

const TIMER_STATE_KEY = "ht_timer_state";

function saveTimerState() {
  if (!activeHabit) return;
  const state = {
    habitId: activeHabit.id,
    date: getTodayString(),
    elapsedSeconds,
    baseElapsedSeconds,
    timerRunning,
    timerStartedAt
  };
  localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(state));
}

function loadTimerState() {
  const stored = localStorage.getItem(TIMER_STATE_KEY);
  if (!stored) return null;
  try {
    const state = JSON.parse(stored);
    if (state.habitId !== activeHabit?.id || state.date !== getTodayString()) {
      localStorage.removeItem(TIMER_STATE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function clearTimerState() {
  localStorage.removeItem(TIMER_STATE_KEY);
}

function formatSeconds(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function paintTimer() {
  if (timerRunning && timerStartedAt) {
    elapsedSeconds = Math.min(totalSeconds, baseElapsedSeconds + Math.floor((Date.now() - timerStartedAt) / 1000));
  }
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  document.querySelector("#timerDisplay").textContent = formatSeconds(remainingSeconds);
  document.querySelector("#elapsedTime").textContent = formatSeconds(elapsedSeconds);
  const meter = document.querySelector("#countdownMeter");
  if (meter && totalSeconds > 0) {
    meter.style.strokeDashoffset = ringCircumference * (remainingSeconds / totalSeconds);
  }
}

function stopTimer() {
  if (timerRunning && timerStartedAt) {
    elapsedSeconds = Math.min(totalSeconds, baseElapsedSeconds + Math.floor((Date.now() - timerStartedAt) / 1000));
  }
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  timerStartedAt = null;
  baseElapsedSeconds = elapsedSeconds;
  saveTimerState();
  const button = document.querySelector("#startPauseBtn");
  if (button && !timerDisabled) button.textContent = "▶ Start";
}

function completeHabit(habitId, minutesLogged, status) {
  const habit = getHabitById(habitId);
  if (!habit) return;
  const completions = getCompletions();
  completions[habitId] = completions[habitId] || {};
  completions[habitId][getTodayString()] = {
    status,
    minutesLogged,
    completedAt: new Date().toISOString()
  };
  saveCompletions(completions);
  if (status === "done") showCelebration(habit);
}

function showCelebration(habit) {
  const streak = getStreakCount(habit.id);
  const overlay = document.createElement("div");
  overlay.className = "celebration-overlay open";
  overlay.innerHTML = `
    <div class="celebration-box">
      <div class="celebration-check">✓</div>
      <h2 class="celebration-title">🔥 Habit Complete!</h2>
      <p class="celebration-habit" style="color:${habit.color}">${habit.name}</p>
      <p class="muted">Current Streak: ${streak.current} days</p>
      <p class="muted">Best Streak: ${streak.best} days</p>
      <div class="actions">
        <a class="btn primary" href="index.html">🏠 Go Home</a>
        <a class="btn ghost" href="detail.html?id=${habit.id}">📋 View Streak</a>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function finishFullTimer() {
  stopTimer();
  clearTimerState();
  document.querySelector("#countdownMeter").classList.add("done");
  completeHabit(activeHabit.id, activeHabit.targetMinutes, "done");
}

function startTimer() {
  if (timerRunning || timerDisabled) return;
  timerRunning = true;
  timerStartedAt = Date.now();
  saveTimerState();
  document.querySelector("#startPauseBtn").textContent = "⏸ Pause";
  timerInterval = setInterval(() => {
    paintTimer();
    if (totalSeconds - elapsedSeconds <= 0) finishFullTimer();
  }, 1000);
}

function initTimer() {
  pageInit("timer");
  const id = qs("id");
  activeHabit = id ? getHabitById(id) : null;
  if (!activeHabit) {
    location.href = "index.html";
    return;
  }

  const todaysEntry = getCompletions()[activeHabit.id]?.[getTodayString()];
  document.querySelector("#timerHabitName").textContent = activeHabit.name;
  document.querySelector("#timerHabitName").style.color = activeHabit.color;
  if (todaysEntry?.status === "done") {
    document.querySelector("#timerPanel").innerHTML = `<div class="empty-box"><div class="empty-emoji">🎉</div><h2>You already completed this habit today! 🎉</h2><a class="btn primary" href="index.html">Back</a></div>`;
    return;
  }

  totalSeconds = activeHabit.targetMinutes * 60;

  const savedState = loadTimerState();
  if (savedState) {
    elapsedSeconds = savedState.elapsedSeconds;
    baseElapsedSeconds = savedState.baseElapsedSeconds;
    timerRunning = false;
    timerStartedAt = null;
  } else {
    elapsedSeconds = 0;
    baseElapsedSeconds = 0;
  }

  const meter = document.querySelector("#countdownMeter");
  const radius = Number(meter.getAttribute("r"));
  ringCircumference = 2 * Math.PI * radius;
  meter.style.strokeDasharray = ringCircumference;
  meter.style.strokeDashoffset = ringCircumference;

  document.querySelector("#timerCategory").textContent = activeHabit.category;
  document.querySelector("#timerCategory").style.background = activeHabit.color;
  const activeWindow = getHabitWindow(activeHabit);
  document.querySelector("#timerWindow").textContent = `${activeWindow.start} → ${activeWindow.end}`;
  document.querySelector("#timerTarget").textContent = activeHabit.targetMinutes;

  if (windowState(activeHabit) !== "open") {
    timerDisabled = true;
    const warning = document.querySelector("#timerWarning");
    warning.textContent = `⚠️ Outside your habit window (${activeWindow.start} – ${activeWindow.end}). Timer is disabled.`;
    warning.hidden = false;
    ["#startPauseBtn", "#resetBtn", "#doneEarlyBtn"].forEach((selector) => {
      document.querySelector(selector).disabled = true;
      document.querySelector(selector).classList.add("disabled");
    });
  }
  paintTimer();

  document.querySelector("#startPauseBtn").onclick = () => {
    if (timerRunning) {
      stopTimer();
    } else {
      startTimer();
    }
  };

  document.querySelector("#resetBtn").onclick = () => {
    openModal("Reset timer?", "This stops the timer and resets it to the full target duration.", () => {
      stopTimer();
      elapsedSeconds = 0;
      baseElapsedSeconds = 0;
      clearTimerState();
      document.querySelector("#countdownMeter").classList.remove("done");
      paintTimer();
    }, { confirmText: "Reset", confirmClass: "primary" });
  };

  document.querySelector("#doneEarlyBtn").onclick = () => {
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    openModal(`You completed ${elapsedMinutes} of ${activeHabit.targetMinutes} minutes.`, "Mark as partial or cancel?", () => {
      stopTimer();
      clearTimerState();
      completeHabit(activeHabit.id, elapsedMinutes, "partial");
      toast(`Logged ${elapsedMinutes} min for ${activeHabit.name}`);
    }, { confirmText: "Mark Partial", confirmClass: "primary" });
  };
}

function initDetail() {
  pageInit("detail");
  const habit = getHabitById(qs("id")) || getHabits()[0];
  if (!habit) {
    document.querySelector("#detailPanel").innerHTML = `<div class="empty-box"><div class="empty-emoji">🔥</div><h2>No habit to show</h2><a class="btn primary" href="add-habit.html">➕ Add Habit</a></div>`;
    return;
  }
  const streak = getStreakCount(habit.id);
  document.querySelector("#detailName").textContent = habit.name;
  document.querySelector("#detailCategory").textContent = habit.category;
  document.querySelector("#detailCategory").style.background = habit.color;
  document.querySelector("#detailTarget").textContent = `${habit.targetMinutes} min daily`;
  const detailWindow = getHabitWindow(habit);
  document.querySelector("#detailWindow").textContent = `${detailWindow.start} → ${detailWindow.end}`;
  document.querySelector("#detailStreak").textContent = `${streak.current} / ${habit.streakGoalDays} days`;
  document.querySelector("#detailBest").textContent = `${streak.best} days`;
  document.querySelector("#detailNotes").textContent = habit.notes || "No notes added.";
  document.querySelector("#editHabit").href = `add-habit.html?id=${habit.id}`;
  document.querySelector("#startHabit").href = `timer.html?id=${habit.id}`;
  document.querySelector("#deleteHabit").onclick = () => openModal("Delete habit?", "This removes the habit and its completion history.", () => {
    saveHabits(getHabits().filter((item) => item.id !== habit.id));
    const completions = getCompletions();
    delete completions[habit.id];
    saveCompletions(completions);
    location.href = "index.html";
  });

  const calendar = document.querySelector("#calendar");
  const days = getCompletions()[habit.id] || {};
  const today = new Date(getTodayString() + "T00:00:00");
  calendar.innerHTML = Array.from({ length: 35 }, (_, index) => {
    const day = addDays(today, index - 34);
    const key = dateKey(day);
    const status = days[key]?.status || "";
    return `<div class="day-cell ${status}" title="${key}">${day.getDate()}</div>`;
  }).join("");
}

function initSettings() {
  pageInit("settings");
  const profile = getProfile();
  const settings = getSettings();
  const form = document.querySelector("#settingsForm");
  form.elements.name.value = profile.name;
  form.elements.avatar.value = profile.avatar;
  form.elements.globalStart.value = settings.globalStart;
  form.elements.globalEnd.value = settings.globalEnd;
  form.elements.notifyBefore.checked = settings.notifyBefore;
  form.elements.notifyMorning.checked = settings.notifyMorning;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    saveProfile({ name: data.get("name").trim() || "Friend", avatar: data.get("avatar").trim() || "🧑‍💻" });
    saveSettings({
      globalStart: data.get("globalStart"),
      globalEnd: data.get("globalEnd"),
      notifyBefore: form.elements.notifyBefore.checked,
      notifyMorning: form.elements.notifyMorning.checked
    });
    toast("Settings saved");
  });
}

function navMarkup(active) {
  const links = [
    ["index.html", "🏠", "Dashboard", "dashboard"],
    ["add-habit.html", "➕", "Add", "add"],
    ["timer.html", "⏱️", "Timer", "timer"],
    ["detail.html", "🔥", "Detail", "detail"],
    ["settings.html", "⚙️", "Settings", "settings"]
  ];
  const items = links.map(([href, icon, text, key]) => `
    <a class="nav-link ${active === key ? "active" : ""}" href="${href}">
      <span class="nav-icon">${icon}</span><span class="nav-text">${text}</span>
    </a>`).join("");
  return `<aside class="sidebar"><div class="brand"><span class="brand-mark">🔥</span><span>HabitFlow</span></div><nav class="nav-list">${items}</nav><div class="sync-status" id="syncStatus"><span class="sync-dot"></span><span id="syncText">Online</span></div></aside><nav class="bottom-nav">${items}</nav>`;
}

function updateSyncIndicator() {
  const status = document.querySelector("#syncStatus");
  const text = document.querySelector("#syncText");
  if (!status || !text) return;
  const online = navigator.onLine;
  status.classList.toggle("offline", !online);
  text.textContent = online ? "Online" : "Offline";
}

window.addEventListener("online", updateSyncIndicator);
window.addEventListener("offline", updateSyncIndicator);

function pageInit(active) {
  document.body.insertAdjacentHTML("afterbegin", navMarkup(active));
  registerServiceWorker();
  markMissedIfNeeded();
  updateSyncIndicator();
  maybeNotifyClosingWindows();
}

function maybeNotifyClosingWindows() {
  const settings = getSettings();
  if (!settings.notifyBefore || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = minutesNow();
  getHabits().forEach((habit) => {
    const remaining = timeToMinutes(getHabitWindow(habit).end) - now;
    const todayEntry = getCompletions()[habit.id]?.[getTodayString()];
    if (remaining > 0 && remaining <= 15 && !todayEntry) {
      new Notification("Habit window closing soon", {
        body: `${habit.name} closes in ${remaining} min.`
      });
    }
  });
}

function maybeShowMorningSummary() {
  const settings = getSettings();
  if (!settings.notifyMorning) return;
  const today = getTodayString();
  const habits = getHabits();
  const completions = getCompletions();
  const pending = habits.filter((habit) => !completions[habit.id]?.[today]).length;
  if (pending > 0) showToast(`Morning summary: ${pending} habit${pending === 1 ? "" : "s"} waiting today.`, "warning");
}

function getAppDataBundle() {
  return {
    ht_profile: getProfile(),
    ht_settings: getSettings(),
    ht_habits: getHabits(),
    ht_completions: getCompletions()
  };
}

function applyAppDataBundle(data) {
  saveProfile(data.ht_profile);
  saveSettings(data.ht_settings);
  saveHabits(data.ht_habits);
  saveCompletions(data.ht_completions);
}

function getCloudToken() {
  return sessionStorage.getItem(CLOUD_TOKEN_KEY);
}

function setCloudSession(token, email) {
  if (token) sessionStorage.setItem(CLOUD_TOKEN_KEY, token);
  if (email) sessionStorage.setItem(CLOUD_EMAIL_KEY, email);
}

function clearCloudSession() {
  sessionStorage.removeItem(CLOUD_TOKEN_KEY);
  sessionStorage.removeItem(CLOUD_EMAIL_KEY);
}

async function cloudRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getCloudToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Cloud request failed.");
  return data;
}

function initDashboard() {
  pageInit("dashboard");
  const toastMessage = qs("toast");
  if (toastMessage === "saved") showToast("Habit saved! ✅", "success");
  if (toastMessage === "deleted") showToast("Habit deleted.", "success");
  if (toastMessage) history.replaceState(null, "", "index.html");
  maybeShowMorningSummary();
  const profile = getProfile();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  document.querySelector("#greeting").textContent = `Good ${greeting}, ${profile.name}`;
  document.querySelector("#todayDate").textContent = formatDate(getTodayString());

  const habits = getHabits();
  const list = document.querySelector("#habitList");
  const empty = document.querySelector("#emptyState");
  if (!habits.length) {
    empty.hidden = false;
    list.hidden = true;
  } else {
    empty.hidden = true;
    list.hidden = false;
    const today = getTodayString();
    const completions = getCompletions();
    list.innerHTML = habits.map((habit) => {
      const entry = completions[habit.id]?.[today];
      const status = entry?.status || "none";
      const logged = entry?.minutesLogged || 0;
      const state = windowState(habit);
      let button = `<a class="btn primary" href="timer.html?id=${habit.id}" onclick="event.stopPropagation()">Start Timer</a>`;
      if (status === "done") button = `<button class="btn disabled" disabled onclick="event.stopPropagation()">✅ Done</button>`;
      const habitWindow = getHabitWindow(habit);
      if (status !== "done" && state === "before") button = `<button class="btn disabled" disabled title="This habit opens at ${habitWindow.start}" onclick="event.stopPropagation()">⏰ Not Yet</button>`;
      if (status !== "done" && state === "after") button = `<button class="btn disabled" disabled title="This habit closed at ${habitWindow.end}" onclick="event.stopPropagation()">⌛ Window Closed</button>`;
      return `
        <article class="habit-card card" onclick="location.href='detail.html?id=${habit.id}'">
          <div class="habit-top">
            <div class="habit-name-wrap"><span class="dot" style="background:${habit.color}"></span><span class="habit-name">${habit.name}</span></div>
            <span class="pill">${habit.category}</span>
          </div>
          <div class="progress-wrap">${renderRing(logged, habit.targetMinutes, status)}</div>
          <div class="habit-bottom"><span class="muted">${habitWindow.start} → ${habitWindow.end}</span>${button}</div>
        </article>`;
    }).join("");
  }

  const todayEntries = Object.values(getCompletions()).map((days) => days[getTodayString()]).filter(Boolean);
  document.querySelector("#completedCount").textContent = todayEntries.filter((entry) => entry.status === "done").length;
  document.querySelector("#missedCount").textContent = todayEntries.filter((entry) => entry.status === "missed").length;
  document.querySelector("#activeCount").textContent = habits.filter((habit) => getStreakCount(habit.id).current > 0).length;
}

function initSettings() {
  pageInit("settings");
  const avatarOptions = Array.from(document.querySelectorAll(".avatar-option"));
  const form = document.querySelector("#settingsForm");
  const profile = getProfile();
  const settings = getSettings();
  let notifyBefore = Boolean(settings.notifyBefore);
  let notifyMorning = Boolean(settings.notifyMorning);

  function selectAvatar(avatar) {
    form.elements.avatar.value = avatar;
    avatarOptions.forEach((button) => button.classList.toggle("selected", button.dataset.avatar === avatar));
  }

  function paintToggle(button, value) {
    button.classList.toggle("on", value);
    button.setAttribute("aria-pressed", String(value));
  }

  form.elements.name.value = profile.name || "";
  form.elements.globalStart.value = settings.globalStart;
  form.elements.globalEnd.value = settings.globalEnd;
  wireTimeInput(form.elements.globalStart);
  wireTimeInput(form.elements.globalEnd);
  selectAvatar(profile.avatar || "🧑‍💻");
  paintToggle(document.querySelector("#notifyBefore"), notifyBefore);
  paintToggle(document.querySelector("#notifyMorning"), notifyMorning);

  avatarOptions.forEach((button) => button.addEventListener("click", () => selectAvatar(button.dataset.avatar)));
  document.querySelector("#notifyBefore").addEventListener("click", () => {
    notifyBefore = !notifyBefore;
    paintToggle(document.querySelector("#notifyBefore"), notifyBefore);
    if (notifyBefore && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
  });
  document.querySelector("#notifyMorning").addEventListener("click", () => {
    notifyMorning = !notifyMorning;
    paintToggle(document.querySelector("#notifyMorning"), notifyMorning);
  });

  document.querySelector("#exportData").addEventListener("click", () => {
    const backup = {
      ht_profile: getProfile(),
      ht_settings: getSettings(),
      ht_habits: getHabits(),
      ht_completions: getCompletions()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `habitflow-backup-${getTodayString()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  document.querySelector("#importData").addEventListener("click", () => document.querySelector("#importFile").click());
  document.querySelector("#importFile").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const keys = [PROFILE_KEY, SETTINGS_KEY, HABITS_KEY, COMPLETIONS_KEY];
        if (!keys.every((key) => Object.prototype.hasOwnProperty.call(data, key))) throw new Error("Invalid backup");
        saveProfile(data.ht_profile);
        saveSettings(data.ht_settings);
        saveHabits(data.ht_habits);
        saveCompletions(data.ht_completions);
        showToast("Data imported successfully ✅", "success");
        setTimeout(() => location.reload(), 1500);
      } catch {
        showToast("Import failed. Choose a valid HabitFlow backup.", "error");
      }
    };
    reader.readAsText(file);
  });

  document.querySelector("#clearAllData").addEventListener("click", () => {
    showModal("Delete everything?", "This will permanently delete all habits, streaks, and settings. Are you sure?", "Yes, Delete Everything", () => {
      [PROFILE_KEY, SETTINGS_KEY, HABITS_KEY, COMPLETIONS_KEY].forEach((key) => localStorage.removeItem(key));
      clearCloudSession();
      location.href = "index.html";
    });
  });

  const cloudStatus = document.querySelector("#cloudStatus");
  const cloudEmail = document.querySelector("#cloudEmail");
  const cloudPassword = document.querySelector("#cloudPassword");

  function paintCloudStatus() {
    const email = sessionStorage.getItem(CLOUD_EMAIL_KEY);
    cloudStatus.textContent = getCloudToken() ? `Signed in as ${email}` : "Not signed in.";
  }

  async function cloudAuth(mode) {
    const email = cloudEmail.value.trim().toLowerCase();
    const password = cloudPassword.value;
    if (!email || !password) {
      showToast("Enter email and password.", "warning");
      return;
    }
    try {
      const result = await cloudRequest(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setCloudSession(result.token, result.user.email);
      paintCloudStatus();
      showToast(mode === "register" ? "Cloud account created ✅" : "Logged in ✅", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  document.querySelector("#cloudLogin").addEventListener("click", () => cloudAuth("login"));
  document.querySelector("#cloudRegister").addEventListener("click", () => cloudAuth("register"));
  document.querySelector("#cloudLogout").addEventListener("click", () => {
    clearCloudSession();
    paintCloudStatus();
    showToast("Signed out.", "success");
  });
  document.querySelector("#cloudPush").addEventListener("click", async () => {
    try {
      await cloudRequest("/api/sync", {
        method: "PUT",
        body: JSON.stringify({ data: getAppDataBundle() })
      });
      showToast("Local data uploaded ✅", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
  document.querySelector("#cloudPull").addEventListener("click", async () => {
    showModal("Download cloud data?", "This will replace the data currently saved in this browser.", "Download", async () => {
      try {
        const result = await cloudRequest("/api/sync");
        if (!result.data || !result.data.ht_habits) {
          showToast("No cloud data found yet.", "warning");
          return;
        }
        applyAppDataBundle(result.data);
        showToast("Cloud data downloaded ✅", "success");
        setTimeout(() => location.reload(), 900);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
  paintCloudStatus();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelector("#settingsNameError").textContent = "";
    document.querySelector("#settingsTimeError").textContent = "";
    const name = form.elements.name.value.trim();
    const globalStart = normalizeTime(form.elements.globalStart.value || "06:00");
    const globalEnd = normalizeTime(form.elements.globalEnd.value || "22:00");
    form.elements.globalStart.value = globalStart;
    form.elements.globalEnd.value = globalEnd;
    let valid = true;
    if (!name) {
      document.querySelector("#settingsNameError").textContent = "Name is required.";
      valid = false;
    }
    if (!globalStart || !globalEnd) {
      document.querySelector("#settingsTimeError").textContent = "Global start and end are required.";
      valid = false;
    } else if (!Number.isFinite(timeToMinutes(globalStart)) || !Number.isFinite(timeToMinutes(globalEnd))) {
      document.querySelector("#settingsTimeError").textContent = "Use 24-hour time like 06:00 or 22:00.";
      valid = false;
    } else if (timeToMinutes(globalEnd) <= timeToMinutes(globalStart)) {
      document.querySelector("#settingsTimeError").textContent = "End time must be after start time.";
      valid = false;
    }
    if (!valid) return;
    saveProfile({ name, avatar: form.elements.avatar.value || "🧑‍💻" });
    saveSettings({ globalStart, globalEnd, notifyBefore, notifyMorning });
    showToast("Settings saved ✅", "success");
  });
}

function initDetail() {
  pageInit("detail");
  const habit = getHabitById(qs("id")) || getHabits()[0];
  if (!habit) {
    document.querySelector("#detailPanel").innerHTML = `<div class="empty-box"><div class="empty-emoji">🔥</div><h2>No habit to show</h2><a class="btn primary" href="add-habit.html">➕ Add Habit</a></div>`;
    return;
  }
  const streak = getStreakCount(habit.id);
  document.querySelector("#detailName").textContent = habit.name;
  document.querySelector("#detailCategory").textContent = habit.category;
  document.querySelector("#detailCategory").style.background = habit.color;
  document.querySelector("#detailTarget").textContent = `${habit.targetMinutes} min daily`;
  const detailWindow = getHabitWindow(habit);
  document.querySelector("#detailWindow").textContent = `${detailWindow.start} → ${detailWindow.end}`;
  document.querySelector("#detailStreak").textContent = `${streak.current} / ${habit.streakGoalDays} days`;
  document.querySelector("#detailBest").textContent = `${streak.best} days`;
  document.querySelector("#detailNotes").textContent = habit.notes || "No notes added.";
  document.querySelector("#editHabit").href = `add-habit.html?id=${habit.id}`;
  document.querySelector("#startHabit").href = `timer.html?id=${habit.id}`;
  document.querySelector("#deleteHabit").onclick = () => openModal("Delete habit?", "This removes the habit and its completion history.", () => {
    saveHabits(getHabits().filter((item) => item.id !== habit.id));
    const completions = getCompletions();
    delete completions[habit.id];
    saveCompletions(completions);
    location.href = "index.html?toast=deleted";
  });

  const calendar = document.querySelector("#calendar");
  const days = getCompletions()[habit.id] || {};
  const start = new Date(getTodayString() + "T00:00:00");
  const total = Math.min(Math.max(habit.streakGoalDays, 7), 70);
  calendar.innerHTML = Array.from({ length: Math.ceil(total / 7) }, (_, week) => {
    const cells = Array.from({ length: 7 }, (_, dayIndex) => {
      const dayNumber = week * 7 + dayIndex;
      if (dayNumber >= total) return `<div></div>`;
      const day = addDays(start, dayNumber - total + 1);
      const key = dateKey(day);
      const status = days[key]?.status || "";
      return `<div class="day-cell ${status}" title="${formatDate(key)}">${day.getDate()}</div>`;
    }).join("");
    return `<div class="week-label">Week ${week + 1}</div>${cells}`;
  }).join("");
}

window.getProfile = getProfile;
window.saveProfile = saveProfile;
window.getSettings = getSettings;
window.saveSettings = saveSettings;
window.getHabits = getHabits;
window.saveHabits = saveHabits;
window.getCompletions = getCompletions;
window.saveCompletions = saveCompletions;
window.getHabitById = getHabitById;
window.getTodayString = getTodayString;
window.formatDate = formatDate;
window.generateId = generateId;
window.getStreakCount = getStreakCount;
window.markMissedIfNeeded = markMissedIfNeeded;
window.completeHabit = completeHabit;
window.showToast = showToast;
window.showModal = showModal;
window.updateSyncIndicator = updateSyncIndicator;
