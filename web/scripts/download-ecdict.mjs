import fs from "node:fs";
import { pipeline } from "node:stream/promises";

const url = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";
const targetDir = new URL("../public/dictionaries/", import.meta.url);
const target = new URL("ecdict.csv", targetDir);

fs.mkdirSync(targetDir, { recursive: true });

const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Failed to download ECDICT: ${response.status} ${response.statusText}`);
}

await pipeline(response.body, fs.createWriteStream(target));
console.log(`Downloaded ${url} -> ${target.pathname}`);
