from __future__ import annotations

# Bootstrap del generatore Market Compass: recupera la versione completa e
# stabile del pipeline e amplia solo l'universo Trading Coach prima di eseguirla.
# In questo modo manteniamo invariata tutta la logica Investing/News già testata.
from urllib.request import urlopen

BASE_COMMIT = "99eed98156974094cc406d257910856876dd2974"
BASE_URL = f"https://raw.githubusercontent.com/cristall73/market-compass/{BASE_COMMIT}/scripts/update_market_data.py"

with urlopen(BASE_URL, timeout=30) as response:
    source = response.read().decode("utf-8")

old_assets = '''TRADING_ASSETS = [
    {"name": "Nasdaq 100", "symbol": "USATEC", "yahoo": "^NDX"},
    {"name": "DAX 40", "symbol": "GER40", "yahoo": "^GDAXI"},
    {"name": "S&P 500", "symbol": "US500", "yahoo": "^GSPC"},
    {"name": "Gold", "symbol": "XAUUSD", "yahoo": "GC=F"},
    {"name": "Silver", "symbol": "XAGUSD", "yahoo": "SI=F"},
    {"name": "Petrolio WTI", "symbol": "WTI", "yahoo": "CL=F"},
    {"name": "EUR/USD", "symbol": "EURUSD", "yahoo": "EURUSD=X"},
    {"name": "USD/JPY", "symbol": "USDJPY", "yahoo": "JPY=X"},
]'''

new_assets = '''TRADING_ASSETS = [
    {"name": "Nasdaq 100", "symbol": "USATEC", "yahoo": "^NDX"},
    {"name": "DAX 40", "symbol": "GER40", "yahoo": "^GDAXI"},
    {"name": "S&P 500", "symbol": "US500", "yahoo": "^GSPC"},
    {"name": "FTSE 100", "symbol": "UK100", "yahoo": "^FTSE"},
    {"name": "IBEX 35", "symbol": "ESP35", "yahoo": "^IBEX"},
    {"name": "CAC 40", "symbol": "FRA40", "yahoo": "^FCHI"},
    {"name": "FTSE MIB", "symbol": "ITA40", "yahoo": "FTSEMIB.MI"},
    {"name": "China A50", "symbol": "CHINA50", "yahoo": "XIN9.FGI"},
    {"name": "Bovespa", "symbol": "BRA50", "yahoo": "^BVSP"},
    {"name": "Gold", "symbol": "XAUUSD", "yahoo": "GC=F"},
    {"name": "Silver", "symbol": "XAGUSD", "yahoo": "SI=F"},
    {"name": "Petrolio WTI", "symbol": "WTI", "yahoo": "CL=F"},
    {"name": "EUR/USD", "symbol": "EURUSD", "yahoo": "EURUSD=X"},
    {"name": "USD/JPY", "symbol": "USDJPY", "yahoo": "JPY=X"},
]'''

if old_assets not in source:
    raise RuntimeError("Blocco TRADING_ASSETS della base non riconosciuto: aggiornamento interrotto per sicurezza")

source = source.replace(old_assets, new_assets, 1)
compiled = compile(source, BASE_URL, "exec")
exec(compiled, {"__name__": "__main__", "__file__": __file__})
