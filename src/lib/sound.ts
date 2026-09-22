// Notification sonore générée en WebAudio : aucun fichier audio à héberger.
// Les navigateurs exigent un geste utilisateur avant de jouer un son → unlockAudio().

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function playNotification() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  // Petit carillon montant : do - mi - sol - do
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const t = c.currentTime + i * 0.14;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  });

  if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
}
