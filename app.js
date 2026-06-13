const TASKS_VISION_MODULE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const canvas = document.querySelector("#scene");
const ctx = canvas.getContext("2d");
const video = document.querySelector("#camera");

const intro = document.querySelector("#intro");
const guideStage = document.querySelector("#guideStage");
const guideMessage = document.querySelector("#guideMessage");
const practiceLayer = document.querySelector("#practiceLayer");
const cameraButton = document.querySelector("#cameraButton");
const startButton = document.querySelector("#startButton");
const statusText = document.querySelector("#statusText");
const hud = document.querySelector("#hud");
const handSignal = document.querySelector("#handSignal");
const helpButton = document.querySelector("#helpButton");
const helpPanel = document.querySelector("#helpPanel");
const closeHelpButton = document.querySelector("#closeHelpButton");
const calibrateButton = document.querySelector("#calibrateButton");
const clearButton = document.querySelector("#clearButton");

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  mode: "intro",
  landmarker: null,
  visionTasks: null,
  stream: null,
  modelReady: false,
  cameraReady: false,
  lastDetectionAt: 0,
  lastVideoTime: -1,
  handsSeenAt: 0,
  handCounter: 0,
  handStates: new Map(),
  tipPositions: new Map(),
  touchMemory: new Map(),
  stars: [],
  bubbles: [],
  pops: [],
  practiceBubbles: new Map(),
  practiceCounter: 0,
  nextPracticeAt: 0,
  mirror: true,
  audioContext: null,
  masterGain: null,
  soundReady: false,
  calibration: {
    goodSince: 0,
    progress: 0,
    handSize: 0,
    state: "idle",
  },
};

const PINCH_CLOSE_RATIO = 0.52;
const PINCH_OPEN_RATIO = 0.72;
const PINCH_CLOSE_Z_RATIO = 1.45;
const PINCH_OPEN_Z_RATIO = 1.9;
const RELEASE_GRACE_MS = 720;
const LOST_HAND_MS = 650;
const TARGET_HAND_SIZE = 0.38;
const PINCH_STABLE_MS = 45;
const PINCH_COOLDOWN_MS = 65;
const OPEN_HAND_BLOCK_MS = 120;
const BACKGROUND_TRANSITION_HOURS = 0.72;
const BACKGROUND_THEMES = [
  {
    name: "dawn",
    startHour: 4.5,
    sky: ["#1a2554", "#496f93", "#f0b9a6"],
    haze: "rgba(255, 198, 160, 0.34)",
    glow: "rgba(255, 206, 170, 0.36)",
    glowX: 0.24,
    glowY: 0.42,
    starAlpha: 0.36,
    auroraAlpha: 0.18,
    cloudAlpha: 0.16,
    orb: { x: 0.24, y: 0.48, r: 44, color: "rgba(255, 221, 174, 0.82)", halo: "rgba(255, 183, 129, 0.22)" },
  },
  {
    name: "morning",
    startHour: 7,
    sky: ["#58aaf2", "#a9d8ff", "#fff0bc"],
    haze: "rgba(255, 232, 174, 0.42)",
    glow: "rgba(255, 244, 184, 0.52)",
    glowX: 0.72,
    glowY: 0.22,
    starAlpha: 0,
    auroraAlpha: 0.05,
    cloudAlpha: 0.34,
    orb: { x: 0.72, y: 0.2, r: 52, color: "rgba(255, 246, 188, 0.92)", halo: "rgba(255, 244, 184, 0.28)" },
  },
  {
    name: "noon",
    startHour: 11,
    sky: ["#3296ee", "#86d1ff", "#eefcff"],
    haze: "rgba(218, 248, 255, 0.46)",
    glow: "rgba(255, 255, 214, 0.62)",
    glowX: 0.52,
    glowY: 0.14,
    starAlpha: 0,
    auroraAlpha: 0,
    cloudAlpha: 0.42,
    orb: { x: 0.52, y: 0.14, r: 58, color: "rgba(255, 255, 218, 0.96)", halo: "rgba(255, 255, 210, 0.34)" },
  },
  {
    name: "sunset",
    startHour: 16.5,
    sky: ["#25356e", "#d97886", "#ffc66a"],
    haze: "rgba(255, 151, 107, 0.45)",
    glow: "rgba(255, 178, 93, 0.54)",
    glowX: 0.18,
    glowY: 0.68,
    starAlpha: 0.14,
    auroraAlpha: 0.08,
    cloudAlpha: 0.26,
    orb: { x: 0.18, y: 0.68, r: 54, color: "rgba(255, 181, 96, 0.82)", halo: "rgba(255, 109, 91, 0.24)" },
  },
  {
    name: "night",
    startHour: 19.5,
    sky: ["#061127", "#0a1734", "#102845"],
    haze: "rgba(12, 45, 64, 0.62)",
    glow: "rgba(125, 255, 205, 0.18)",
    glowX: 0.7,
    glowY: 0.36,
    starAlpha: 0.95,
    auroraAlpha: 1,
    cloudAlpha: 0.08,
    orb: { x: 0.78, y: 0.2, r: 34, color: "rgba(226, 238, 255, 0.86)", halo: "rgba(177, 216, 255, 0.16)" },
  },
];
const DRAFT_BUBBLE_LOOK = {
  hueA: 184,
  hueB: 266,
  hueC: 322,
  lightAngle: -0.85,
  lightDrift: 0.08,
  bandTilt: -0.2,
  wobble: 0.018,
  birthSpring: 0,
  highlight: 1,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function normalizedDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createId() {
  return crypto.randomUUID?.() ?? `bubble-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function wrapHue(hue) {
  return ((hue % 360) + 360) % 360;
}

function hsla(hue, saturation, lightness, alpha) {
  return `hsla(${wrapHue(hue)}, ${saturation}%, ${lightness}%, ${alpha})`;
}

function makeBubbleLook() {
  const baseHue = randomBetween(156, 318);
  return {
    hueA: baseHue,
    hueB: baseHue + randomBetween(38, 92),
    hueC: baseHue + randomBetween(118, 176),
    lightAngle: randomBetween(0, Math.PI * 2),
    lightDrift: randomBetween(-0.18, 0.18),
    bandTilt: randomBetween(-0.7, 0.7),
    wobble: randomBetween(0.012, 0.035),
    birthSpring: randomBetween(0.12, 0.22),
    highlight: randomBetween(0.78, 1.18),
  };
}

function prepareAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!state.audioContext) {
    state.audioContext = new AudioContextClass();
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.value = 0.34;
    state.masterGain.connect(state.audioContext.destination);
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume().catch(() => {});
  }

  state.soundReady = true;
  return state.audioContext;
}

function soundOutput(x, volume) {
  const ctx = prepareAudio();
  if (!ctx || !state.masterGain) return null;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp((x / Math.max(state.width, 1)) * 2 - 1, -0.8, 0.8);
    gain.connect(pan);
    pan.connect(state.masterGain);
  } else {
    gain.connect(state.masterGain);
  }

  return gain;
}

function envelope(gain, now, peak, attack, release) {
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function playCreateSound(x, radius) {
  const ctx = prepareAudio();
  const output = soundOutput(x, 0.52);
  if (!ctx || !output) return;

  const now = ctx.currentTime;
  const sizeDrop = clamp(radius / 170, 0, 1) * 90;
  const base = randomBetween(310, 390) - sizeDrop;
  const peak = base * randomBetween(1.72, 2.05);
  const settle = base * randomBetween(1.14, 1.28);

  const mainGain = ctx.createGain();
  const main = ctx.createOscillator();
  main.type = "sine";
  main.frequency.setValueAtTime(base, now);
  main.frequency.exponentialRampToValueAtTime(peak, now + 0.055);
  main.frequency.exponentialRampToValueAtTime(settle, now + 0.24);
  envelope(mainGain, now, 0.42, 0.012, 0.28);
  main.connect(mainGain);
  mainGain.connect(output);
  main.start(now);
  main.stop(now + 0.34);

  const shimmerGain = ctx.createGain();
  const shimmer = ctx.createOscillator();
  shimmer.type = "triangle";
  shimmer.frequency.setValueAtTime(peak * 1.35, now + 0.035);
  shimmer.frequency.exponentialRampToValueAtTime(settle * 1.62, now + 0.18);
  envelope(shimmerGain, now + 0.035, 0.12, 0.006, 0.16);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(output);
  shimmer.start(now + 0.035);
  shimmer.stop(now + 0.24);
}

function playPopSound(x, radius) {
  const ctx = prepareAudio();
  const output = soundOutput(x, randomBetween(0.26, 0.38));
  if (!ctx || !output) return;

  const now = ctx.currentTime;
  const duration = randomBetween(0.045, 0.082);
  const sampleCount = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleCount;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.8);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = randomBetween(760, 1380) - clamp(radius / 170, 0, 1) * 220;
  filter.Q.value = randomBetween(0.8, 1.5);
  const popGain = ctx.createGain();
  envelope(popGain, now, randomBetween(0.46, 0.7), 0.003, duration);
  source.connect(filter);
  filter.connect(popGain);
  popGain.connect(output);
  source.start(now);
  source.stop(now + duration + 0.02);

  const tickGain = ctx.createGain();
  const tick = ctx.createOscillator();
  tick.type = "sine";
  tick.frequency.setValueAtTime(randomBetween(520, 880), now);
  tick.frequency.exponentialRampToValueAtTime(randomBetween(1180, 1720), now + 0.045);
  envelope(tickGain, now, randomBetween(0.08, 0.16), 0.002, 0.055);
  tick.connect(tickGain);
  tickGain.connect(output);
  tick.start(now);
  tick.stop(now + 0.075);

  if (Math.random() > 0.58) {
    const secondGain = ctx.createGain();
    const second = ctx.createOscillator();
    const delay = randomBetween(0.028, 0.05);
    second.type = "triangle";
    second.frequency.setValueAtTime(randomBetween(760, 1160), now + delay);
    envelope(secondGain, now + delay, 0.06, 0.002, 0.04);
    second.connect(secondGain);
    secondGain.connect(output);
    second.start(now + delay);
    second.stop(now + delay + 0.06);
  }
}

function spawnPracticeBubble(now) {
  if (!practiceLayer) return;

  const id = `practice-${state.practiceCounter++}`;
  const size = randomBetween(34, 58);
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "practice-bubble";
  bubble.setAttribute("aria-label", "연습용 비눗방울 터뜨리기");
  bubble.style.setProperty("--size", `${size}px`);
  bubble.style.setProperty("--x", `calc(${randomBetween(16, 78).toFixed(2)}% - ${size / 2}px)`);
  bubble.style.setProperty("--y", `calc(${randomBetween(16, 62).toFixed(2)}% - ${size / 2}px)`);
  bubble.style.setProperty("--hue", randomBetween(168, 316).toFixed(1));
  bubble.style.setProperty("--duration", `${randomBetween(1.8, 3.2).toFixed(2)}s`);
  bubble.style.setProperty("--tilt", `${randomBetween(-34, 34).toFixed(1)}deg`);

  const data = {
    id,
    element: bubble,
    createdAt: now,
    size,
  };

  bubble.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    prepareAudio();
    popPracticeBubble(id, true);
  });

  practiceLayer.appendChild(bubble);
  state.practiceBubbles.set(id, data);
}

function popPracticeBubble(id, withSound = false) {
  const bubble = state.practiceBubbles.get(id);
  if (!bubble) return;

  const rect = bubble.element.getBoundingClientRect();
  if (withSound) {
    playPopSound(rect.left + rect.width / 2, bubble.size);
  }
  bubble.element.classList.add("popped");
  state.practiceBubbles.delete(id);
  window.setTimeout(() => bubble.element.remove(), 190);
}

function updatePracticeBubbles(now) {
  if (!practiceLayer || state.mode === "playing") return;

  for (const bubble of state.practiceBubbles.values()) {
    if (now - bubble.createdAt > 7800) {
      popPracticeBubble(bubble.id, false);
    }
  }

  if (state.practiceBubbles.size >= 5 || now < state.nextPracticeAt) return;

  spawnPracticeBubble(now);
  state.nextPracticeAt = now + randomBetween(560, 980);
}

function clearPracticeBubbles() {
  for (const bubble of state.practiceBubbles.values()) {
    bubble.element.remove();
  }
  state.practiceBubbles.clear();
}

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  createStars();
}

function createStars() {
  const count = Math.round(clamp((state.width * state.height) / 7200, 90, 260));
  state.stars = Array.from({ length: count }, () => ({
    x: Math.random() * state.width,
    y: Math.random() * state.height,
    r: randomBetween(0.45, 1.7),
    a: randomBetween(0.24, 0.9),
    phase: randomBetween(0, Math.PI * 2),
  }));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function getCurrentHour() {
  const date = new Date();
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function getBackgroundMix() {
  const hour = getCurrentHour();
  let currentIndex = BACKGROUND_THEMES.length - 1;

  for (let i = 0; i < BACKGROUND_THEMES.length; i += 1) {
    if (hour >= BACKGROUND_THEMES[i].startHour) {
      currentIndex = i;
    }
  }

  const nextIndex = (currentIndex + 1) % BACKGROUND_THEMES.length;
  const current = BACKGROUND_THEMES[currentIndex];
  const next = BACKGROUND_THEMES[nextIndex];
  const localHour = hour < current.startHour ? hour + 24 : hour;
  let nextStart = next.startHour;
  if (nextStart <= current.startHour) nextStart += 24;
  const amount = smoothstep((localHour - (nextStart - BACKGROUND_TRANSITION_HOURS)) / BACKGROUND_TRANSITION_HOURS);

  return {
    current,
    next,
    amount,
  };
}

function drawOrb(theme, now) {
  if (!theme.orb) return;

  const { width, height } = state;
  const x = width * (theme.orb.x + Math.sin(now * 0.00008) * 0.012);
  const y = height * (theme.orb.y + Math.cos(now * 0.00006) * 0.01);
  const radius = theme.orb.r;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 5.4);
  halo.addColorStop(0, theme.orb.halo);
  halo.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, radius * 5.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme.orb.color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  if (theme.name === "night") {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = theme.sky[0];
    ctx.beginPath();
    ctx.arc(x + radius * 0.34, y - radius * 0.18, radius * 0.86, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawClouds(theme, now, alpha) {
  if (!theme.cloudAlpha) return;

  const { width, height } = state;
  ctx.save();
  ctx.globalAlpha = alpha * theme.cloudAlpha;
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = theme.name === "sunset" ? "rgba(255, 213, 174, 0.34)" : "rgba(255, 255, 255, 0.28)";

  for (let i = 0; i < 4; i += 1) {
    const y = height * (0.18 + i * 0.12);
    const drift = ((now * (0.006 + i * 0.002) + i * 190) % (width + 420)) - 210;
    ctx.beginPath();
    ctx.ellipse(drift, y, 170 + i * 32, 28 + i * 5, 0.04 * i, 0, Math.PI * 2);
    ctx.ellipse(drift + 120, y + 16, 190 + i * 20, 24 + i * 4, -0.05, 0, Math.PI * 2);
    ctx.ellipse(drift + 280, y + 2, 150 + i * 22, 22 + i * 3, 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawThemeLayer(theme, now, alpha) {
  const { width, height } = state;
  ctx.save();
  ctx.globalAlpha = alpha;

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.5, theme.sky[1]);
  sky.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  drawOrb(theme, now);
  drawClouds(theme, now, alpha);

  const glowX = width * (theme.glowX + Math.sin(now * 0.00012) * 0.025);
  const glowY = height * theme.glowY;
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * 0.58);
  glow.addColorStop(0, theme.glow);
  glow.addColorStop(0.32, theme.glow.replace(/[\d.]+\)$/u, "0.16)"));
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const haze = ctx.createLinearGradient(0, height * 0.58, 0, height);
  haze.addColorStop(0, "rgba(255, 255, 255, 0)");
  haze.addColorStop(1, theme.haze);
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

function drawBackground(now) {
  const mix = getBackgroundMix();
  drawThemeLayer(mix.current, now, 1);
  drawThemeLayer(mix.next, now, mix.amount);

  drawAurora(now, mix.current, 1 - mix.amount);
  drawAurora(now, mix.next, mix.amount);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const starAlpha =
    mix.current.starAlpha * (1 - mix.amount) +
    mix.next.starAlpha * mix.amount;
  for (const star of state.stars) {
    const twinkle = 0.55 + Math.sin(now * 0.0015 + star.phase) * 0.35;
    ctx.globalAlpha = clamp(star.a * twinkle * starAlpha, 0, 0.95);
    if (ctx.globalAlpha <= 0.02) continue;
    ctx.fillStyle = "#f7fbff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAurora(now, theme, alpha) {
  if (!theme.auroraAlpha || alpha <= 0) return;

  const { width, height } = state;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = alpha * theme.auroraAlpha;
  ctx.lineCap = "round";
  const bands = [
    { y: 0.22, color: "rgba(125, 255, 205, 0.19)", width: 64, phase: 0 },
    { y: 0.3, color: "rgba(143, 221, 255, 0.15)", width: 78, phase: 1.6 },
    { y: 0.38, color: "rgba(255, 180, 226, 0.12)", width: 54, phase: 3.1 },
  ];

  for (const band of bands) {
    ctx.beginPath();
    for (let x = -40; x <= width + 40; x += 22) {
      const wave =
        Math.sin(x * 0.009 + now * 0.00055 + band.phase) * 38 +
        Math.sin(x * 0.017 - now * 0.00035 + band.phase) * 18;
      const y = height * band.y + wave;
      if (x === -40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = band.color;
    ctx.lineWidth = band.width;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBubble(bubble, now, draft = false) {
  const look = bubble.look || DRAFT_BUBBLE_LOOK;
  const age = draft ? 900 : Math.max(0, now - (bubble.createdAt || now));
  const spring = draft ? 0 : Math.exp(-age / 620) * Math.sin(age * 0.028) * look.birthSpring;
  const pulse = Math.sin(now * 0.003 + bubble.phase) * look.wobble;
  const r = bubble.r * (1 + pulse + spring);
  const alpha = draft ? 0.7 : bubble.alpha;
  const lightSweep = Math.sin(now * 0.00045 + bubble.phase) * 12;
  const lightAngle = look.lightAngle + now * 0.00016 * look.lightDrift;
  const lightX = Math.cos(lightAngle) * r * 0.34;
  const lightY = Math.sin(lightAngle) * r * 0.34;
  const squash = draft ? 0 : Math.exp(-age / 520) * Math.sin(age * 0.024 + bubble.phase) * 0.07;

  ctx.save();
  ctx.translate(bubble.x, bubble.y);
  ctx.scale(1 + squash, 1 - squash);
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = alpha;

  const glow = ctx.createRadialGradient(lightX, lightY, r * 0.03, 0, 0, r);
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.62 * look.highlight})`);
  glow.addColorStop(0.18, hsla(look.hueA + lightSweep, 92, 72, 0.28));
  glow.addColorStop(0.42, hsla(look.hueB - lightSweep * 0.45, 88, 70, 0.13));
  glow.addColorStop(0.72, hsla(look.hueC + lightSweep * 0.62, 92, 74, 0.2));
  glow.addColorStop(1, "rgba(255, 255, 255, 0.02)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  const rim = ctx.createLinearGradient(-r, -r, r, r);
  rim.addColorStop(0, hsla(look.hueA + 8, 96, 78, 0.9));
  rim.addColorStop(0.28, hsla(look.hueB, 96, 74, 0.42));
  rim.addColorStop(0.58, hsla(look.hueC, 96, 78, 0.76));
  rim.addColorStop(1, hsla(look.hueA + 146, 88, 80, 0.68));
  ctx.strokeStyle = rim;
  ctx.lineWidth = draft ? 2.8 : 1.6 + Math.sin(now * 0.002 + bubble.phase) * 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.68;
  ctx.rotate(Math.sin(now * 0.001 + bubble.phase) * 0.42 + look.bandTilt);
  for (let i = 0; i < 4; i += 1) {
    const bandR = r * (0.38 + i * 0.105);
    ctx.strokeStyle = [
      hsla(look.hueA + lightSweep, 96, 74, 0.36),
      hsla(look.hueB + 18, 94, 76, 0.32),
      hsla(look.hueC - 24, 95, 78, 0.34),
      hsla(look.hueA + 196, 88, 82, 0.25),
    ][i];
    ctx.lineWidth = Math.max(1, r * (0.011 + i * 0.002));
    ctx.beginPath();
    ctx.ellipse(
      0,
      r * (0.02 + i * 0.025),
      bandR,
      bandR * (0.22 + i * 0.025),
      -0.36 + i * 0.2,
      0.06,
      Math.PI * (1.12 + i * 0.08),
    );
    ctx.stroke();
  }

  ctx.globalAlpha = alpha * 0.78 * look.highlight;
  ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
  ctx.beginPath();
  ctx.ellipse(lightX - r * 0.13, lightY - r * 0.11, r * 0.14, r * 0.078, -0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.24;
  ctx.fillStyle = hsla(look.hueC + 34, 100, 84, 0.38);
  ctx.beginPath();
  ctx.ellipse(-lightX * 0.58, -lightY * 0.48, r * 0.07, r * 0.035, 0.35, 0, Math.PI * 2);
  ctx.fill();

  if (draft) {
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function updateBubbles(dt, now) {
  for (const bubble of state.bubbles) {
    bubble.age += dt;
    bubble.x += bubble.vx * dt;
    bubble.y += bubble.vy * dt;
    bubble.vx += Math.sin(now * 0.001 + bubble.phase) * 1.8 * dt;
    bubble.vy -= 2.8 * dt;
    bubble.x += Math.sin(now * 0.0018 + bubble.phase) * 5 * dt;

    if (bubble.x < -bubble.r) bubble.x = state.width + bubble.r;
    if (bubble.x > state.width + bubble.r) bubble.x = -bubble.r;
  }

  state.bubbles = state.bubbles.filter((bubble) => bubble.y > -bubble.r * 2);
}

function drawBubbles(now) {
  for (const bubble of state.bubbles) {
    drawBubble(bubble, now);
  }

  for (const hand of state.handStates.values()) {
    if (!hand.isPinching || !hand.draft) continue;
    drawBubble(
      {
        x: hand.draft.x,
        y: hand.draft.y,
        r: hand.draft.r,
        alpha: 0.86,
        phase: hand.phase,
      },
      now,
      true,
    );
  }
}

function addBubble(x, y, radius, now) {
  const r = clamp(radius, 18, Math.min(170, Math.min(state.width, state.height) * 0.22));
  state.bubbles.push({
    id: createId(),
    x,
    y,
    r,
    vx: randomBetween(-12, 12),
    vy: randomBetween(-16, -5),
    age: 0,
    alpha: randomBetween(0.68, 0.88),
    phase: randomBetween(0, Math.PI * 2),
    look: makeBubbleLook(),
    createdAt: now,
    immuneUntil: now + RELEASE_GRACE_MS,
  });
  playCreateSound(x, r);
}

function addPop(x, y, radius, bubble) {
  const look = bubble?.look || makeBubbleLook();
  const colors = [
    hsla(look.hueA, 98, 78, 0.95),
    hsla(look.hueB, 96, 78, 0.9),
    hsla(look.hueC, 98, 82, 0.9),
    hsla(look.hueA + 180, 88, 84, 0.86),
  ];
  const particles = Array.from({ length: Math.round(clamp(radius / 6, 10, 28)) }, (_, index) => {
    const angle = (Math.PI * 2 * index) / Math.round(clamp(radius / 6, 10, 28));
    const speed = randomBetween(56, 150);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: randomBetween(1.3, 3.4),
      color: colors[index % colors.length],
    };
  });
  state.pops.push({
    x,
    y,
    r: radius,
    age: 0,
    duration: 0.54,
    particles,
    look,
  });
  playPopSound(x, radius);
}

function updateAndDrawPops(dt) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const pop of state.pops) {
    pop.age += dt;
    const t = clamp(pop.age / pop.duration, 0, 1);
    const ringR = pop.r + t * 34;
    ctx.globalAlpha = (1 - t) * 0.84;
    ctx.strokeStyle = pop.look ? hsla(pop.look.hueA + t * 40, 96, 82, 0.72) : "rgba(210, 252, 255, 0.72)";
    ctx.lineWidth = 2 + (1 - t) * 2;
    ctx.beginPath();
    ctx.arc(pop.x, pop.y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    for (const p of pop.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 24 * dt;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 - t * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  state.pops = state.pops.filter((pop) => pop.age < pop.duration);
}

async function startCameraAndModel() {
  if (state.cameraReady && state.modelReady) {
    beginCalibration();
    return;
  }

  cameraButton.disabled = true;
  startButton.disabled = true;
  setGuide("idle", 0, 0.5, 0.76, "카메라 권한 창이 뜨면 허용을 눌러주세요.");
  setStatus("카메라 권한을 요청하는 중입니다...");

  const permissionHint = window.setTimeout(() => {
    if (!state.cameraReady) {
      setStatus("브라우저 상단이나 주소창 근처의 카메라 권한 창을 확인해주세요.");
    }
  }, 1400);

  try {
    await startCamera();
    window.clearTimeout(permissionHint);
    setStatus("카메라가 연결됐습니다. 손 인식 모델을 불러오는 중입니다...");
    setGuide("idle", 0.08, 0.5, 0.76, "카메라는 켜졌습니다. 이제 손 인식 모델을 준비하고 있어요.");
    await loadLandmarker();
    beginCalibration();
  } catch (error) {
    window.clearTimeout(permissionHint);
    console.error(error);
    cameraButton.disabled = false;
    cameraButton.textContent = "다시 시도";
    const message = explainStartupError(error);
    setGuide("idle", 0, 0.5, 0.76, message.guide);
    setStatus(message.status);
  }
}

async function startCamera() {
  if (state.cameraReady) return;

  if (!window.isSecureContext) {
    throw new Error("INSECURE_CONTEXT");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("NO_CAMERA_API");
  }

  state.stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  video.srcObject = state.stream;
  await video.play();
  state.cameraReady = true;
  cameraButton.textContent = "카메라 연결됨";
}

async function loadLandmarker() {
  if (state.modelReady) return;

  const { FilesetResolver, HandLandmarker } = await loadVisionTasks();
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const options = {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.42,
  };

  try {
    state.landmarker = await HandLandmarker.createFromOptions(vision, options);
  } catch (error) {
    console.warn("GPU delegate failed. Retrying with default delegate.", error);
    delete options.baseOptions.delegate;
    state.landmarker = await HandLandmarker.createFromOptions(vision, options);
  }

  state.modelReady = true;
}

async function loadVisionTasks() {
  if (state.visionTasks) return state.visionTasks;
  state.visionTasks = await import(TASKS_VISION_MODULE);
  return state.visionTasks;
}

function explainStartupError(error) {
  const name = error?.name || "";
  const message = error?.message || "";

  if (message === "INSECURE_CONTEXT") {
    return {
      guide: "카메라는 보안 페이지에서만 켤 수 있어요. http://127.0.0.1:8000/ 주소로 열어주세요.",
      status: "카메라가 막혔습니다. 로컬 서버 주소인 http://127.0.0.1:8000/ 에서 열어주세요.",
    };
  }

  if (message === "NO_CAMERA_API") {
    return {
      guide: "현재 브라우저가 카메라 기능을 제공하지 않습니다. Chrome이나 Safari에서 다시 열어주세요.",
      status: "이 브라우저에서는 카메라 API를 사용할 수 없습니다.",
    };
  }

  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      guide: "카메라 권한이 거부됐습니다. 주소창의 카메라 권한을 허용으로 바꾼 뒤 다시 시도해주세요.",
      status: "카메라 권한이 거부됐습니다. 권한을 허용한 뒤 다시 시도해주세요.",
    };
  }

  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return {
      guide: "사용 가능한 카메라를 찾지 못했습니다. 다른 앱이 카메라를 쓰고 있는지도 확인해주세요.",
      status: "카메라 장치를 찾지 못했습니다.",
    };
  }

  if (name === "NotReadableError" || name === "AbortError") {
    return {
      guide: "카메라가 다른 앱에서 사용 중일 수 있습니다. 화상회의 앱을 닫고 다시 시도해주세요.",
      status: "카메라를 열 수 없습니다. 다른 앱이 사용 중인지 확인해주세요.",
    };
  }

  if (message.includes("Failed to fetch") || message.includes("Importing a module script failed")) {
    return {
      guide: "카메라는 켜졌지만 손 인식 파일을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.",
      status: "손 인식 모델을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.",
    };
  }

  return {
    guide: `카메라 시작에 실패했습니다. ${name || message ? `${name} ${message}`.trim() : "브라우저 권한을 확인해주세요."}`,
    status: "카메라 또는 손 인식 준비에 실패했습니다. 권한과 인터넷 연결을 확인해주세요.",
  };
}

function beginCalibration() {
  state.mode = "calibrating";
  state.calibration.goodSince = 0;
  state.calibration.progress = 0;
  intro.classList.remove("hidden");
  hud.classList.add("hidden");
  helpPanel.classList.add("hidden");
  cameraButton.disabled = true;
  startButton.disabled = true;
  setStatus("손바닥과 손목이 함께 보이도록 거리를 맞춰주세요.");
}

function startPlay() {
  state.mode = "playing";
  clearPracticeBubbles();
  intro.classList.add("hidden");
  hud.classList.remove("hidden");
  helpPanel.classList.add("hidden");
  setStatus("");
}

function setStatus(message) {
  statusText.textContent = message;
}

function showEnvironmentNotice() {
  if (location.protocol !== "file:") return;

  setGuide(
    "idle",
    0,
    0.5,
    0.76,
    "현재 파일로 직접 열려 있어요. 카메라가 반응하지 않으면 http://127.0.0.1:8000/ 주소로 열어주세요.",
  );
  setStatus("파일로 직접 열린 상태입니다. 카메라가 안 켜지면 http://127.0.0.1:8000/ 주소로 열어주세요.");
}

function detectHands(now) {
  if (!state.landmarker || !state.cameraReady) return null;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  if (now - state.lastDetectionAt < 16) return null;
  if (video.currentTime === state.lastVideoTime) return null;

  state.lastDetectionAt = now;
  state.lastVideoTime = video.currentTime;
  const result = state.landmarker.detectForVideo(video, now);
  return parseHands(result);
}

function parseHands(result) {
  const landmarksList = result?.landmarks ?? [];
  const handednesses = result?.handednesses ?? result?.handedness ?? [];
  return landmarksList.map((landmarks, index) => {
    const handLabel =
      handednesses[index]?.[0]?.categoryName ||
      handednesses[index]?.categories?.[0]?.categoryName ||
      `hand-${index}`;
    return { landmarks, label: handLabel };
  });
}

function toScreen(point) {
  return {
    x: (state.mirror ? 1 - point.x : point.x) * state.width,
    y: point.y * state.height,
    z: point.z,
  };
}

function resolveHandState(label, wrist, now, usedKeys) {
  let best = null;
  let bestScore = Infinity;
  for (const hand of state.handStates.values()) {
    if (usedKeys.has(hand.key)) continue;
    const sameLabel = hand.label === label ? 0 : 75;
    const score = distance(wrist, hand.wrist) + sameLabel;
    if (score < bestScore) {
      bestScore = score;
      best = hand;
    }
  }

  if (best && bestScore < 320) {
    best.label = label;
    best.wrist = wrist;
    best.lastSeen = now;
    usedKeys.add(best.key);
    return best;
  }

  const key = `hand-${state.handCounter++}`;
  const hand = {
    key,
    label,
    wrist,
    lastSeen: now,
    isPinching: false,
    holdStart: 0,
    pinchCandidateSince: 0,
    blockPinchUntil: 0,
    lastReleaseAt: -Infinity,
    draft: null,
    openPalm: false,
    spreadHand: false,
    extendedCount: 0,
    phase: randomBetween(0, Math.PI * 2),
  };
  state.handStates.set(key, hand);
  usedKeys.add(key);
  return hand;
}

function analyzeHandPose(landmarks, points) {
  const wrist = landmarks[0];
  const palmWidth = normalizedDistance(landmarks[5], landmarks[17]);
  const palmLength = normalizedDistance(landmarks[0], landmarks[9]);
  const palmScale = Math.max(palmWidth, palmLength, 0.045);

  const fingers = [
    { name: "index", tip: 8, pip: 6, mcp: 5 },
    { name: "middle", tip: 12, pip: 10, mcp: 9 },
    { name: "ring", tip: 16, pip: 14, mcp: 13 },
    { name: "pinky", tip: 20, pip: 18, mcp: 17 },
  ];
  const fingerExtended = {};
  const extendedFingers = fingers.filter((finger) => {
    const tipFromWrist = normalizedDistance(landmarks[finger.tip], wrist);
    const pipFromWrist = normalizedDistance(landmarks[finger.pip], wrist);
    const tipFromMcp = normalizedDistance(landmarks[finger.tip], landmarks[finger.mcp]);
    const extended = tipFromWrist > pipFromWrist * 1.06 && tipFromMcp > palmScale * 0.48;
    fingerExtended[finger.name] = extended;
    return extended;
  }).length;

  const thumbTipFromWrist = normalizedDistance(landmarks[4], wrist);
  const thumbIpFromWrist = normalizedDistance(landmarks[3], wrist);
  const thumbExtended =
    thumbTipFromWrist > thumbIpFromWrist * 1.03 &&
    normalizedDistance(landmarks[4], landmarks[2]) > palmScale * 0.3;
  const extendedCount = extendedFingers + (thumbExtended ? 1 : 0);
  const spreadHand =
    (thumbExtended && extendedFingers >= 4) ||
    (extendedFingers >= 4 && normalizedDistance(landmarks[4], landmarks[8]) > palmScale * 0.38);
  const openPalm = spreadHand || (extendedCount >= 4 && normalizedDistance(landmarks[4], landmarks[8]) > palmScale * 0.58);
  const palmCenter = {
    x: (points[0].x + points[5].x + points[9].x + points[13].x + points[17].x) / 5,
    y: (points[0].y + points[5].y + points[9].y + points[13].y + points[17].y) / 5,
  };

  return {
    openPalm,
    spreadHand,
    extendedCount,
    fingerExtended,
    palmScale,
    palmCenter,
  };
}

function processHands(hands, now) {
  if (hands.length > 0) state.handsSeenAt = now;

  updateCalibration(hands, now);

  const usedKeys = new Set();
  const currentTips = new Map();
  const activeTips = [];

  for (const handData of hands) {
    const points = handData.landmarks.map(toScreen);
    const hand = resolveHandState(handData.label, points[0], now, usedKeys);
    const pose = analyzeHandPose(handData.landmarks, points);
    hand.openPalm = pose.openPalm;
    hand.spreadHand = pose.spreadHand;
    hand.extendedCount = pose.extendedCount;
    updatePinch(hand, handData.landmarks, points, now, pose);
    collectTips(hand, points, now, currentTips, activeTips, pose);
  }

  state.tipPositions = currentTips;
  detectBubbleTouches(activeTips, now);
  cleanupHands(now);
  updateHud(now);
}

function updatePinch(hand, landmarks, points, now, pose) {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const palmWidth = normalizedDistance(landmarks[5], landmarks[17]);
  const palmLength = normalizedDistance(landmarks[0], landmarks[9]);
  const palmScale = Math.max(palmWidth, palmLength, 0.045);
  const pinchGap = normalizedDistance(thumbTip, indexTip);
  const zGap = Math.abs((thumbTip.z ?? 0) - (indexTip.z ?? 0));
  const pinchRatio = pinchGap / palmScale;
  const zRatio = zGap / palmScale;
  const thumbMiddleGap = normalizedDistance(landmarks[4], landmarks[12]);
  const indexMiddleGap = normalizedDistance(landmarks[8], landmarks[12]);
  const thumbRingGap = normalizedDistance(landmarks[4], landmarks[16]);
  const pinchIsIsolated =
    pinchGap < Math.max(0.18, thumbMiddleGap * 1.8, indexMiddleGap * 1.8, thumbRingGap * 1.8);
  const longFingersOpen =
    pose.fingerExtended.index &&
    pose.fingerExtended.middle &&
    pose.fingerExtended.ring &&
    pose.fingerExtended.pinky;
  const openHandCandidate = pose.spreadHand || (longFingersOpen && pose.extendedCount >= 4);
  const thumbScreen = points[4];
  const indexScreen = points[8];
  const midpoint = {
    x: (thumbScreen.x + indexScreen.x) / 2,
    y: (thumbScreen.y + indexScreen.y) / 2,
  };
  const touching =
    pinchRatio < PINCH_CLOSE_RATIO &&
    zRatio < PINCH_CLOSE_Z_RATIO &&
    pinchGap < 0.16 &&
    pinchIsIsolated &&
    now > hand.blockPinchUntil;
  const openHandWithoutPinch = openHandCandidate && !touching;
  const released =
    pinchRatio > PINCH_OPEN_RATIO ||
    zRatio > PINCH_OPEN_Z_RATIO ||
    pinchGap > 0.14 ||
    (hand.isPinching && openHandWithoutPinch);

  if (!hand.isPinching && openHandWithoutPinch) {
    hand.pinchCandidateSince = 0;
    hand.blockPinchUntil = now + OPEN_HAND_BLOCK_MS;
    return;
  }

  if (!hand.isPinching) {
    if (touching && now - hand.lastReleaseAt > PINCH_COOLDOWN_MS) {
      if (!hand.pinchCandidateSince) hand.pinchCandidateSince = now;
      if (now - hand.pinchCandidateSince >= PINCH_STABLE_MS) {
        hand.isPinching = true;
        hand.holdStart = now;
        hand.draft = {
          x: midpoint.x,
          y: midpoint.y,
          r: 20,
        };
      }
    } else {
      hand.pinchCandidateSince = 0;
    }
  }

  if (!hand.isPinching || !hand.draft) return;

  const holdSeconds = (now - hand.holdStart) / 1000;
  const pressure = 1 - clamp(pinchRatio / PINCH_CLOSE_RATIO, 0, 1);
  const targetRadius = clamp(20 + holdSeconds * 42 + pressure * 18, 20, 164);
  hand.draft.x += (midpoint.x - hand.draft.x) * 0.32;
  hand.draft.y += (midpoint.y - hand.draft.y) * 0.32;
  hand.draft.r += (targetRadius - hand.draft.r) * 0.22;

  if (released && now - hand.holdStart > 40) {
    if (state.mode === "calibrating") {
      hand.isPinching = false;
      hand.lastReleaseAt = now;
      hand.pinchCandidateSince = 0;
      hand.draft = null;
      if (!startButton.disabled) {
        startPlay();
      }
      return;
    }

    addBubble(hand.draft.x, hand.draft.y, hand.draft.r, now);
    hand.isPinching = false;
    hand.lastReleaseAt = now;
    hand.pinchCandidateSince = 0;
    hand.draft = null;
  }
}

function collectTips(hand, points, now, currentTips, activeTips, pose) {
  const tipIndexes = [4, 8, 12, 16, 20];
  for (const index of tipIndexes) {
    const point = points[index];
    const key = `${hand.key}:${index}`;
    const previous = state.tipPositions.get(key);
    const dt = previous ? Math.max((now - previous.time) / 1000, 0.001) : 1;
    const speed = previous ? distance(point, previous) / dt : 0;
    const tip = {
      key,
      handKey: hand.key,
      x: point.x,
      y: point.y,
      speed,
      pinching: hand.isPinching,
      openPalm: pose.openPalm,
      brushRadius: pose.openPalm ? 26 : 10,
    };
    currentTips.set(key, { x: point.x, y: point.y, time: now });
    activeTips.push(tip);
  }

  if (pose.openPalm) {
    const key = `${hand.key}:palm`;
    const point = pose.palmCenter;
    const previous = state.tipPositions.get(key);
    const dt = previous ? Math.max((now - previous.time) / 1000, 0.001) : 1;
    const speed = previous ? distance(point, previous) / dt : 0;
    currentTips.set(key, { x: point.x, y: point.y, time: now });
    activeTips.push({
      key,
      handKey: hand.key,
      x: point.x,
      y: point.y,
      speed,
      pinching: hand.isPinching,
      openPalm: true,
      brushRadius: 42,
    });
  }
}

function detectBubbleTouches(tips, now) {
  if (state.bubbles.length === 0 || tips.length === 0) return;

  const popped = new Set();
  for (const bubble of state.bubbles) {
    if (now < bubble.immuneUntil) {
      markTouches(bubble, tips);
      continue;
    }

    for (const tip of tips) {
      if (tip.pinching || !tip.openPalm) continue;
      const key = `${bubble.id}:${tip.key}`;
      const inside = Math.hypot(tip.x - bubble.x, tip.y - bubble.y) < bubble.r + tip.brushRadius;
      const wasInside = state.touchMemory.get(key) === true;
      const movingEnough = tip.speed > 34;

      if (inside && !wasInside && movingEnough) {
        addPop(bubble.x, bubble.y, bubble.r, bubble);
        popped.add(bubble.id);
        state.touchMemory.set(key, true);
        break;
      }

      state.touchMemory.set(key, inside);
    }
  }

  if (popped.size > 0) {
    state.bubbles = state.bubbles.filter((bubble) => !popped.has(bubble.id));
  }
}

function markTouches(bubble, tips) {
  for (const tip of tips) {
    const key = `${bubble.id}:${tip.key}`;
    const inside = Math.hypot(tip.x - bubble.x, tip.y - bubble.y) < bubble.r + (tip.brushRadius || 10);
    state.touchMemory.set(key, inside);
  }
}

function cleanupHands(now) {
  for (const [key, hand] of state.handStates.entries()) {
    if (now - hand.lastSeen < LOST_HAND_MS) continue;
    state.handStates.delete(key);
  }
}

function updateCalibration(hands, now) {
  if (state.mode !== "calibrating") return;

  if (!state.modelReady || !state.cameraReady) {
    setGuide("idle", 0, 0.5, 0.76, "카메라와 손 인식 모델을 준비하고 있습니다.");
    return;
  }

  if (hands.length === 0) {
    state.calibration.goodSince = 0;
    setGuide("idle", 0, 0.5, 0.76, "손바닥과 손목이 함께 보이게 카메라 앞에 들어주세요.");
    startButton.disabled = true;
    return;
  }

  const handSize = Math.max(...hands.map((hand) => getHandSize(hand.landmarks)));
  const meter = clamp((handSize - 0.12) / 0.48, 0.04, 0.96);
  const sizeScale = clamp(handSize / TARGET_HAND_SIZE, 0.45, 1.34);

  if (handSize < 0.25) {
    state.calibration.goodSince = 0;
    setGuide("too-far", 0.22, meter, sizeScale, "조금 가까이 와주세요. 손목까지 화면 안에 들어오면 좋아요.");
    startButton.disabled = true;
    return;
  }

  if (handSize > 0.56) {
    state.calibration.goodSince = 0;
    setGuide("too-close", 0.26, meter, sizeScale, "조금 멀어져주세요. 엄지와 검지가 편하게 움직일 공간이 필요합니다.");
    startButton.disabled = true;
    return;
  }

  if (state.calibration.goodSince === 0) {
    state.calibration.goodSince = now;
  }

  const progress = clamp((now - state.calibration.goodSince) / 950, 0, 1);
  setGuide("good", progress, meter, sizeScale, "좋아요. 준비되면 엄지와 검지를 맞댔다가 떼면 바로 시작됩니다.");
  startButton.disabled = progress < 1;
  setStatus(progress < 1 ? "거리를 잠깐만 유지해주세요." : "준비됐습니다. 엄지와 검지를 맞댔다 떼면 시작합니다.");
}

function getHandSize(landmarks) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return Math.max(maxX - minX, maxY - minY);
}

function setGuide(kind, progress, meter, handScale, message) {
  guideStage.dataset.state = kind;
  guideStage.style.setProperty("--progress", progress.toFixed(3));
  guideStage.style.setProperty("--meter", meter.toFixed(3));
  guideStage.style.setProperty("--hand-scale", handScale.toFixed(3));
  guideMessage.textContent = message;
}

function updateHud(now) {
  if (state.mode !== "playing") return;

  const handActive = now - state.handsSeenAt < 520;
  const pinching = Array.from(state.handStates.values()).some((hand) => hand.isPinching);
  const openPalm = Array.from(state.handStates.values()).some((hand) => hand.openPalm);
  handSignal.dataset.active = handActive ? "true" : "false";
  handSignal.querySelector("strong").textContent = openPalm
    ? "터뜨리는 중"
    : pinching
    ? "비눗방울 키우는 중"
    : handActive
      ? "손 인식됨"
      : "손 대기 중";
}

function loop(now) {
  const dt = clamp((now - (loop.previousTime || now)) / 1000, 0, 0.04);
  loop.previousTime = now;

  const hands = detectHands(now);
  if (hands !== null) {
    processHands(hands, now);
  } else {
    cleanupHands(now);
    updateHud(now);
  }

  drawBackground(now);
  updatePracticeBubbles(now);
  updateBubbles(dt, now);
  drawBubbles(now);
  updateAndDrawPops(dt);

  requestAnimationFrame(loop);
}

function clearScene() {
  state.bubbles = [];
  state.pops = [];
  state.touchMemory.clear();
}

cameraButton.addEventListener("click", () => {
  prepareAudio();
  startCameraAndModel();
});
startButton.addEventListener("click", () => {
  prepareAudio();
  startPlay();
});
helpButton.addEventListener("click", () => helpPanel.classList.toggle("hidden"));
closeHelpButton.addEventListener("click", () => helpPanel.classList.add("hidden"));
calibrateButton.addEventListener("click", beginCalibration);
clearButton.addEventListener("click", clearScene);

window.addEventListener("resize", resize);
resize();
setGuide("idle", 0, 0.5, 0.76, "비눗방울을 눌러 터뜨려보고, 카메라를 켜주세요.");
showEnvironmentNotice();
requestAnimationFrame(loop);
