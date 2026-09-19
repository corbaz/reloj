# Retro Flip Countdown Timer ⏱️

> A token-driven, accessible 3D split-flap digital clock and countdown timer built with the **JavaScript Module Pattern**, sub-second **SNTP international time synchronization**, and dynamic multi-timezone support.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Accessibility](https://img.shields.io/badge/WCAG-2.2%20AA-success.svg)
![Architecture](https://img.shields.io/badge/Architecture-Module%20Pattern-yellow.svg)

---

## 🚀 Key Features

- **3D Split-Flap Mechanical Display**: Realistic mechanical flip card animation powered by pure CSS 3D transforms (`rotateX`) and sub-pixel clipping, eliminating text jitter and rendering artifacts.
- **Sub-Second Multi-Device Synchrony**: Phase-aligned ticks that fire precisely on the UTC second boundary (`1000 - (now % 1000)`), eliminating drift between mobile and desktop devices.
- **SNTP International Time Synchronization**: Compensates for client hardware clock skew and network jitter by sampling atomic NTP time servers with Round-Trip Time (RTT) adjustment.
- **Mobile Sleep & Suspension Recovery**: Automatically resynchronizes via the Page Visibility API (`visibilitychange`) whenever a phone is unlocked or a background tab is restored.
- **Dynamic Multi-City Timezone Selector**: Defaults strictly to **Buenos Aires (GMT-3)** on every refresh, with live recalibration for global cities (Madrid, New York, Tokyo, London, Mexico City, etc.).
- **Strict Module Pattern Architecture**: Private state (intervals, timestamps, network offsets) is safely encapsulated via closures, exposing only authorized methods.
- **WCAG 2.2 AA Accessible**: Full keyboard navigation, high contrast ratios, `font-variant-numeric: tabular-nums`, and screen reader announcements (`role="status"`, `aria-live="polite"`).

---

## 🏛️ Architectural Foundations

### 1. The Revealing Module Pattern (`countdownTimer.js`)
Global scope pollution and exposed interval handles lead to memory leaks and accidental state mutation. The timer is engineered as an encapsulated factory function:

```javascript
export const createCountdownTimer = () => {
  // 1. Private Scope (Encapsulated)
  let timeoutId = null;
  let targetTimestamp = null;
  let serverOffset = 0;

  // 2. Private Methods (Calculation, NTP Sync, Phase Alignment)
  const calculateRemaining = () => { ... };
  const scheduleNextTick = () => { ... };

  // 3. Revealing Public API
  return {
    syncWithInternationalServer,
    getAuthoritativeNow,
    isSynchronized,
    start,
    stop,
    retarget,
    realign
  };
};
```

### 2. Eliminating Cross-Device Drift (SNTP + Phase Alignment)
A naive `setInterval(tick, 1000)` fires at whatever arbitrary millisecond the user loaded the web page. If a desktop loads at `.100ms` and a mobile loads at `.850ms`, the two screens suffer a visible 750ms drift.

This implementation replaces `setInterval` with **Atomic Phase Alignment**:
```javascript
const authoritativeNow = getAuthoritativeNow();
const elapsedInSecond = authoritativeNow % 1000;
const msUntilNextSecond = 1000 - elapsedInSecond;

// Schedules execution exactly on the zero-millisecond boundary of the next UTC second
timeoutId = setTimeout(tick, Math.max(15, msUntilNextSecond + 15));
```

---

## 🛠️ Project Structure

```
├── index.html          # Semantic, accessible DOM structure
├── styles.css          # Tokenized CSS, 3D flip card animations & mobile breakpoints
├── countdownTimer.js   # Encapsulated countdown and NTP synchronization module
├── app.js              # View controller, event bindings & Page Visibility listeners
└── README.md           # Technical documentation
```

---

## 💻 Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/corbaz/reloj.git
   cd reloj
   ```

2. Start a local HTTP server (required for ES Modules):
   ```bash
   npx serve . -l 3000
   ```
   *(Or using Python: `python -m http.server 3000`)*

3. Open in your browser:
   - Desktop: [http://localhost:3000](http://localhost:3000)
   - Mobile: `http://<YOUR_LOCAL_IP>:3000`

---

## 📄 License

MIT
