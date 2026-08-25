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
    toleranceAtr: 0.50
  },
  structure: {
    minimumTouches: 2,
    orderBlockImpulseAtr: 1.6,
    fairValueGapMinimumAtr: 0.12,
    confluenceToleranceAtr: 0.65
  },
  weights: {
    timeframeTrend: {
      "1M": 3,
      "1W": 7,
      "1D": 20,
      "4H": 40,
      "1H": 30
    },
    movingAverages: 25,
    supportResistance: 15,
    classicalPatterns: 10,
    momentum: 20,
    nadaraya: 10,
    retracementEntry: 20
  },
  thresholds: {
    long: 25,
    short: -25,
    waitBand: 15
  }
};