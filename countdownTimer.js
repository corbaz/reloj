export const createCountdownTimer = () => {
  let targetTimestamp = null;
  let isRunning = false;

  // Clock offset: authoritative international UTC minus client Date.now()
  let serverOffset = 0;
  let isSynced = false;

  const probeTimeServer = async () => {
    const t0 = Date.now();
    const response = await fetch("https://timeapi.io/api/time/current/zone?timeZone=Etc/UTC", {
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`Time API returned status ${response.status}`);

    const data = await response.json();
    const t1 = Date.now();
    const rtt = t1 - t0;

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

    for (let i = 0; i < 2; i++) {
      try {
        const sample = await probeTimeServer();
        samples.push(sample);
      } catch {
        break;
      }
    }

    if (samples.length > 0) {
      samples.sort((a, b) => a.rtt - b.rtt);
      serverOffset = Math.round(samples[0].offset);
      isSynced = true;
      return { offset: serverOffset, rtt: samples[0].rtt, source: "TimeAPI (NTP)" };
    }

    // Fallback: Cloudflare trace
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

  const calculateRemaining = () => {
    if (!targetTimestamp) {
      return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    const total = targetTimestamp - getAuthoritativeNow();
    if (total <= 0) {
      return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    // Use Math.ceil so remaining seconds countdown in lockstep with the clock ticking forward
    const totalSeconds = Math.ceil(total / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const days = Math.floor(totalSeconds / 86400);

    return { total, days, hours, minutes, seconds };
  };

  const start = (targetDate, timeZone = "America/Argentina/Buenos_Aires") => {
    const parsedTimestamp = parseTargetInTimezone(targetDate, timeZone);
    if (parsedTimestamp <= getAuthoritativeNow()) {
      throw new Error("Target date must be a future date in the selected timezone.");
    }

    targetTimestamp = parsedTimestamp;
    isRunning = true;
    return calculateRemaining();
  };

  const retarget = (targetDate, timeZone = "America/Argentina/Buenos_Aires") => {
    if (!isRunning) return;
    targetTimestamp = parseTargetInTimezone(targetDate, timeZone);
  };

  const stop = () => {
    isRunning = false;
  };

  return {
    syncWithInternationalServer,
    getAuthoritativeNow,
    isSynchronized: () => isSynced,
    getOffset: () => serverOffset,
    calculateRemaining,
    retarget,
    start,
    stop,
    isActive: () => isRunning,
  };
};

export const getTimezoneOffsetMinutes = (timestamp, timeZone) => {
  const date = new Date(timestamp);
  const getParts = (tz) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const m = {};
    for (const p of parts) m[p.type] = p.value;
    return m;
  };
  const u = getParts("UTC");
  const t = getParts(timeZone);
  const uMs = Date.UTC(u.year, u.month - 1, u.day, u.hour, u.minute, u.second);
  const tMs = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  return Math.round((tMs - uMs) / 60000);
};

export const formatTzTag = (timestamp, timeZone) => {
  const offsetMin = getTimezoneOffsetMinutes(timestamp, timeZone);
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  return m === 0 ? `GMT${sign}${h}` : `GMT${sign}${h}:${String(m).padStart(2, "0")}`;
};

export const getTimezoneDate = (timestamp, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));

  const mapping = {};
  for (const part of parts) {
    mapping[part.type] = part.value;
  }

  return {
    year: mapping.year,
    month: mapping.month,
    day: mapping.day,
    hours: mapping.hour,
    minutes: mapping.minute,
    seconds: mapping.second,
  };
};

export const parseTargetInTimezone = (dateStr, timeZone) => {
  const [datePart, timePart] = dateStr.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss = 0] = timePart.split(":").map(Number);

  const candidateUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offsetMin = getTimezoneOffsetMinutes(candidateUtc, timeZone);
  let refinedUtc = candidateUtc - offsetMin * 60 * 1000;

  const refinedOffsetMin = getTimezoneOffsetMinutes(refinedUtc, timeZone);
  if (refinedOffsetMin !== offsetMin) {
    refinedUtc = candidateUtc - refinedOffsetMin * 60 * 1000;
  }

  return refinedUtc;
};
