from __future__ import annotations

# Bootstrap del generatore Market Compass: recupera la versione completa e
# stabile del pipeline e applica solo modifiche mirate prima di eseguirla.
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

# Investment Coach: restiamo trend-following, ma vogliamo trend sani e progressivi.
# Una salita parabolica/esplosiva non deve essere premiata come un normale trend forte:
# aumenta il rischio che il successivo -15/-20% sia solo l'inizio del riassorbimento.
old_preliminary = '''            preliminary = trend_score * 0.58 + entry_score * 0.42
            if monthly_trend == "Ribassista" or weekly_trend == "Ribassista":
                preliminary -= 2
'''
new_preliminary = '''            # Qualità del trend: premia salite progressive e penalizza accelerazioni paraboliche.
            # Misuriamo l'estensione dalla EMA200 e il massimo balzo su 21 sedute negli ultimi 6 mesi.
            # Le soglie sono volutamente conservative per un orizzonte di investimento 2-4 mesi.
            rolling_21 = close.pct_change(21).tail(126) * 100
            max_21d_surge = float(rolling_21.max()) if not rolling_21.empty else 0.0
            extension_ema200 = (price / ema200 - 1) * 100 if ema200 else 0.0
            return6m = (price / float(close.iloc[-126]) - 1) * 100 if len(close) >= 126 else return3m
            explosive = bool(max_21d_surge > 25 or extension_ema200 > 45 or return6m > 55)

            # 10/10 = salita regolare; il punteggio scende con eccessi di pendenza/estensione.
            trend_health = 10.0
            trend_health -= max(0.0, max_21d_surge - 15) * 0.18
            trend_health -= max(0.0, extension_ema200 - 25) * 0.10
            trend_health -= max(0.0, return6m - 35) * 0.08
            trend_health = max(0.0, min(10.0, trend_health))

            preliminary = trend_score * 0.46 + entry_score * 0.34 + trend_health * 0.20
            if monthly_trend == "Ribassista" or weekly_trend == "Ribassista":
                preliminary -= 2
            if explosive:
                preliminary -= 3.5
'''
if old_preliminary not in source:
    raise RuntimeError("Blocco preliminary Investing non riconosciuto")
source = source.replace(old_preliminary, new_preliminary, 1)

old_screen_fields = '''                "rsiDaily": rsi_daily, "return3m": return3m, "volatility": volatility,
                "ema200": ema200, "monthlyTrend": monthly_trend,
'''
new_screen_fields = '''                "rsiDaily": rsi_daily, "return3m": return3m, "return6m": return6m,
                "volatility": volatility, "trendHealthScore": trend_health,
                "max21dSurgePct": max_21d_surge, "extensionEma200Pct": extension_ema200,
                "explosiveTrend": explosive,
                "ema200": ema200, "monthlyTrend": monthly_trend,
'''
if old_screen_fields not in source:
    raise RuntimeError("Campi screening Investing non riconosciuti")
source = source.replace(old_screen_fields, new_screen_fields, 1)

# Un trend esplosivo non può diventare GREEN anche se rientra nella percentuale di ritracciamento.
old_green = '''        quality_score >= 6.5 and base["trendScore"] >= 6 and
        base["requiredPullbackMin"] <= base["pullbackPct"] <= base["requiredPullbackMax"] and
'''
new_green = '''        quality_score >= 6.5 and base["trendScore"] >= 6 and
        not base.get("explosiveTrend", False) and base.get("trendHealthScore", 10) >= 6.5 and
        base["requiredPullbackMin"] <= base["pullbackPct"] <= base["requiredPullbackMax"] and
'''
if old_green not in source:
    raise RuntimeError("Regola GREEN Investing non riconosciuta")
source = source.replace(old_green, new_green, 1)

old_conditions = '''    if quality_score < 6.5:
        conditions.append("Conferma dei fondamentali.")
'''
new_conditions = '''    if quality_score < 6.5:
        conditions.append("Conferma dei fondamentali.")
    if base.get("explosiveTrend", False):
        conditions.append("Attendere riassorbimento dell'accelerazione: salita recente troppo esplosiva per un ingresso trend-following sano.")
    elif base.get("trendHealthScore", 10) < 6.5:
        conditions.append("Attendere una struttura di salita più regolare e meno estesa.")
'''
if old_conditions not in source:
    raise RuntimeError("Condizioni Investing non riconosciute")
source = source.replace(old_conditions, new_conditions, 1)

old_return_scores = '''        "qualityScore": quality_score, "trendScore": base["trendScore"],
        "entryScore": base["entryScore"], "newsScore": news_score,
'''
new_return_scores = '''        "qualityScore": quality_score, "trendScore": base["trendScore"],
        "trendHealthScore": base.get("trendHealthScore", 10),
        "explosiveTrend": bool(base.get("explosiveTrend", False)),
        "max21dSurgePct": base.get("max21dSurgePct"),
        "extensionEma200Pct": base.get("extensionEma200Pct"),
        "return6mPct": base.get("return6m"),
        "entryScore": base["entryScore"], "newsScore": news_score,
'''
if old_return_scores not in source:
    raise RuntimeError("Output punteggi Investing non riconosciuto")
source = source.replace(old_return_scores, new_return_scores, 1)

old_selection_reason = '''            "La selezione combina qualità fondamentale, trend di medio periodo, ritracciamento, "
            "notizie e persistenza storica. Piccole variazioni giornaliere non bastano a cambiare la Top 5."
'''
new_selection_reason = '''            "La selezione combina qualità fondamentale, trend di medio periodo, SALUBRITÀ DEL TREND, "
            "ritracciamento, notizie e persistenza storica. Le salite paraboliche/esplosive sono escluse dalla Top 5: "
            "preferiamo trend rialzisti progressivi, con ritracciamenti ordinati."
'''
if old_selection_reason not in source:
    raise RuntimeError("Testo selezione Investing non riconosciuto")
source = source.replace(old_selection_reason, new_selection_reason, 1)

# Manteniamo integralmente la logica di persistenza/entrata/uscita della Top 5.
# L'unica nuova rottura strutturale è un trend diventato esplosivo: in quel caso il titolo
# non è più coerente con la strategia e può uscire senza aspettare il normale decadimento.
old_structural = '''        structural_break = (
            item["stableScore"] < STRUCTURAL_EXIT_SCORE or
            item["technical"]["weekly"] == "Ribassista" or
            item["qualityScore"] < 5.2 or
            item["newsScore"] <= 2
        )
'''
new_structural = '''        structural_break = (
            item["stableScore"] < STRUCTURAL_EXIT_SCORE or
            item["technical"]["weekly"] == "Ribassista" or
            item["qualityScore"] < 5.2 or
            item["newsScore"] <= 2 or
            item.get("explosiveTrend", False)
        )
'''
if old_structural not in source:
    raise RuntimeError("Blocco uscita strutturale Investing non riconosciuto")
source = source.replace(old_structural, new_structural, 1)

# I titoli esplosivi non vengono neppure usati come challenger: non vogliamo osservarli
# nella Top 5 in attesa di un ritracciamento potenzialmente molto più profondo.
old_challengers = '''    challengers = [x for x in sorted_all if x["ticker"] not in {r["ticker"] for r in retained}]
'''
new_challengers = '''    challengers = [
        x for x in sorted_all
        if x["ticker"] not in {r["ticker"] for r in retained}
        and not x.get("explosiveTrend", False)
        and x.get("trendHealthScore", 10) >= 6.5
    ]
'''
if old_challengers not in source:
    raise RuntimeError("Blocco challenger Investing non riconosciuto")
source = source.replace(old_challengers, new_challengers, 1)

old_outsiders = '''    outsiders = [x for x in sorted_all if x["ticker"] not in {r["ticker"] for r in final_top}]
'''
new_outsiders = '''    outsiders = [
        x for x in sorted_all
        if x["ticker"] not in {r["ticker"] for r in final_top}
        and not x.get("explosiveTrend", False)
        and x.get("trendHealthScore", 10) >= 6.5
    ]
'''
if old_outsiders not in source:
    raise RuntimeError("Blocco outsider Investing non riconosciuto")
source = source.replace(old_outsiders, new_outsiders, 1)

compiled = compile(source, BASE_URL, "exec")
exec(compiled, {"__name__": "__main__", "__file__": __file__})