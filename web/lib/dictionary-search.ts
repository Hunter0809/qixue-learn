import fs from "node:fs";
import path from "node:path";

export type DictionaryEntry = {
  word: string;
  phonetic: string;
  definition: string;
  translation: string;
  collins?: string;
  oxford?: string;
  tag?: string;
  exchange?: string;
};

const DICTIONARY_PATH = path.join(process.cwd(), "public", "dictionaries", "ecdict.csv");

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      value += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

export function searchDictionary(raw: string, limit = 8): DictionaryEntry[] {
  const query = raw.trim().split(/\s+/)[0]?.replace(/[^A-Za-z'-]/g, "").toLowerCase();
  if (!query || !fs.existsSync(DICTIONARY_PATH)) return [];

  const lines = fs.readFileSync(DICTIONARY_PATH, "utf8").split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const indexes = Object.fromEntries(header.map((name, index) => [name, index]));
  const exact: DictionaryEntry[] = [];
  const prefix: DictionaryEntry[] = [];

  for (const line of lines.slice(1)) {
    if (!line) continue;
    const fields = parseCsvLine(line);
    const word = fields[indexes.word]?.toLowerCase();
    if (!word) continue;
    if (word === query || word.startsWith(query)) {
      const entry = {
        word: fields[indexes.word] || "",
        phonetic: fields[indexes.phonetic] || "",
        definition: fields[indexes.definition] || "",
        translation: fields[indexes.translation] || "",
        collins: fields[indexes.collins],
        oxford: fields[indexes.oxford],
        tag: fields[indexes.tag],
        exchange: fields[indexes.exchange]
      };
      if (word === query) exact.push(entry);
      else prefix.push(entry);
      if (exact.length + prefix.length >= limit * 2) break;
    }
  }

  return [...exact, ...prefix].slice(0, limit);
}
