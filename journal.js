"use strict";

window.resultJournal = (() => {
  const endpoint = "https://script.google.com/macros/s/AKfycbw8VjQAT3rXWPSLIsrd4PejWj53N6yBQ2w0r9De7Rr-nCtJco6WSVxDlN2aELcbeWqKTg/exec";
  const queueKey = "belchonok-math2:pending-results:v1";
  const idPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
  const namePattern = /^\p{L}[\p{L}\p{M} .’'-]{0,39}$/u;
  const requests = new Map();
  const queue = new Map();

  function normalizeName(value) {
    if (typeof value !== "string") return "";
    const cleaned = value.trim().replace(/\s+/g, " ");
    return namePattern.test(cleaned) ? cleaned : "";
  }

  function validId(value) {
    return typeof value === "string" && idPattern.test(value);
  }

  function record(data) {
    if (!data || !validId(data.attemptId) || ![1, 2].includes(data.variant) ||
        !Array.isArray(data.correct) || data.correct.length !== 10 ||
        !data.correct.every(value => typeof value === "boolean")) return null;
    const name = normalizeName(data.name);
    return name ? { attemptId: data.attemptId, name, variant: data.variant, correct: data.correct } : null;
  }

  function pendingEntries() {
    try {
      const saved = JSON.parse(localStorage.getItem(queueKey));
      return Array.isArray(saved) ? saved.map(record).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function changeQueue(attemptId, value) {
    try {
      const stored = new Map(pendingEntries().map(item => [item.attemptId, item]));
      if (value) stored.set(attemptId, value);
      else stored.delete(attemptId);
      localStorage.setItem(queueKey, JSON.stringify([...stored.values()]));
    } catch {
      // The queue is still available until the tab closes.
    }
    if (value) queue.set(attemptId, value);
    else queue.delete(attemptId);
  }

  async function send(item) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        credentials: "omit",
        body: JSON.stringify(item),
        keepalive: true,
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok || (await response.json()).ok !== true) return false;
      changeQueue(item.attemptId, null);
      return true;
    } catch {
      return false;
    }
  }

  function submit(data) {
    const item = record(data);
    if (!endpoint || !item) return Promise.resolve(false);
    if (!requests.has(item.attemptId)) {
      changeQueue(item.attemptId, item);
      requests.set(item.attemptId, send(item).finally(() => requests.delete(item.attemptId)));
    }
    return requests.get(item.attemptId);
  }

  async function retryPending() {
    const pending = new Map([...pendingEntries().map(item => [item.attemptId, item]), ...queue]);
    for (const item of pending.values()) {
      if (!(await submit(item))) break;
    }
  }

  return { normalizeName, validId, submit, retryPending };
})();
