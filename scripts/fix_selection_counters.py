from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "market-data.json"
STATE = ROOT / "data" / "investment-selection-state.json"
CONFIRM_DAYS = 5
MAX_LEDGER_DAYS = 40


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def market_sessions(ticker: str) -> list[str]:
    """Restituisce le vere date di seduta disponibili per il ticker.

    Il contatore non dipende più dal numero di workflow né dai semplici giorni
    feriali: sabati, domeniche e festività di Borsa non possono incrementarlo.
    """
    try:
        hist = yf.Ticker(ticker).history(period="3mo", interval="1d", auto_adjust=True)
        if hist.empty:
            return []
        dates = []
        for idx in hist.index:
            try:
                dates.append(idx.date().isoformat())
            except Exception:
                pass
        return sorted(set(dates))[-MAX_LEDGER_DAYS:]
    except Exception:
        return []


def candidate_is_valid(c: dict) -> bool:
    """Un titolo in Top 5 accumula conferma finché non è escluso/rosso.

    rawStatus, quando presente, descrive la condizione tecnica originaria.
    status può invece essere stato trasformato in YELLOW/GREEN dal filtro
    temporale. Per questo rawStatus ha priorità, ma in sua assenza usiamo status.
    """
    raw = str(c.get("rawStatus") or c.get("status") or "RED").upper()
    return raw != "RED"


def trailing_true_days(ledger: dict[str, bool], sessions: list[str], latest: str) -> int:
    count = 0
    for day in reversed([d for d in sessions if d <= latest]):
        if ledger.get(day) is True:
            count += 1
        else:
            break
    return count


def seed_confirmation_history(
    ledger: dict[str, bool],
    sessions: list[str],
    selection_days: int,
    valid_now: bool,
) -> None:
    """Migrazione una tantum dal vecchio contatore al nuovo storico per data.

    Evita che titoli già presenti da giorni ripartano artificialmente da 0/5.
    Il seed viene fatto solo se non esiste ancora alcuno storico per il ticker.
    """
    if ledger or not valid_now or not sessions:
        return
    n = max(1, min(int(selection_days or 1), CONFIRM_DAYS, len(sessions)))
    for day in sessions[-n:]:
        ledger[day] = True


def main() -> int:
    root = load(DATA, {})
    state = load(STATE, {})
    inv = root.get("investment") or {}
    candidates = inv.get("candidates") or []
    if not candidates:
        return 0

    # Due registri separati e persistenti:
    # 1) presenza effettiva nella Top 5 per ogni seduta;
    # 2) validità della candidatura per ogni seduta.
    tenure_ledger = state.setdefault("selectionSessionHistory", {})
    confirmation_ledger = state.setdefault("confirmationSessionHistory", {})
    previous_active = set(state.get("selectionCounterActive") or [])
    current_active = {str(c.get("ticker")) for c in candidates if c.get("ticker")}

    # Il vecchio selectionTenure rimane per compatibilità e come sorgente di
    # migrazione, ma da ora in poi viene DERIVATO dallo storico per data.
    legacy_tenure = state.setdefault("selectionTenure", {})

    for c in candidates:
        ticker = str(c.get("ticker") or "")
        if not ticker:
            continue

        sessions = market_sessions(ticker)
        if not sessions:
            # Fallback prudente: se Yahoo non risponde non inventiamo una nuova
            # seduta. Manteniamo i valori esistenti senza incrementare nulla.
            old_days = int((legacy_tenure.get(ticker) or {}).get("days", 1) or 1)
            memory = c.setdefault("memory", {})
            memory["consecutiveTop5Days"] = old_days
            memory["selectionDays"] = old_days
            continue

        latest = sessions[-1]

        # ---------- Permanenza Top 5 ----------
        tledger = tenure_ledger.setdefault(ticker, {})
        # Se è un vero nuovo ingresso/rientro, il nuovo ciclo parte dalla seduta
        # corrente. Se era già attivo, aggiungiamo semplicemente la data corrente.
        if ticker not in previous_active:
            tledger = {latest: True}
            tenure_ledger[ticker] = tledger
        else:
            tledger[latest] = True

        # Teniamo solo date reali di seduta recenti, evitando crescita infinita.
        allowed = set(sessions)
        tledger = {d: bool(v) for d, v in tledger.items() if d in allowed}
        tenure_ledger[ticker] = tledger

        # La permanenza consecutiva si ricava dalle righe dello storico, non si
        # incrementa più una variabile. Per migrare lo storico già noto usiamo il
        # vecchio numero solo la prima volta.
        legacy_days = int((legacy_tenure.get(ticker) or {}).get("days", 1) or 1)
        if len(tledger) <= 1 and ticker in previous_active and legacy_days > 1:
            for day in sessions[-min(legacy_days, len(sessions)):]:
                tledger[day] = True

        selection_days = trailing_true_days(tledger, sessions, latest)
        selection_days = max(1, selection_days)
        selected_dates = sorted(d for d, v in tledger.items() if v and d <= latest)
        first_date = selected_dates[-selection_days] if len(selected_dates) >= selection_days else latest

        memory = c.setdefault("memory", {})
        memory["consecutiveTop5Days"] = selection_days
        memory["selectionDays"] = selection_days
        memory["selectionFirstDate"] = first_date
        memory["selectionLastDate"] = latest

        legacy_tenure[ticker] = {
            "firstDate": first_date,
            "lastDate": latest,
            "days": selection_days,
            "source": "market-session-history",
        }

        # ---------- Conferma 0/5 -> 5/5 ----------
        valid_now = candidate_is_valid(c)
        cledger = confirmation_ledger.setdefault(ticker, {})
        seed_confirmation_history(cledger, sessions, selection_days, valid_now)

        # Una sola osservazione per data di mercato. Dieci workflow nella stessa
        # giornata scrivono sempre la stessa chiave e non cambiano il conteggio.
        cledger[latest] = valid_now
        cledger = {d: bool(v) for d, v in cledger.items() if d in allowed}
        confirmation_ledger[ticker] = cledger

        confirm_days = trailing_true_days(cledger, sessions, latest)
        confirmed = confirm_days >= CONFIRM_DAYS
        shown_days = min(confirm_days, CONFIRM_DAYS)

        c["confirmation"] = {
            "days": shown_days,
            "requiredDays": CONFIRM_DAYS,
            "confirmed": confirmed,
            "marketDate": latest,
            "source": "market-session-history",
            "label": (
                "ACQUISTO CONFERMATO"
                if confirmed
                else f"IN CONFERMA {shown_days}/{CONFIRM_DAYS} GIORNI"
            ),
        }

        # Il rosso resta rosso. Un titolo valido ma non ancora persistente resta
        # giallo; dopo 5 vere sedute valide diventa verde definitivo.
        if not valid_now:
            c["status"] = "RED"
        elif confirmed:
            c["status"] = "GREEN"
        else:
            c["status"] = "YELLOW"

    state["selectionCounterActive"] = sorted(current_active)
    state["selectionSessionHistory"] = tenure_ledger
    state["confirmationSessionHistory"] = confirmation_ledger
    state["selectionTenure"] = legacy_tenure

    inv.setdefault("rules", {})["entryConfirmationDays"] = CONFIRM_DAYS
    inv["confirmedGreenCount"] = sum(
        1 for c in candidates if (c.get("confirmation") or {}).get("confirmed")
    )
    inv["confirmationCounterMode"] = "market-session-history"
    inv["confirmationCounterNote"] = (
        "I giorni sono ricavati dalle vere date di seduta del titolo. "
        "Aggiornamenti multipli, weekend e festività non incrementano il conteggio."
    )

    save(STATE, state)
    save(DATA, root)
    print(
        "Contatori Investing ricalcolati da storico sedute: "
        + ", ".join(
            f"{c.get('ticker')} {int((c.get('confirmation') or {}).get('days', 0))}/{CONFIRM_DAYS}"
            for c in candidates
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
