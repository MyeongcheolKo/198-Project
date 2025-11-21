// Lightweight recursive analyzer: tracks rolling baseline + detects anomalies via variance
// OPTIMIZED: circular buffers, incremental statistics, O(1) updates

export class RecursiveAnalyzer {
  constructor(opts = {}) {
    this.LONG_WINDOW = opts.longWindow || 1500;    // max samples to keep
    this.SHORT_WINDOW = opts.shortWindow || 150;   // recent window
    this.MIN_SAMPLES = opts.minSamples || 100;

    this.sensors = {};
    this.initSensor('hr');
    this.initSensor('spo2');
    this.initSensor('temp');
    this.initSensor('accel');
  }

  initSensor(name) {
    this.sensors[name] = {
      // Circular buffer: fixed size, reuse array
      buffer: new Array(this.LONG_WINDOW),
      bufferIdx: 0,      // write position in circular buffer
      bufferSize: 0,     // actual number of samples (grows to LONG_WINDOW)
      
      // Cached statistics (updated incrementally)
      longMean: 0,
      longVar: 0,
      shortMean: 0,
      shortVar: 0,
      trend: 0,
      anomalyScore: 0,
      
      // Counters for incremental calculation
      sum: 0,            // sum of all samples in buffer
      sumSq: 0,          // sum of squares
    };
  }

  // Add a sample to the circular buffer (O(1) operation)
  addSample(sensorName, value) {
    if (!(sensorName in this.sensors)) return;

    const state = this.sensors[sensorName];
    const v = Number(value) || 0;

    // If buffer is full, subtract the old value before overwriting
    if (state.bufferSize === this.LONG_WINDOW) {
      const oldVal = state.buffer[state.bufferIdx];
      state.sum -= oldVal;
      state.sumSq -= oldVal * oldVal;
    } else {
      state.bufferSize++;
    }

    // Write new sample at current position
    state.buffer[state.bufferIdx] = v;
    state.sum += v;
    state.sumSq += v * v;

    // Move write position (circular)
    state.bufferIdx = (state.bufferIdx + 1) % this.LONG_WINDOW;

    // Update statistics (lazy: only when needed)
    this._updateStats(sensorName);
  }

  // Compute statistics from cached sums (O(1) after add)
  _updateStats(sensorName) {
    const state = this.sensors[sensorName];

    if (state.bufferSize < this.MIN_SAMPLES) {
      state.anomalyScore = 0;
      return;
    }

    // Long-term baseline: entire buffer
    const n = state.bufferSize;
    state.longMean = state.sum / n;
    const variance = (state.sumSq / n) - (state.longMean * state.longMean);
    state.longVar = Math.max(0, variance); // avoid numerical negatives

    // Short-term window: last SHORT_WINDOW samples (from circular buffer)
    const shortStart = Math.max(0, state.bufferSize - this.SHORT_WINDOW);
    const shortArr = this._getCircularSlice(state, shortStart, state.bufferSize);
    
    if (shortArr.length > 0) {
      const shortStats = this._quickStats(shortArr);
      state.shortMean = shortStats.mean;
      state.shortVar = shortStats.variance;
    } else {
      state.shortMean = state.longMean;
      state.shortVar = state.longVar;
    }

    // Trend and anomaly score
    const longStd = Math.sqrt(Math.max(state.longVar, 1e-6));
    state.trend = (state.shortMean - state.longMean) / longStd;

    const meanShift = Math.tanh(Math.abs(state.trend));
    const shortStd = Math.sqrt(Math.max(state.shortVar, 1e-6));
    const varianceSurge = Math.tanh(Math.max(0, shortStd / longStd - 1));

    state.anomalyScore = Math.max(0, Math.min(1, 0.6 * meanShift + 0.4 * varianceSurge));
  }

  // Extract a slice from circular buffer without copying entire array
  _getCircularSlice(state, start, end) {
    const result = [];
    const len = end - start;
    if (len <= 0) return result;

    for (let i = 0; i < len; i++) {
      const idx = (state.bufferIdx - state.bufferSize + start + i) % this.LONG_WINDOW;
      if (idx < 0) {
        // Handle negative modulo in JS
        result.push(state.buffer[idx + this.LONG_WINDOW]);
      } else {
        result.push(state.buffer[idx]);
      }
    }
    return result;
  }

  // Quick stats for short window (small array, safe to compute)
  _quickStats(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return { mean: 0, variance: 0 };
    }

    let sum = 0, sumSq = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      sumSq += arr[i] * arr[i];
    }

    const mean = sum / arr.length;
    const variance = Math.max(0, (sumSq / arr.length) - (mean * mean));

    return { mean, variance };
  }

  // Compute combined delirium risk from all sensors
  computeRisk() {
    const scores = {
      hr: this.sensors.hr.anomalyScore,
      spo2: this.sensors.spo2.anomalyScore,
      temp: this.sensors.temp.anomalyScore,
      accel: this.sensors.accel.anomalyScore,
    };

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

  // Reset state (e.g., on patient change or mode switch)
  reset() {
    this.initSensor('hr');
    this.initSensor('spo2');
    this.initSensor('temp');
    this.initSensor('accel');
  }
}
