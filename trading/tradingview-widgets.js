const TV_PREVIEWS = [
  { name: "Nasdaq 100", symbol: "ACTIVTRADES:USATEC" },
  { name: "DAX 40", symbol: "ACTIVTRADES:GER40" },
  { name: "S&P 500", symbol: "ACTIVTRADES:US500" },
  { name: "Gold", symbol: "ACTIVTRADES:GOLD" },
  { name: "Silver", symbol: "ACTIVTRADES:SILVER" },
  { name: "Petrolio WTI", symbol: "ACTIVTRADES:WTI" },
  { name: "EUR/USD", symbol: "ACTIVTRADES:EURUSD" },
  { name: "USD/JPY", symbol: "ACTIVTRADES:USDJPY" }
];

function addTradingViewPreview(parent, item) {
  const card = document.createElement('article');
  card.className = 'tv-preview-card';
  card.innerHTML = `<div class="tv-preview-head"><strong>${item.name}</strong><span>${item.symbol}</span></div><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div>`;
  parent.appendChild(card);
  const widget = card.querySelector('.tradingview-widget-container');
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.text = JSON.stringify({
    autosize: true,
    symbol: item.symbol,
    interval: '60',
    timezone: 'Europe/Rome',
    theme: 'dark',
    style: '1',
    locale: 'it',
    hide_side_toolbar: true,
    allow_symbol_change: false,
    save_image: false,
    calendar: false,
    withdateranges: false,
    support_host: 'https://www.tradingview.com'
  });
  widget.appendChild(script);
}

function initTradingViewPreviews() {
  const grid = document.getElementById('tradingviewPreviewGrid');
  if (!grid || grid.dataset.loaded) return;
  grid.dataset.loaded = '1';
  TV_PREVIEWS.forEach(item => addTradingViewPreview(grid, item));
}

document.addEventListener('DOMContentLoaded', initTradingViewPreviews);
