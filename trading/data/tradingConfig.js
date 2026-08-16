window.TRADING_CONFIG = {
  timeframes: ["1M", "1W", "1D", "4H", "1H"],
  movingAverages: [200, 60, 50, 10, 5],
  indicators: {
    rsiPeriod: 14,
    stochasticPeriod: 14,
    stochasticSmoothK: 3,
    stochasticSmoothD: 3,
    atrPeriod: 14,
    nadarayaBandwidth: 8
  },
  entry: {
    retracementPercent: 50,
    toleranceAtr: 0.35
  },
  structure: {
    minimumTouches: 2,
    orderBlockImpulseAtr: 1.6,
    fairValueGapMinimumAtr: 0.12,
    confluenceToleranceAtr: 0.55
  },
  weights: {
    timeframeTrend: {
      "1M": 10,
      "1W": 15,
      "1D": 30,
      "4H": 25,
      "1H": 20
    },
    movingAverages: 25,
    supportResistance: 15,
    classicalPatterns: 15,
    momentum: 15,
    nadaraya: 10,
    retracementEntry: 20
  },
  thresholds: {
    long: 30,
    short: -30,
    waitBand: 18
  }
};
