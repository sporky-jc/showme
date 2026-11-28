// A model's id, as the review line saved it, in words a teacher can read
// ("gemma4:e4b" → "Gemma 4 E4B"). The ids come from the server (the
// answers each model gave), never from here: an id this doesn't know is
// shown as it is, so a new model never breaks the page.

const size = (s?: string) => (s ? ` ${s.toUpperCase()}` : "");

const NAMES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^llama-guard(\d+(?:\.\d+)?)(?::([\w.]+))?$/i, (m) => `Llama Guard ${m[1]}${size(m[2])}`],
  [/^gemma(\d+(?:\.\d+)?)(?::([\w.]+))?$/i, (m) => `Gemma ${m[1]}${size(m[2])}`],
  [/^qwen(\d+(?:\.\d+)?)(?::([\w.]+))?$/i, (m) => `Qwen ${m[1]}${size(m[2])}`],
  // Workers AI's: "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
  [/^@cf\/[\w-]+\/llama-(\d+(?:\.\d+)?)-(\d+b)\b/i, (m) => `Llama ${m[1]}${size(m[2])}`],
];

export const modelName = (id: string) => {
  for (const [pattern, name] of NAMES) {
    const match = id.match(pattern);
    if (match) return name(match);
  }
  return id;
};
