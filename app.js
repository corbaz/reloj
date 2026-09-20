import {
  createCountdownTimer,
  getTimezoneDate,
  formatTzTag,
  getTimezoneOffsetMinutes,
} from "./countdownTimer.js";

// DOM References
const targetInput = document.getElementById("target-datetime");
const targetLabel = document.getElementById("target-label");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusMsg = document.getElementById("status-msg");
const syncBadge = document.getElementById("sync-badge");
const currentTimeDisplay = document.getElementById("current-gmt3-time");
const clockCityLabel = document.getElementById("clock-city-label");
const tzTagDisplay = document.getElementById("tz-tag-display");
const timezoneSelect = document.getElementById("timezone-select");

const cardDays = document.getElementById("card-days");
const cardHours = document.getElementById("card-hours");
const cardMinutes = document.getElementById("card-minutes");
const cardSeconds = document.getElementById("card-seconds");

const timer = createCountdownTimer();
let masterTimeoutId = null;

// Default timezone: Buenos Aires (America/Argentina/Buenos_Aires). Never saved to localStorage so F5 resets cleanly.
let currentTimeZone = "America/Argentina/Buenos_Aires";
let currentTzLabel = "Buenos Aires";

const padZero = (num) => String(num).padStart(2, "0");

const setStatus = (message, type = "") => {
  statusMsg.textContent = message;
  statusMsg.className = "status-banner" + (type ? ` ${type}` : "");
};

// 3D Flip Card Animator
const flipCard = (card, newValue) => {
  const currentValue = card.dataset.value || "00";
  if (currentValue === newValue) return;

  card.dataset.value = newValue;

  const topText = card.querySelector(".top .digit-text");
  const bottomText = card.querySelector(".bottom .digit-text");

  const topFlip = document.createElement("div");
  topFlip.classList.add("card-face", "top-flip");
  const topSpan = document.createElement("span");
  topSpan.classList.add("digit-text");
  topSpan.textContent = currentValue;
  topFlip.appendChild(topSpan);

  const bottomFlip = document.createElement("div");
  bottomFlip.classList.add("card-face", "bottom-flip");
  const bottomSpan = document.createElement("span");
  bottomSpan.classList.add("digit-text");
  bottomSpan.textContent = newValue;
  bottomFlip.appendChild(bottomSpan);

  topFlip.addEventListener("animationstart", () => {
    if (topText) topText.textContent = newValue;
  });

  topFlip.addEventListener("animationend", () => {
    topFlip.remove();
  });

  bottomFlip.addEventListener("animationend", () => {
    if (bottomText) bottomText.textContent = newValue;
    bottomFlip.remove();
  });

  card.append(topFlip, bottomFlip);
};

const setCardDirect = (card, value) => {
  card.dataset.value = value;
  const topText = card.querySelector(".top .digit-text");
  const bottomText = card.querySelector(".bottom .digit-text");
  if (topText) topText.textContent = value;
  if (bottomText) bottomText.textContent = value;
};

const updateDisplay = ({ days, hours, minutes, seconds }) => {
  flipCard(cardDays, padZero(days));
  flipCard(cardHours, padZero(hours));
  flipCard(cardMinutes, padZero(minutes));
  flipCard(cardSeconds, padZero(seconds));
};

// Set default target input value (+1 hour in selected timezone)
const refreshTargetInputDefault = () => {
  const authoritativeNow = timer.getAuthoritativeNow();
  const futureTimestamp = authoritativeNow + 1 * 60 * 60 * 1000;
  const target = getTimezoneDate(futureTimestamp, currentTimeZone);
  targetInput.value = `${target.year}-${target.month}-${target.day}T${target.hours}:${target.minutes}`;
};

// Update select options with dynamic GMT tags based on current DST status
const updateSelectOptionLabels = (nowTimestamp) => {
  for (const option of timezoneSelect.options) {
    const tz = option.value;
    const tag = formatTzTag(nowTimestamp, tz);
    if (!option.dataset.rawLabel) {
      option.dataset.rawLabel = option.textContent.trim();
    }
    option.textContent = `(${tag}) ${option.dataset.rawLabel}`;
  }
};

// =========================================================================
// UNIFIED MASTER HEARTBEAT DISPATCHER (Single Event Loop Source of Truth)
// =========================================================================
const masterHeartbeat = () => {
  if (masterTimeoutId !== null) {
    clearTimeout(masterTimeoutId);
    masterTimeoutId = null;
  }

  const authoritativeNow = timer.getAuthoritativeNow();

  // 1. Synchronously update top digital clock and timezone tag
  const { hours, minutes, seconds } = getTimezoneDate(authoritativeNow, currentTimeZone);
  currentTimeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
  tzTagDisplay.textContent = formatTzTag(authoritativeNow, currentTimeZone);

  // 2. Synchronously update countdown flip cards in the EXACT same tick
  if (timer.isActive()) {
    const remaining = timer.calculateRemaining();
    updateDisplay(remaining);

    if (remaining.total <= 0) {
      timer.stop();
      startBtn.disabled = false;
      stopBtn.disabled = true;
      targetInput.disabled = false;
      setStatus(`Target time reached in ${currentTzLabel}! Countdown finished.`, "success");
    }
  }

  // 3. Schedule next tick precisely on the zero-millisecond boundary of the next UTC second
  const elapsedInSecond = authoritativeNow % 1000;
  const msUntilNextSecond = 1000 - elapsedInSecond;
  // 20ms safety margin ensures we strictly evaluate inside the new second
  const delay = Math.max(20, msUntilNextSecond + 20);

  masterTimeoutId = setTimeout(masterHeartbeat, delay);
};

// Dynamic International Time Synchronization (SNTP)
const syncClock = async (isSilent = false) => {
  if (!isSilent) {
    syncBadge.textContent = "Syncing NTP...";
    syncBadge.className = "badge badge-sync";
  }

  const result = await timer.syncWithInternationalServer();

  if (timer.isSynchronized()) {
    const jitter = result.rtt ? ` ±${Math.round(result.rtt / 2)}ms` : "";
    syncBadge.textContent = `Synced NTP${jitter}`;
    syncBadge.className = "badge badge-sync synced";
  } else {
    syncBadge.textContent = "Local Clock";
    syncBadge.className = "badge badge-sync";
  }

  // Immediately execute unified heartbeat with freshly calibrated offset
  masterHeartbeat();
};

// Automatically detect client's local timezone
const detectInitialTimezone = () => {
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let matchingOption = Array.from(timezoneSelect.options).find(
    (opt) => opt.value === userTz
  );

  // If exact IANA identifier is not in the list, match by current UTC offset
  if (!matchingOption) {
    const authoritativeNow = timer.getAuthoritativeNow();
    const localOffsetMin = -new Date().getTimezoneOffset();
    matchingOption = Array.from(timezoneSelect.options).find((opt) => {
      return getTimezoneOffsetMinutes(authoritativeNow, opt.value) === localOffsetMin;
    });
  }

  if (matchingOption) {
    timezoneSelect.value = matchingOption.value;
    currentTimeZone = matchingOption.value;
    currentTzLabel = matchingOption.dataset.label || matchingOption.text;
  } else {
    timezoneSelect.value = "America/Argentina/Buenos_Aires";
    currentTimeZone = "America/Argentina/Buenos_Aires";
    currentTzLabel = "Buenos Aires";
  }

  const tagText = formatTzTag(timer.getAuthoritativeNow(), currentTimeZone);
  clockCityLabel.textContent = `${currentTzLabel}:`;
  tzTagDisplay.textContent = tagText;
  targetLabel.textContent = `Target Date & Time (${currentTzLabel} • ${tagText})`;
};

// Initial boot
const initClock = async () => {
  await syncClock(false);
  updateSelectOptionLabels(timer.getAuthoritativeNow());
  detectInitialTimezone();
  refreshTargetInputDefault();
};

initClock();

// =========================================================================
// TIMEZONE SELECTION LOGIC
// =========================================================================
timezoneSelect.addEventListener("change", () => {
  const selectedOption = timezoneSelect.options[timezoneSelect.selectedIndex];
  currentTimeZone = selectedOption.value;
  currentTzLabel = selectedOption.dataset.label || selectedOption.text;

  const authoritativeNow = timer.getAuthoritativeNow();
  const tagText = formatTzTag(authoritativeNow, currentTimeZone);

  // Update header and labels across the app
  clockCityLabel.textContent = `${currentTzLabel}:`;
  tzTagDisplay.textContent = tagText;
  targetLabel.textContent = `Target Date & Time (${currentTzLabel} • ${tagText})`;

  if (timer.isActive()) {
    // Keep user's configured target date/time intact; recalibrate countdown against new timezone
    timer.retarget(targetInput.value, currentTimeZone);
    setStatus(`Countdown recalibrated for ${currentTzLabel} (${tagText}).`, "");
  } else {
    // Only reset default to +1 hour if countdown is not actively running
    refreshTargetInputDefault();
  }

  // Force synchronous update on next heartbeat
  masterHeartbeat();
});

// =========================================================================
// PRODUCTION-GRADE DRIFT & SUSPENSION RECOVERY MECHANISMS
// =========================================================================
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    masterHeartbeat();
    syncClock(true);
  }
});

window.addEventListener("online", () => {
  syncClock(true);
});

// Periodic Background Calibration (Every 5 minutes)
setInterval(() => {
  if (document.visibilityState === "visible") {
    syncClock(true);
  }
}, 5 * 60 * 1000);

// =========================================================================
// USER CONTROLS
// =========================================================================
startBtn.addEventListener("click", () => {
  const selectedDate = targetInput.value;

  if (!selectedDate) {
    targetInput.classList.add("error");
    setStatus(`Please choose a valid target date and time in ${currentTzLabel}.`, "error");
    return;
  }

  try {
    targetInput.classList.remove("error");

    const remaining = timer.start(selectedDate, currentTimeZone);
    updateDisplay(remaining);

    startBtn.disabled = true;
    stopBtn.disabled = false;
    targetInput.disabled = true;
    const tagText = formatTzTag(timer.getAuthoritativeNow(), currentTimeZone);
    setStatus(`Countdown in progress (${currentTzLabel} • ${tagText})...`, "");

    // Trigger immediate heartbeat to align both timers
    masterHeartbeat();
  } catch (err) {
    targetInput.classList.add("error");
    setStatus(err.message, "error");
  }
});

stopBtn.addEventListener("click", () => {
  timer.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  targetInput.disabled = false;
  setStatus("Countdown paused.", "");
  masterHeartbeat();
});
