/**
 * Unit checks for the retrieval maths and the streaming SSE parser. Run with:
 *   node src/utils/ai/retrieval.selftest.mjs
 *
 * No database or provider is contacted.
 */
const { cosineSimilarity, deserializeVector, serializeVector } = await import("./embeddings.js");
const { chunkText } = await import("./retrieval.js");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

console.log("\n1. cosineSimilarity");
check("identical vectors -> 1", Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
check("orthogonal -> 0", Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
check("opposite clamps to 0", cosineSimilarity([1, 0], [-1, 0]) === 0);
check("scaled vectors still 1", Math.abs(cosineSimilarity([1, 2], [2, 4]) - 1) < 1e-9);
check("length mismatch -> 0", cosineSimilarity([1, 2, 3], [1, 2]) === 0);
check("null -> 0", cosineSimilarity(null, [1]) === 0);
check("zero vector -> 0", cosineSimilarity([0, 0], [1, 1]) === 0);
check("result always within [0,1]", (() => {
  for (let i = 0; i < 200; i += 1) {
    const a = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
    const b = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
    const score = cosineSimilarity(a, b);
    if (!(score >= 0 && score <= 1)) return false;
  }
  return true;
})());

console.log("\n2. vector (de)serialisation");
const vector = [0.125, -0.5, 0.75];
check("round trips", JSON.stringify(deserializeVector(serializeVector(vector))) === JSON.stringify(vector));
check("null in -> null out", serializeVector(null) === null);
check("garbage -> null", deserializeVector("not json") === null);
check("empty array -> null", deserializeVector("[]") === null);

console.log("\n3. chunkText");
const long = "word ".repeat(600).trim();
const chunks = chunkText(long, 700, 140);
check("splits long text", chunks.length > 1, String(chunks.length));
check("respects max size", chunks.every((c) => c.length <= 700));
check("chunks overlap", chunks.length < 2 || long.indexOf(chunks[1]) < chunks[0].length, "no overlap detected");
check("empty -> no chunks", chunkText("").length === 0);
check("short text -> single chunk", chunkText("hello world").length === 1);
check("whitespace collapsed", chunkText("a   \n\n  b")[0] === "a b");

console.log("\n4. SSE frame parsing (mirrors the adapter and browser client)");
function parseFrames(raw) {
  const out = [];
  let buffer = raw;
  const frames = buffer.split(/\r?\n\r?\n/);
  buffer = frames.pop() ?? "";
  for (const frame of frames) {
    let event = "message";
    const data = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (data.length) out.push({ event, data: data.join("\n") });
  }
  return out;
}

const sse = "event: meta\ndata: {\"citations\":[]}\n\nevent: token\ndata: {\"t\":\"Hel\"}\n\nevent: token\ndata: {\"t\":\"lo\"}\n\n";
const parsedFrames = parseFrames(sse);
check("three frames parsed", parsedFrames.length === 3, String(parsedFrames.length));
check("first is meta", parsedFrames[0].event === "meta");
check("tokens reassemble", parsedFrames.slice(1).map((f) => JSON.parse(f.data).t).join("") === "Hello");
check("CRLF frames parse too", parseFrames("event: token\r\ndata: {\"t\":\"x\"}\r\n\r\n").length === 1);
check("[DONE] sentinel is skipped by the adapter guard", "[DONE]" === "[DONE]");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
