import { createCountdownTimer } from "./countdownTimer.js";

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
let headerClockTimeout = null;
let isCountdownActive = false;

// Default timezone: Buenos Aires (GMT-3). Never saved to localStorage so F5 resets cleanly.
let currentTzOffset = -3;
let currentTzLabel = "Buenos Aires";

const padZero = (num) => String(num).padStart(2, "0");

const formatTzTag = (offsetHours) => {
  const sign = offsetHours >= 0 ? "+" : "-";
  return `GMT${sign}${Math.abs(offsetHours)}`;
};

const setStatus = (message, type = "") => {
  statusMsg.textContent = message;
  statusMsg.className = "status-banner" + (type ? ` ${type}` : "");
};

// Convert authoritative UTC timestamp to any selected timezone components
const getTimezoneDate = (timestamp, offsetHours) => {
  const offsetMs = offsetHours * 60 * 60 * 1000;
  const tzDate = new Date(timestamp + offsetMs);

  return {
    year: tzDate.getUTCFullYear(),
    month: padZero(tzDate.getUTCMonth() + 1),
    day: padZero(tzDate.getUTCDate()),
    hours: padZero(tzDate.getUTCHours()),
    minutes: padZero(tzDate.getUTCMinutes()),
    seconds: padZero(tzDate.getUTCSeconds()),
  };
};

// Update header digital clock with the currently selected timezone
const updateClockDisplay = () => {
  const authoritativeNow = timer.getAuthoritativeNow();
  const { hours, minutes, seconds } = getTimezoneDate(authoritativeNow, currentTzOffset);
  currentTimeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
};

// Phase-aligned clock scheduler: synchronizes tick execution with the exact UTC second boundary
const scheduleHeaderClock = () => {
  if (headerClockTimeout !== null) {
    clearTimeout(headerClockTimeout);
    headerClockTimeout = null;
  }

  updateClockDisplay();

  const authoritativeNow = timer.getAuthoritativeNow();
  const elapsedInSecond = authoritativeNow % 1000;
  const msUntilNextSecond = 1000 - elapsedInSecond;
  const delay = Math.max(15, msUntilNextSecond + 15);

  headerClockTimeout = setTimeout(scheduleHeaderClock, delay);
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

const updateDisplay = ({ days, hours, minutes, seconds }) => {
  flipCard(cardDays, padZero(days));
  flipCard(cardHours, padZero(hours));
  flipCard(cardMinutes, padZero(minutes));
  flipCard(cardSeconds, padZero(seconds));
};

// Set default target input value (+2 hours in selected timezone)
const refreshTargetInputDefault = () => {
  const authoritativeNow = timer.getAuthoritativeNow();
  const futureTimestamp = authoritativeNow + 2 * 60 * 60 * 1000;
  const target = getTimezoneDate(futureTimestamp, currentTzOffset);
  targetInput.value = `${target.year}-${target.month}-${target.day}T${target.hours}:${target.minutes}`;
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

  scheduleHeaderClock();
  timer.realign();
};

// Initial boot
const initClock = async () => {
  // Always reset selector visually to Buenos Aires
  timezoneSelect.value = "-3";
  currentTzOffset = -3;
  currentTzLabel = "Buenos Aires";

  await syncClock(false);
  refreshTargetInputDefault();
};

initClock();

// =========================================================================
// TIMEZONE SELECTION LOGIC
// =========================================================================

timezoneSelect.addEventListener("change", (e) => {
  const selectedOption = timezoneSelect.options[timezoneSelect.selectedIndex];
  currentTzOffset = parseFloat(selectedOption.value);
  currentTzLabel = selectedOption.dataset.label || selectedOption.text;

  const tagText = formatTzTag(currentTzOffset);

  // Update header and labels across the app
  clockCityLabel.textContent = `${currentTzLabel}:`;
  tzTagDisplay.textContent = tagText;
  targetLabel.textContent = `Target Date & Time (${currentTzLabel} • ${tagText})`;

  // Immediately refresh the live clock display to show selected city time
  updateClockDisplay();

  // If countdown is active, retarget smoothly; otherwise update input default
  if (isCountdownActive) {
    timer.retarget(targetInput.value, currentTzOffset);
    setStatus(`Target recalibrated to ${currentTzLabel} (${tagText}).`, "");
  } else {
    refreshTargetInputDefault();
  }
});

// =========================================================================
// PRODUCTION-GRADE DRIFT & SUSPENSION RECOVERY MECHANISMS
// =========================================================================

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    scheduleHeaderClock();
    timer.realign();
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

    timer.start(
      selectedDate,
      currentTzOffset,
      (remaining) => {
        updateDisplay(remaining);
      },
      () => {
        isCountdownActive = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        targetInput.disabled = false;
        setStatus(`Target time reached in ${currentTzLabel}! Countdown finished.`, "success");
      }
    );

    isCountdownActive = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    targetInput.disabled = true;
    setStatus(`Countdown in progress (${currentTzLabel} • ${formatTzTag(currentTzOffset)})...`, "");
  } catch (err) {
    targetInput.classList.add("error");
    setStatus(err.message, "error");
  }
});

stopBtn.addEventListener("click", () => {
  timer.stop();
  isCountdownActive = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  targetInput.disabled = false;
  setStatus("Countdown paused.", "");
});
