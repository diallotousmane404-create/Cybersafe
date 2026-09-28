/* ==========================================================================
   CyberSûr USAZ — Logique applicative (Vanilla JS)
   Stockage : localStorage (progression, scores, badges, thème)
   ========================================================================== */

/* ---------------------- Constantes & utilitaires ---------------------- */
const STORAGE_KEYS = {
  THEME: "cs_theme",
  PROGRESS: "cs_progress",   // { [lessonId]: { status, completedAt } }
  QUIZ: "cs_quiz",           // [{ date, score, total }]
  BADGES: "cs_badges",       // [badgeId, ...]
  COURSE_STATE: "cs_course_state" // { [courseId]: { currentLessonId } }
};

const BADGES = [
  { id: "first-lesson", title: "Premier pas", icon: "🎯", condition: () => countCompletedLessons() >= 1, desc: "Terminer votre première leçon." },
  { id: "quiz-passed", title: "Quiz réussi", icon: "✅", condition: () => getQuizScores().some(s => s.score >= 4), desc: "Réussir un quiz (≥ 4/5)." },
  { id: "perfect-quiz", title: "Sans faute", icon: "🏆", condition: () => getQuizScores().some(s => s.score === s.total), desc: "Obtenir un score parfait." },
  { id: "phishing-master", title: "Expert Phishing", icon: "✉️", condition: () => isCourseCompleted("phishing"), desc: "Terminer le cours sur le phishing." },
  { id: "password-master", title: "Maître des mots de passe", icon: "🔒", condition: () => isCourseCompleted("passwords"), desc: "Terminer le cours sur les mots de passe." },
  { id: "malware-master", title: "Bouclier anti-malware", icon: "🛡️", condition: () => isCourseCompleted("malware"), desc: "Terminer le cours sur les malwares." }
];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

/* ---------------------- Thème sombre ---------------------- */
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(STORAGE_KEYS.THEME, next);
}

/* ---------------------- Menu mobile ---------------------- */
function initNavToggle() {
  const btn = $(".nav-toggle");
  const nav = $(".main-nav");
  if (!btn || !nav) return;
  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("open");
  });
}

/* ---------------------- Année dans le footer ---------------------- */
function initYear() {
  $$(".year, #year").forEach(el => el.textContent = new Date().getFullYear());
}

/* ---------------------- Compteurs animés ---------------------- */
function initCounters() {
  const els = $$("[data-count]");
  if (!els.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10);
      let current = 0;
      const step = Math.max(1, Math.ceil(target / 40));
      const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = current;
      }, 25);
      io.unobserve(el);
    });
  }, { threshold: 0.4 });
  els.forEach(el => io.observe(el));
}

/* ---------------------- Cartes de cours (accueil + catalogue) ---------------------- */
function renderHomeCourses() {
  const container = $("#home-courses");
  if (!container) return;
  const popular = COURSES.filter(c => c.popular).slice(0, 3);
  container.innerHTML = popular.map(courseCardHTML).join("");
}
function renderCoursesGrid() {
  const grid = $("#courses-grid");
  if (!grid) return;
  grid.innerHTML = COURSES.map(courseCardHTML).join("");
}
function courseCardHTML(course) {
  const progress = getCourseProgressPercent(course.id);
  return `
    <article class="course-card card">
      <div class="course-icon">${course.icon}</div>
      <h3>${course.title}</h3>
      <p>${course.description}</p>
      <div class="course-meta">
        <span class="chip-mini">${course.level}</span>
        <span class="chip-mini">${course.duration} min</span>
      </div>
      <div class="progress small" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      <a href="lecon.html?course=${course.slug}" class="btn btn-primary">Continuer →</a>
    </article>
  `;
}

/* ---------------------- Recherche / filtres catalogue ---------------------- */
function initCourseFilters() {
  const search = $("#course-search");
  const grid = $("#courses-grid");
  const noResults = $("#no-results");
  if (!search || !grid) return;
  let activeFilter = "all";

  function apply() {
    const q = search.value.trim().toLowerCase();
    const filtered = COURSES.filter(c => {
      const matchesQ = !q || c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
      const matchesF = activeFilter === "all" || c.level === activeFilter;
      return matchesQ && matchesF;
    });
    grid.innerHTML = filtered.map(courseCardHTML).join("");
    noResults.classList.toggle("hidden", filtered.length > 0);
  }
  search.addEventListener("input", apply);
  $$(".chip").forEach(chip => chip.addEventListener("click", () => {
    $$(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.filter;
    apply();
  }));
}

/* ---------------------- Page Leçon ---------------------- */
function initLessonPage() {
  const lessonNav = $("#lesson-nav");
  const lessonContent = $("#lesson-content");
  if (!lessonNav || !lessonContent) return;

  const params = new URLSearchParams(location.search);
  const courseSlug = params.get("course") || COURSES[0].slug;
  const course = COURSES.find(c => c.slug === courseSlug) || COURSES[0];

  const state = readJSON(STORAGE_KEYS.COURSE_STATE, {});
  let currentLessonId = state[course.id]?.currentLessonId || course.lessons[0].id;

  function renderLessonNav() {
    lessonNav.innerHTML = course.lessons.map(lesson => {
      const done = isLessonCompleted(lesson.id);
      const active = lesson.id === currentLessonId;
      return `
        <li>
          <button class="lesson-link ${active ? "active" : ""}" data-lesson="${lesson.id}">
            <span class="check">${done ? "✔" : "○"}</span>
            <span>${lesson.title}</span>
            <span class="muted small">${lesson.duration} min</span>
          </button>
        </li>
      `;
    }).join("");
    $$(".lesson-link", lessonNav).forEach(btn => {
      btn.addEventListener("click", () => {
        currentLessonId = btn.dataset.lesson;
        saveCurrentLesson(course.id, currentLessonId);
        renderLesson();
        renderLessonNav();
        updateLessonProgressBar();
      });
    });
  }

  function renderLesson() {
    const lesson = course.lessons.find(l => l.id === currentLessonId) || course.lessons[0];
    lessonContent.innerHTML = `
      <header class="lesson-header">
        <p class="breadcrumb">${course.title} · Leçon</p>
        <h1>${lesson.title}</h1>
        <p class="muted">Durée estimée : ${lesson.duration} min</p>
      </header>
      <div class="lesson-body">${lesson.content}</div>
      <footer class="lesson-footer">
        <button class="btn btn-primary" id="mark-complete">${isLessonCompleted(lesson.id) ? "✔ Terminée" : "Marquer comme terminée"}</button>
        <a href="quiz.html" class="btn btn-ghost">Aller au quiz</a>
      </footer>
    `;
    $("#mark-complete").addEventListener("click", () => {
      markLessonCompleted(lesson.id);
      renderLesson();
      renderLessonNav();
      updateLessonProgressBar();
      checkAndAwardBadges();
    });
  }

  function updateLessonProgressBar() {
    const pct = getCourseProgressPercent(course.id);
    const bar = $("#lesson-progress");
    bar.setAttribute("aria-valuenow", pct);
    bar.querySelector("span").style.width = pct + "%";
  }

  function saveCurrentLesson(courseId, lessonId) {
    const s = readJSON(STORAGE_KEYS.COURSE_STATE, {});
    s[courseId] = { currentLessonId: lessonId };
    writeJSON(STORAGE_KEYS.COURSE_STATE, s);
  }

  renderLessonNav();
  renderLesson();
  updateLessonProgressBar();
}

/* ---------------------- Progression (localStorage) ---------------------- */
function getProgress() { return readJSON(STORAGE_KEYS.PROGRESS, {}); }
function isLessonCompleted(lessonId) { return getProgress()[lessonId]?.status === "completed"; }
function markLessonCompleted(lessonId) {
  const p = getProgress();
  p[lessonId] = { status: "completed", completedAt: Date.now() };
  writeJSON(STORAGE_KEYS.PROGRESS, p);
}
function countCompletedLessons() {
  return Object.values(getProgress()).filter(p => p.status === "completed").length;
}
function getCourseProgressPercent(courseId) {
  const course = COURSES.find(c => c.id === courseId);
  if (!course || !course.lessons.length) return 0;
  const done = course.lessons.filter(l => isLessonCompleted(l.id)).length;
  return Math.round((done / course.lessons.length) * 100);
}
function isCourseCompleted(courseId) {
  const course = COURSES.find(c => c.id === courseId);
  return course && course.lessons.every(l => isLessonCompleted(l.id));
}

/* ---------------------- Quiz ---------------------- */
function getQuizScores() { return readJSON(STORAGE_KEYS.QUIZ, []); }

function initQuizPage() {
  const container = $("#quiz-container");
  if (!container) return;

  const questions = QUIZZES.default;
  let index = 0;
  let score = 0;
  let answered = false;

  $("#start-quiz").addEventListener("click", () => {
    index = 0; score = 0;
    renderQuestion();
  });

  function renderQuestion() {
    if (index >= questions.length) return renderResult();
    const q = questions[index];
    answered = false;
    container.innerHTML = `
      <div class="quiz-progress">
        <span>Question ${index + 1} / ${questions.length}</span>
        <div class="progress"><span style="width:${((index) / questions.length) * 100}%"></span></div>
      </div>
      <div class="card quiz-card">
        <h2>${q.q}</h2>
        <div class="choices" id="choices">
          ${q.choices.map((c, i) => `<button class="choice" data-i="${i}">${c}</button>`).join("")}
        </div>
        <div class="explanation hidden" id="explanation">
          <p><strong>Explication :</strong> ${q.explanation}</p>
          <button class="btn btn-primary" id="next">Question suivante →</button>
        </div>
      </div>
    `;

    $$(".choice").forEach(btn => btn.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      const i = parseInt(btn.dataset.i, 10);
      const correct = i === q.answer;
      if (correct) score++;
      $$(".choice").forEach((b, bi) => {
        b.disabled = true;
        if (bi === q.answer) b.classList.add("correct");
        else if (bi === i) b.classList.add("wrong");
      });
      $("#explanation").classList.remove("hidden");
      $("#next").addEventListener("click", () => { index++; renderQuestion(); });
    }));
  }

  function renderResult() {
    const total = questions.length;
    const pct = Math.round((score / total) * 100);
    const passed = score >= Math.ceil(total * 0.6);
    const scores = getQuizScores();
    scores.unshift({ date: Date.now(), score, total });
    writeJSON(STORAGE_KEYS.QUIZ, scores.slice(0, 20));
    checkAndAwardBadges();

    container.innerHTML = `
      <div class="card quiz-result">
        <h2>${passed ? "🎉 Bravo !" : "📘 Continuez vos efforts !"}</h2>
        <p class="result-score">${score} / ${total} — ${pct}%</p>
        <p>${passed ? "Vous maîtrisez les bons réflexes." : "Relisez les cours et retentez le quiz."}</p>
        <div class="quiz-actions">
          <a href="quiz.html" class="btn btn-primary">Refaire un quiz</a>
          <a href="dashboard.html" class="btn btn-ghost">Voir mon espace</a>
        </div>
      </div>
    `;
  }
}

/* ---------------------- Badges ---------------------- */
function getEarnedBadges() { return readJSON(STORAGE_KEYS.BADGES, []); }
function checkAndAwardBadges() {
  const earned = new Set(getEarnedBadges());
  const newOnes = [];
  BADGES.forEach(b => {
    if (!earned.has(b.id) && b.condition()) {
      earned.add(b.id);
      newOnes.push(b);
    }
  });
  writeJSON(STORAGE_KEYS.BADGES, Array.from(earned));
  newOnes.forEach(b => showToast(`🏅 Nouveau badge : ${b.title}`));
  return newOnes;
}

/* ---------------------- Toast ---------------------- */
function showToast(msg) {
  let t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3500);
}

/* ---------------------- Dashboard ---------------------- */
function initDashboard() {
  const progressEl = $("#dashboard-progress");
  if (!progressEl) return;

  $("#stat-lessons").textContent = countCompletedLessons();
  $("#stat-quiz").textContent = getQuizScores().filter(s => s.score >= Math.ceil(s.total * 0.6)).length;
  $("#stat-badges").textContent = getEarnedBadges().length;

  progressEl.innerHTML = COURSES.map(c => {
    const pct = getCourseProgressPercent(c.id);
    return `
      <div class="card progress-card">
        <div class="progress-card-head">
          <h3>${c.icon} ${c.title}</h3>
          <span>${pct}%</span>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
        <a href="lecon.html?course=${c.slug}" class="btn btn-ghost small">Continuer</a>
      </div>
    `;
  }).join("");

  const earned = getEarnedBadges();
  const badgesEl = $("#dashboard-badges");
  badgesEl.innerHTML = BADGES.map(b => {
    const has = earned.includes(b.id);
    return `
      <div class="badge-card card ${has ? "" : "locked"}">
        <div class="badge-icon">${b.icon}</div>
        <h4>${b.title}</h4>
        <p class="muted small">${b.desc}</p>
        <span class="chip-mini">${has ? "Obtenu" : "Verrouillé"}</span>
      </div>
    `;
  }).join("");

  const scores = getQuizScores().slice(0, 5);
  const scoresEl = $("#dashboard-scores");
  scoresEl.innerHTML = scores.length
    ? `<ul class="score-list">${scores.map(s => `
        <li>
          <span>${new Date(s.date).toLocaleString("fr-FR")}</span>
          <strong>${s.score} / ${s.total}</strong>
        </li>`).join("")}</ul>`
    : `<p class="muted">Aucun quiz passé pour l'instant.</p>`;

  $("#reset-progress").addEventListener("click", () => {
    if (confirm("Réinitialiser toute votre progression (leçons, quiz, badges) ?")) {
      [STORAGE_KEYS.PROGRESS, STORAGE_KEYS.QUIZ, STORAGE_KEYS.BADGES, STORAGE_KEYS.COURSE_STATE]
        .forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  });
}

/* ---------------------- Bonnes pratiques ---------------------- */
function initPractices() {
  const grid = $("#practices-grid");
  if (!grid) return;
  grid.innerHTML = PRACTICES.map(p => `
    <div class="practice-card card">
      <div class="practice-icon">${p.icon}</div>
      <div>
        <h3>${p.title}</h3>
        <p>${p.text}</p>
      </div>
    </div>
  `).join("");
}

/* ---------------------- Simulateur d'emails ---------------------- */
function initSimulator() {
  const sim = $("#email-sim");
  if (!sim) return;

  let i = 0;
  const fromEl = $("#sim-from");
  const subjEl = $("#sim-subject");
  const bodyEl = $("#sim-body");
  const indicesEl = $("#sim-indices");
  const listEl = $("#sim-indices-list");

  function render() {
    const e = SIMULATED_EMAILS[i];
    fromEl.textContent = e.from;
    subjEl.textContent = e.subject;
    bodyEl.innerHTML = e.body;
    listEl.innerHTML = e.indices.map(x => `<li>${x}</li>`).join("");
    indicesEl.classList.add("hidden");
  }

  $("#sim-next").addEventListener("click", () => { i = (i + 1) % SIMULATED_EMAILS.length; render(); });
  $("#sim-reveal").addEventListener("click", () => indicesEl.classList.toggle("hidden"));

  render();
}

/* ---------------------- Init global ---------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initNavToggle();
  initYear();
  initCounters();
  initCourseFilters();
  renderHomeCourses();
  renderCoursesGrid();
  initLessonPage();
  initQuizPage();
  initDashboard();
  initPractices();
  initSimulator();

  const themeBtn = $(".theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  // Attribution initiale des badges (au cas où l'utilisateur revient)
  checkAndAwardBadges();
});