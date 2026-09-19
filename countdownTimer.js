export const createCountdownTimer = () => {
  let timeoutId = null;
  let targetTimestamp = null;
  let onTickCallback = null;
  let onCompleteCallback = null;
  let isRunning = false;

  // Clock offset: authoritative international UTC minus client Date.now()
  let serverOffset = 0;
  let isSynced = false;

  const probeTimeServer = async () => {
    const t0 = Date.now();
    // Use the official CORS-enabled TimeAPI endpoint
    const response = await fetch("https://timeapi.io/api/time/current/zone?timeZone=Etc/UTC", {
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`Time API returned status ${response.status}`);

    const data = await response.json();
    const t1 = Date.now();
    const rtt = t1 - t0;

    // Use exact numeric fields to avoid string-parsing / local-timezone discrepancies
    const serverUtc = Date.UTC(
      data.year,
      data.month - 1,
      data.day,
      data.hour,
      data.minute,
      data.seconds,
      data.milliSeconds || 0
    );

    const latency = rtt / 2;

    return {
      offset: (serverUtc + latency) - t1,
      rtt,
    };
  };

  const syncWithInternationalServer = async () => {
    const samples = [];

    // Probe twice: sample 1 warms up TLS connection, sample 2 gets pure network latency
    for (let i = 0; i < 2; i++) {
      try {
        const sample = await probeTimeServer();
        samples.push(sample);
      } catch {
        break;
      }
    }

    if (samples.length > 0) {
      // Pick lowest round-trip latency to eliminate jitter
      samples.sort((a, b) => a.rtt - b.rtt);
      serverOffset = Math.round(samples[0].offset);
      isSynced = true;
      return { offset: serverOffset, rtt: samples[0].rtt, source: "TimeAPI (NTP)" };
    }

    // Fallback: Cloudflare trace with latency compensation
    try {
      const t0 = Date.now();
      const cfResponse = await fetch("https://cloudflare.com/cdn-cgi/trace", { cache: "no-store" });
      const text = await cfResponse.text();
      const t1 = Date.now();
      const tsMatch = text.match(/ts=([\d.]+)/);

      if (tsMatch) {
        const serverUtc = parseFloat(tsMatch[1]) * 1000;
        const latency = (t1 - t0) / 2;
        serverOffset = Math.round((serverUtc + latency) - t1);
        isSynced = true;
        return { offset: serverOffset, rtt: t1 - t0, source: "Cloudflare" };
      }
    } catch {
      serverOffset = 0;
      isSynced = false;
      return { offset: 0, rtt: 0, source: "Local" };
    }

    return { offset: serverOffset, rtt: 0, source: "Local" };
  };

  const getAuthoritativeNow = () => Date.now() + serverOffset;

  const formatOffsetString = (offsetHours) => {
    const sign = offsetHours >= 0 ? "+" : "-";
    const absHours = Math.abs(offsetHours);
    const h = String(Math.floor(absHours)).padStart(2, "0");
    const m = String(Math.round((absHours % 1) * 60)).padStart(2, "0");
    return `${sign}${h}:${m}`;
  };

  const parseTargetWithOffset = (dateStr, tzOffsetHours = -3) => {
    const hasTimezone = dateStr.includes("Z") || /[+-]\d{2}(:\d{2})?$/.test(dateStr);
    const offsetSuffix = formatOffsetString(tzOffsetHours);
    const normalizedStr = hasTimezone
      ? dateStr
      : (dateStr.length === 16 ? `${dateStr}:00${offsetSuffix}` : `${dateStr}${offsetSuffix}`);

    const parsed = new Date(normalizedStr).getTime();
    if (Number.isNaN(parsed)) {
      throw new Error("Invalid target date format.");
    }
    return parsed;
  };

  const calculateRemaining = () => {
    const total = targetTimestamp - getAuthoritativeNow();
    if (total <= 0) {
      return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));

    return { total, days, hours, minutes, seconds };
  };

  const scheduleNextTick = () => {
    if (!isRunning) return;

    // Sub-second phase alignment: schedule tick to land precisely on the UTC second boundary
    const authoritativeNow = getAuthoritativeNow();
    const elapsedInSecond = authoritativeNow % 1000;
    const msUntilNextSecond = 1000 - elapsedInSecond;

    // 15ms buffer guarantees execution strictly inside the new second across all JS engines
    const delay = Math.max(15, msUntilNextSecond + 15);

    timeoutId = setTimeout(() => {
      if (!isRunning) return;

      const remaining = calculateRemaining();

      if (onTickCallback) {
        onTickCallback(remaining);
      }

      if (remaining.total <= 0) {
        stop();
        if (onCompleteCallback) {
          onCompleteCallback();
        }
      } else {
        scheduleNextTick();
      }
    }, delay);
  };

  const start = (targetDate, tzOffsetHours = -3, onTick, onComplete) => {
    stop();

    const parsedTimestamp = parseTargetWithOffset(targetDate, tzOffsetHours);
    if (parsedTimestamp <= getAuthoritativeNow()) {
      throw new Error("Target date must be a future date in the selected timezone.");
    }

    targetTimestamp = parsedTimestamp;
    onTickCallback = onTick;
    onCompleteCallback = onComplete;
    isRunning = true;

    // Immediate first tick
    const remaining = calculateRemaining();
    if (onTickCallback) {
      onTickCallback(remaining);
    }

    // Phase-aligned subsequent ticks
    scheduleNextTick();
  };

  const retarget = (targetDate, tzOffsetHours = -3) => {
    if (!isRunning) return;
    targetTimestamp = parseTargetWithOffset(targetDate, tzOffsetHours);
    realign();
  };

  const realign = () => {
    if (!isRunning) return;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    const remaining = calculateRemaining();
    if (onTickCallback) {
      onTickCallback(remaining);
    }
    scheduleNextTick();
  };

  const stop = () => {
    isRunning = false;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return {
    syncWithInternationalServer,
    getAuthoritativeNow,
    isSynchronized: () => isSynced,
    getOffset: () => serverOffset,
    parseTargetWithOffset,
    retarget,
    realign,
    start,
    stop,
  };
};
