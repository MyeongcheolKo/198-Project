// Lightweight recursive analyzer: tracks rolling baseline + detects anomalies via variance

export class RecursiveAnalyzer {
  constructor(opts = {}) {
    // Window sizes (in # of samples; at 200ms per sample: 50 = 10s, 150 = 30s, 1500 = 5min)
    this.LONG_WINDOW = opts.longWindow || 1500;    // ~5 min baseline
    this.SHORT_WINDOW = opts.shortWindow || 150;   // ~30 sec current
    this.MIN_SAMPLES = opts.minSamples || 100;     // min to start analyzing

    // Per-sensor state: circular buffers + running stats
    this.sensors = {};
    this.initSensor('hr');
    this.initSensor('spo2');
    this.initSensor('temp');
    this.initSensor('accel');
  }

  initSensor(name) {
    this.sensors[name] = {
      buffer: [],
      longMean: 0,
      longVar: 0,
      shortMean: 0,
      shortVar: 0,
      trend: 0, // slope: (recent - past) / time
      anomalyScore: 0,
    };
  }

  // Welford's online algorithm for mean/variance (numerically stable)
  static computeStats(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return { mean: 0, variance: 0, count: 0 };
    }
    let mean = 0, m2 = 0;
    for (let i = 0; i < arr.length; i++) {
      const delta = arr[i] - mean;
      mean += delta / (i + 1);
      m2 += delta * (arr[i] - mean);
    }
    const variance = arr.length > 1 ? m2 / (arr.length - 1) : 0;
    return { mean, variance, count: arr.length };
  }

  // Feed in a sample for a sensor
  addSample(sensorName, value) {
    if (!(sensorName in this.sensors)) return;

    const state = this.sensors[sensorName];
    state.buffer.push(Number(value) || 0);

    // Keep only the long window
    if (state.buffer.length > this.LONG_WINDOW) {
      state.buffer.shift();
    }

    // Recompute stats on each update (simple but accurate)
    this._updateStats(sensorName);
  }

  _updateStats(sensorName) {
    const state = this.sensors[sensorName];
    const buf = state.buffer;

    if (buf.length < this.MIN_SAMPLES) {
      state.anomalyScore = 0;
      return;
    }

    // Long-term baseline (older half)
    const longStart = Math.max(0, buf.length - this.LONG_WINDOW);
    const longEnd = Math.max(longStart + 1, Math.floor(buf.length * 0.6));
    const longArr = buf.slice(longStart, longEnd);
    const longStats = RecursiveAnalyzer.computeStats(longArr);
    state.longMean = longStats.mean;
    state.longVar = longStats.variance;

    // Short-term current (recent samples)
    const shortStart = Math.max(0, buf.length - this.SHORT_WINDOW);
    const shortArr = buf.slice(shortStart);
    const shortStats = RecursiveAnalyzer.computeStats(shortArr);
    state.shortMean = shortStats.mean;
    state.shortVar = shortStats.variance;

    // Trend: (short mean - long mean) normalized by long std dev
    const longStd = Math.sqrt(Math.max(state.longVar, 1e-6));
    state.trend = (state.shortMean - state.longMean) / longStd;

    // Anomaly score: combine mean shift + variance surge
    // Idea: if short-term deviates from baseline OR shows high variance, flag it
    const meanShift = Math.abs(state.trend);
    const shortStd = Math.sqrt(Math.max(state.shortVar, 1e-6));
    const varianceSurge = shortStd / Math.max(longStd, 1e-6); // ratio > 1 = more variance now

    // Simple heuristic: weight trend change + variance spike
    state.anomalyScore = 0.6 * Math.tanh(meanShift) + 0.4 * Math.tanh(varianceSurge - 1);
    state.anomalyScore = Math.max(0, Math.min(1, state.anomalyScore)); // clamp to [0, 1]
  }

  // Compute combined delirium risk from all sensors
  computeRisk() {
    const scores = {
      hr: this.sensors.hr.anomalyScore,
      spo2: this.sensors.spo2.anomalyScore,
      temp: this.sensors.temp.anomalyScore,
      accel: this.sensors.accel.anomalyScore,
    };

    // Weighted combination: focus on HR/SPO2 variability, accel/temp as secondary
    const risk =
      0.35 * scores.hr +
      0.30 * scores.spo2 +
      0.20 * scores.accel +
      0.15 * scores.temp;

    return {
      score: Math.max(0, Math.min(1, risk)),
      components: scores,
      state: {
        hr: { mean: this.sensors.hr.longMean, var: this.sensors.hr.longVar, trend: this.sensors.hr.trend },
        spo2: { mean: this.sensors.spo2.longMean, var: this.sensors.spo2.longVar, trend: this.sensors.spo2.trend },
      },
    };
  }

  // Reset state (e.g., on patient change)
  reset() {
    this.initSensor('hr');
    this.initSensor('spo2');
    this.initSensor('temp');
    this.initSensor('accel');
  }
}
