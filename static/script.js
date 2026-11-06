const EMOTIONS = ["sadness","joy","love","anger","fear","surprise"];

const PALETTE = {
  sadness:  "#5b7fa6",
  joy:      "#e3a33d",
  love:     "#c2577a",
  anger:    "#c15241",
  fear:     "#7b6bb0",
  surprise: "#3f9b82",
};

// mirrors the backend's emotion_emojis dict, so the face in the orb
// and the rows in the panel both speak the same visual language
const EMOJIS = {
  sadness:  "😢",
  joy:      "😄",
  love:     "❤️",
  anger:    "😠",
  fear:     "😨",
  surprise: "😲",
};

const PHRASES = {
  sadness:  "reads as sadness",
  joy:      "reads as joy",
  love:     "reads as love",
  anger:    "reads as anger",
  fear:     "reads as fear",
  surprise: "reads as surprise",
};

const form      = document.getElementById('form');
const textarea  = document.getElementById('text');
const count     = document.getElementById('count');
const submitBtn = document.getElementById('submit');

const orb       = document.getElementById('orb');
const orbEmoji  = document.getElementById('orbEmoji');

const result    = document.getElementById('result');
const word      = document.getElementById('emotionWord');
const confEl    = document.getElementById('confidence');

const panel     = document.getElementById('spectrumPanel');
const spectrum  = document.getElementById('spectrum');

const hint      = document.getElementById('hint');
const errorEl   = document.getElementById('error');

textarea.addEventListener('input', () => {
  count.textContent = `${textarea.value.length} / 2000`;
});

function setAccent(hex){
  document.documentElement.style.setProperty('--accent', hex);
  document.body.style.background =
    `radial-gradient(1200px 700px at 50% 0%, ${hex}14, var(--bg) 55%)`;
}

// turns a hex color + alpha (0–1) into rgba(), so low readings still
// get a faint tint across the whole track — you can "feel" the scale
// even when the fill itself is thin
function rgba(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// fills the probabilities panel — the numbers are still the source of
// truth; the glow just makes a 10–20% reading legible at a glance
// instead of a sliver you have to squint at
function buildSpectrum(all, leading){
  spectrum.innerHTML = '';
  EMOTIONS.forEach(name => {
    const pct = Math.round((all[name] ?? 0) * 100);
    const hex = PALETTE[name];
    const row = document.createElement('div');
    row.className = 'spec-row';
    row.innerHTML = `
      <span class="spec-emoji">${EMOJIS[name]}</span>
      <span class="spec-label${name === leading ? ' lead' : ''}">${name}</span>
      <span class="spec-track" style="background:${rgba(hex, 0.14)}">
        <span class="spec-fill" style="background:${hex}"></span>
      </span>
      <span class="spec-pct">${pct}%</span>
    `;
    spectrum.appendChild(row);
  });
  requestAnimationFrame(() => {
    [...spectrum.querySelectorAll('.spec-fill')].forEach((fill, i) => {
      const name = EMOTIONS[i];
      const pct = Math.round((all[name] ?? 0) * 100);
      const hex = PALETTE[name];
      fill.style.width = pct + '%';
      // a floor so even a near-zero reading still glows faintly,
      // scaling up as the probability climbs
      const glow = 4 + (pct / 100) * 10;
      fill.style.boxShadow = `0 0 ${glow}px ${rgba(hex, 0.3 + (pct/100)*0.5)}`;
    });
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = textarea.value.trim();
  if (!text) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Reading…';
  errorEl.style.display = 'none';
  hint.style.display = 'none';

  orb.classList.remove('show');
  result.classList.remove('show');
  panel.classList.remove('show');

  try {
    const res = await fetch('/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Request failed (${res.status})`);
    }

    const data = await res.json();
    const leading = data.predicted_emotion;
    const confidence = Math.round((data.confidense ?? 0) * 100);

    // set the content for all three sections first, THEN reveal them
    // together on the same frame — the word shows at the same moment
    // as the orb's animation, not after it
    setAccent(PALETTE[leading] || '#6c7686');
    orbEmoji.textContent = EMOJIS[leading] || '·';
    word.textContent = leading;
    confEl.textContent = `${confidence}% sure it ${PHRASES[leading] || 'reads this way'}`;
    buildSpectrum(data.all_probabilities || {}, leading);

    requestAnimationFrame(() => {
      orb.classList.add('show');
      result.classList.add('show');
      panel.classList.add('show');
    });

    // bring the result into view without making the user scroll for it
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      orb.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }, 60);

  } catch (err) {
    errorEl.textContent = "Couldn't reach the model just now — try again in a moment.";
    errorEl.style.display = 'block';
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Read it';
  }
});
