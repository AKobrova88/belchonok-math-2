"use strict";

const variants = window.quizVariants;
const app = document.querySelector("#app");
const dialog = document.querySelector("#confirm");
const participant = document.querySelector("#participant");
const participantName = participant.querySelector("#participant-name");
const participantError = participant.querySelector("#participant-error");
const journal = window.resultJournal;
const storageKey = "belchonok-math2:attempts:v1";

let attempts = readAttempts();
let activeVariant = 0;
let confirmWork = null;
let dialogOpener = null;
let pendingStart = null;

function readAttempts() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return variants.map((variant, index) => {
      const attempt = saved?.[index];
      if (!Array.isArray(attempt?.answers) || attempt.answers.length !== variant.length) {
        return null;
      }
      return {
        answers: attempt.answers.map(value => typeof value === "string" ? value.slice(0, 80) : ""),
        current: Number.isInteger(attempt.current) && attempt.current >= 0 && attempt.current < variant.length
          ? attempt.current : 0,
        finished: attempt.finished === true,
        name: journal.normalizeName(attempt.name),
        attemptId: journal.validId(attempt.attemptId) ? attempt.attemptId : null,
        recorded: attempt.recorded === true,
      };
    });
  } catch {
    return variants.map(() => null);
  }
}

function saveAttempts() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(attempts));
  } catch {
    // The current attempt remains usable in memory when browser storage is unavailable.
  }
}

function answerKey(value, type) {
  const trimmed = value.trim();
  if (type === "letters") {
    const letters = trimmed.toUpperCase().replace(/\s+И\s+/g, "").replace(/[\s,.;+\/&-]/g, "");
    return [...letters.replace(/A/g, "А").replace(/[BV]/g, "В")].sort().join("");
  }
  return /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, "") : "";
}

function evaluate(variant, answers) {
  const questions = variant.map((question, index) => {
    const answer = answers[index];
    const correct = answerKey(answer, question.type) === question.key;
    return { answer, correct, points: correct ? question.points : 0 };
  });
  return {
    questions,
    total: questions.reduce((sum, item) => sum + item.points, 0),
    correct: questions.filter(item => item.correct).length,
  };
}

function setView(html, focus = true) {
  app.innerHTML = html;
  window.scrollTo(0, 0);
  if (focus) app.querySelector("h1").focus();
}

function variantTitle() {
  return "Вариант " + (activeVariant + 1);
}

function showHome(focus = true) {
  const cards = variants.map((variant, index) => {
    const attempt = attempts[index];
    let button = "Начать";
    let detail = variant.length + " задач · 100 баллов";
    if (attempt?.finished) {
      button = "Смотреть баллы";
      detail = "Результат " + evaluate(variant, attempt.answers).total + " из 100";
    } else if (attempt) {
      button = "Продолжить";
      detail = "Отвечено " + attempt.answers.filter(answer => answer.trim()).length + " из " + variant.length;
    }
    return fill(
      '<article class="choice"><div><h2>Вариант @number</h2><p>@detail</p></div>' +
      '<button class="button primary" type="button" data-open="@index" aria-label="@button, вариант @number">@button</button></article>',
      { number: index + 1, detail, index, button },
    );
  }).join("");
  setView(
    '<section class="hero"><h1 tabindex="-1">Выбери пробник</h1>' +
    '<p>Реши задачи, запиши ответы и нажми «Завершить». В конце ты увидишь свои баллы и разбор задач.</p></section>' +
    '<section class="choices" aria-label="Пробники">' + cards + '</section>', focus,
  );
}

function fill(template, values) {
  return template.replace(/@([a-z]+)/gi, (_, name) => String(values[name]));
}

function askName(resume = false) {
  pendingStart = { index: activeVariant, resume, opener: document.activeElement };
  participantName.value = "";
  participantName.removeAttribute("aria-invalid");
  participantError.hidden = true;
  participant.querySelector("#start-participant").textContent = resume ? "Продолжить пробник" : "Начать пробник";
  participant.showModal();
  participantName.focus();
}

function openVariant(index) {
  activeVariant = index;
  const attempt = attempts[index];
  if (!attempt) askName();
  else if (attempt.finished) showResult();
  else if (!attempt.name || !attempt.attemptId) askName(true);
  else showQuestion();
}

participant.querySelector("#participant-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!pendingStart) return;
  const name = journal.normalizeName(participantName.value);
  if (!name) {
    participantError.hidden = false;
    participantName.setAttribute("aria-invalid", "true");
    participantName.focus();
    return;
  }
  const { index, resume } = pendingStart;
  pendingStart = null;
  const previous = resume ? attempts[index] : null;
  attempts[index] = {
    answers: previous?.answers ?? variants[index].map(() => ""),
    current: previous?.current ?? 0,
    name,
    attemptId: crypto.randomUUID(),
    finished: false,
    recorded: false,
  };
  participant.close();
  activeVariant = index;
  saveAttempts();
  showQuestion();
});
participantName.addEventListener("input", () => {
  participantError.hidden = true;
  participantName.removeAttribute("aria-invalid");
});
participant.querySelector("#cancel-participant").addEventListener("click", () => participant.close());
participant.addEventListener("close", () => {
  pendingStart?.opener?.focus();
  pendingStart = null;
});

function pluralPoints(n) {
  const last = n % 10;
  if (n % 100 >= 11 && n % 100 <= 14) return "баллов";
  if (last === 1) return "балл";
  return last >= 2 && last <= 4 ? "балла" : "баллов";
}

const diagramRows = {
  symbols: [["circle", "circle", "square", 8], ["square", "triangle", "circle", 11],
    ["triangle", "square", "square", 13], [11, 11, 10, null]],
  diagonal: [["dot", null, "dot"], [null, "center", null], ["dot", null, "dot"]],
  robot: [[1, 4, 3, 2], [2, 5, 6, 1], [1, 4, 7, 0], [8, 2, 9, 3]],
  cube: [[null, 5, null, null], [1, 2, 3, 4], [null, 6, null, null]],
};

const diagramLabels = {
  symbols: "Таблица значков с суммами строк и столбцов",
  diagonal: "Отмечены четыре угловые клетки и клетка в центре",
  robot: "Поле робота, старт в верхней левой клетке",
  cube: "Развёртка куба с пронумерованными гранями",
};

const markLabels = { circle: "круг", square: "квадрат", triangle: "треугольник" };

function makeDiagram(type) {
  if (!type) return "";
  if (type === "perimeter") {
    return '<figure class="diagram perimeter" role="img" aria-label="Прямоугольник 8 на 6 сантиметров, с правого верхнего угла вырезан прямоугольник 3 на 2 сантиметра">' +
      '<span class="outline"></span><span class="poly-top"></span><span class="poly-notch"></span><span class="poly-right"></span>' +
      '<span class="size-left">6 см</span><span class="size-bottom">8 см</span><span class="size-cut-w">3 см</span><span class="size-cut-h">2 см</span></figure>';
  }
  const rows = diagramRows[type].map((row, r) => {
    return "<tr>" + row.map((cell, c) => {
      if (type === "symbols" && (r === 3 || c === 3)) {
        return cell === null ? "<td class=\"empty\"></td>" : "<th scope=\"" + (r === 3 ? "col" : "row") + "\">" + cell + "</th>";
      }
      if (Object.hasOwn(markLabels, cell)) {
        return '<td aria-label="' + markLabels[cell] + '"><span class="mark ' + cell + '" aria-hidden="true"></span></td>';
      }
      if (cell === "dot") return '<td class="highlight">•</td>';
      if (cell === "center") return '<td class="highlight">?</td>';
      if (cell === null) return type === "cube" ? '<td class="empty"></td>' : "<td></td>";
      const highlight = type === "robot" && r === 0 && c === 0 ? ' class="highlight"' : "";
      return "<td" + highlight + ">" + cell + "</td>";
    }).join("") + "</tr>";
  }).join("");
  return '<figure class="diagram"><table class="grid ' + type + '" aria-label="' + diagramLabels[type] + '">' + rows + "</table></figure>";
}

function showQuestion() {
  const variant = variants[activeVariant];
  const attempt = attempts[activeVariant];
  const index = attempt.current;
  const question = variant[index];
  const jumps = variant.map((_, i) =>
    '<button class="jump" type="button" data-jump="' + i + '">' + (i + 1) + "</button>",
  ).join("");
  const back = index > 0 ? '<button class="button secondary" type="button" data-back>Назад</button>' : "<span></span>";
  const next = index < variant.length - 1
    ? '<button class="button primary" type="submit">Дальше</button>'
    : '<button class="button primary" type="submit">Завершить</button>';
  const helper = question.type === "letters" ? "Можно через запятую." : "Введи только число.";
  setView(fill(
    '<div class="view-top"><h1 tabindex="-1">@title</h1><button class="text-button" type="button" data-home>К вариантам</button></div>' +
    '<div class="quiz-layout"><section class="panel question-panel" aria-labelledby="question-heading">' +
    '<div class="question-header"><h2 class="question-number" id="question-heading" tabindex="-1">Задача @number</h2>' +
    '<span class="pill">@points @word</span></div><p class="question-text" id="question-text"></p>@diagram' +
    '<form id="answer-form" autocomplete="off"><div class="answer-block"><label for="answer">Твой ответ</label>' +
    '<input id="answer" name="answer" type="text" inputmode="@mode" maxlength="80" spellcheck="false" aria-describedby="answer-help">' +
    '<p class="field-help" id="answer-help">@helper</p></div><div class="actions question-actions">@back@next</div></form></section>' +
    '<aside class="panel progress-panel" aria-label="Ход пробника"><h2>Задачи</h2><p class="progress-text" aria-live="polite"></p>' +
    '<progress aria-label="Задач с ответом" max="@max"></progress><nav class="jump-list" aria-label="Перейти к задаче">@jumps</nav>' +
    '<button class="button secondary finish" type="button" data-finish>Завершить пробник</button></aside></div>',
    {
      title: variantTitle(), number: index + 1, points: question.points, word: pluralPoints(question.points),
      diagram: makeDiagram(question.diagram), mode: question.type === "letters" ? "text" : "numeric",
      helper, back, next, max: variant.length, jumps,
    },
  ), false);
  const input = app.querySelector("#answer");
  input.value = attempt.answers[index];
  app.querySelector("#question-text").textContent = question.prompt;
  input.addEventListener("input", () => {
    attempt.answers[index] = input.value;
    saveAttempts();
    paintProgress();
  });
  app.querySelector("#answer-form").addEventListener("submit", event => {
    event.preventDefault();
    if (index < variant.length - 1) goTo(index + 1);
    else askToFinish();
  });
  paintProgress();
  app.querySelector("#question-heading").focus({ preventScroll: true });
}

function paintProgress() {
  const attempt = attempts[activeVariant];
  const answered = attempt.answers.filter(value => value.trim()).length;
  app.querySelector(".progress-text").textContent = "Отвечено " + answered + " из " + attempt.answers.length;
  app.querySelector("progress").value = answered;
  app.querySelectorAll("[data-jump]").forEach((button, i) => {
    const hasAnswer = Boolean(attempt.answers[i].trim());
    button.classList.toggle("answered", hasAnswer);
    button.setAttribute("aria-label", "Задача " + (i + 1) + (hasAnswer ? ", есть ответ" : ", без ответа"));
    if (i === attempt.current) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
}

function goTo(index) {
  const attempt = attempts[activeVariant];
  if (index === attempt.current || index < 0 || index >= attempt.answers.length) return;
  attempt.current = index;
  saveAttempts();
  showQuestion();
}

function ask(title, body, label, work) {
  confirmWork = work;
  dialogOpener = document.activeElement;
  dialog.returnValue = "";
  dialog.querySelector("#dialog-title").textContent = title;
  dialog.querySelector("#dialog-message").textContent = body;
  dialog.querySelector("#confirm-action").textContent = label;
  dialog.showModal();
}

function askToFinish() {
  const attempt = attempts[activeVariant];
  const blank = attempt.answers.filter(value => !value.trim()).length;
  const body = blank
    ? "Без ответа: " + blank + " из " + attempt.answers.length + ". Пропущенные задачи принесут 0 баллов."
    : "Ты ответил на все задачи. После завершения можно посмотреть баллы и решения.";
  ask("Завершить пробник?", body, "Показать баллы", () => {
    attempt.finished = true;
    saveAttempts();
    showResult();
  });
}

function showResult() {
  const variant = variants[activeVariant];
  const attempt = attempts[activeVariant];
  const result = evaluate(variant, attempt.answers);
  setView(fill(
    '<div class="view-top"><h1 tabindex="-1">Результат · @title</h1><button class="text-button" type="button" data-home>К вариантам</button></div>' +
    '<section class="score-panel" aria-label="Итог"><div><div class="score-line"><strong class="score-value">@total</strong>' +
    '<span class="score-total">из 100 баллов</span></div><p class="score-detail">Верных ответов: @correct из @max</p></div>' +
    '<button class="button secondary" type="button" data-retry>Пройти ещё раз</button></section>' +
    '<div class="actions journal-status" hidden><p role="status"></p><button type="button" class="button secondary" data-resend hidden>Отправить ещё раз</button></div>' +
    '<section class="review" aria-labelledby="review-title"><h2 id="review-title">Разбор задач</h2><div id="review-items"></div></section>',
    { title: variantTitle(), total: result.total, correct: result.correct, max: variant.length },
  ));
  const list = app.querySelector("#review-items");
  result.questions.forEach((item, index) => {
    const question = variant[index];
    const details = document.createElement("details");
    details.innerHTML = fill(
      '<summary>Задача @number<span class="status@state" aria-label="@status">@points / @available</span></summary>' +
      '<div class="review-body"><p class="original"></p>@diagram' +
      '<p><strong>Твой ответ</strong> <span class="value-inline"></span></p>' +
      '<p><strong>Верный ответ</strong> <span class="correct-value"></span></p><p class="explanation"></p></div>',
      {
        number: index + 1, state: item.correct ? "" : " missed",
        status: item.correct ? "Верно" : item.answer.trim() ? "Неверно" : "Пропущено",
        points: item.points, available: question.points, diagram: makeDiagram(question.diagram),
      },
    );
    details.querySelector(".original").textContent = question.prompt;
    details.querySelector(".value-inline").textContent = item.answer.trim() || "—";
    details.querySelector(".correct-value").textContent = question.display;
    details.querySelector(".explanation").textContent = question.explanation;
    list.append(details);
  });
  if (attempt.name && attempt.attemptId) sendResult(activeVariant, result);
}

async function sendResult(index, result = evaluate(variants[index], attempts[index].answers)) {
  const attempt = attempts[index];
  const status = app.querySelector(".journal-status");
  if (!status) return;
  const message = status.querySelector("p");
  const again = status.querySelector("[data-resend]");
  status.hidden = false;
  status.removeAttribute("data-failed");
  again.hidden = true;
  if (attempt.recorded) {
    message.textContent = "Результат отправлен в журнал.";
    return;
  }
  message.textContent = "Отправляем результат в журнал…";
  const ok = await journal.submit({
    attemptId: attempt.attemptId,
    name: attempt.name,
    variant: index + 1,
    correct: result.questions.map(item => item.correct),
  });
  if (ok && attempts[index] === attempt) {
    attempt.recorded = true;
    saveAttempts();
  }
  if (!status.isConnected) return;
  message.textContent = ok ? "Результат отправлен в журнал." : "Результат пока не отправлен. Попробуй ещё раз, когда появится связь.";
  status.toggleAttribute("data-failed", !ok);
  again.hidden = ok;
}

dialog.addEventListener("close", () => {
  const work = confirmWork;
  confirmWork = null;
  if (dialog.returnValue === "confirm") work?.();
  else dialogOpener?.focus();
  dialogOpener = null;
});

app.addEventListener("click", event => {
  const target = event.target.closest("button");
  if (!target) return;
  if ("open" in target.dataset) openVariant(Number(target.dataset.open));
  else if ("home" in target.dataset) showHome();
  else if ("jump" in target.dataset) goTo(Number(target.dataset.jump));
  else if ("back" in target.dataset) goTo(attempts[activeVariant].current - 1);
  else if ("finish" in target.dataset) askToFinish();
  else if ("resend" in target.dataset) sendResult(activeVariant);
  else if ("retry" in target.dataset) {
    ask("Начать заново?", "В браузере вместо предыдущей попытки появится новая.", "Начать заново", () => askName());
  }
});

document.querySelector("#home-button").addEventListener("click", () => showHome());
window.addEventListener("online", () => {
  const attempt = attempts[activeVariant];
  if (attempt?.finished && attempt.name && !attempt.recorded && app.querySelector(".journal-status")) sendResult(activeVariant);
  else journal.retryPending();
});
showHome(false);
journal.retryPending();
