// Timer da Floresta. Roda num Web Worker para manter precisão mesmo com a
// aba em background (timers do main thread são estrangulados pelo navegador).
// O tempo restante é sempre recalculado a partir do deadline absoluto —
// mesmo que um tick atrase, o total não deriva.

let interval = null;
let deadline = 0;

self.onmessage = (e) => {
  const msg = e.data || {};

  if (msg.cmd === "start") {
    clearInterval(interval);
    deadline = Date.now() + msg.seconds * 1000;
    self.postMessage({ type: "tick", remaining: msg.seconds });
    interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      self.postMessage({ type: "tick", remaining });
      if (remaining <= 0) {
        clearInterval(interval);
        interval = null;
        self.postMessage({ type: "done" });
      }
    }, 500);
  } else if (msg.cmd === "stop") {
    clearInterval(interval);
    interval = null;
  }
};
