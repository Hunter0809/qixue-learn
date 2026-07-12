"use client";

import { useEffect, useState } from "react";
import { motivationalQuotes } from "@/lib/motivational-quotes";

const STORAGE_KEY = "shownQuoteIds";

function getShownIds(): number[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveShownIds(ids: number[]): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function MotivationalQuote() {
  const [quote, setQuote] = useState<typeof motivationalQuotes[number] | null>(null);

  useEffect(() => {
    const shownIds = getShownIds();
    const pool = motivationalQuotes
      .map((q, i) => ({ ...q, id: i }))
      .filter((q) => !shownIds.includes(q.id));

    if (pool.length === 0) {
      const idx = Math.floor(Math.random() * motivationalQuotes.length);
      setQuote(motivationalQuotes[idx]);
      saveShownIds([idx]);
      return;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    setQuote(pick);
    saveShownIds([...shownIds, pick.id]);
  }, []);

  if (!quote) return null;

  return (
    <div className="motivational-quote">
      <p>“{quote.content}”</p>
      <p className="quote-author">
        ——{quote.author}《{quote.source}》
      </p>
    </div>
  );
}