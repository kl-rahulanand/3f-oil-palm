export interface SmalltalkInfo {
  title: string;
  definitionKind: "meta";
  definition: string;
  suggestedQuestions: string[];
}

const SUGGESTIONS = ["Show an available metric", "Break a metric down by a dimension"];
const GREETINGS = new Set([
  "hi",
  "hello",
  "hey",
  "yo",
  "hiya",
  "hi there",
  "hello there",
  "good morning",
  "good afternoon",
  "good evening",
  "namaste",
]);
const THANKS = new Set([
  "thanks",
  "thank you",
  "thanks!",
  "thankyou",
  "ty",
  "thx",
  "cheers",
  "great",
  "nice",
  "cool",
  "ok",
  "okay",
  "got it",
  "perfect",
  "sounds good",
]);
const CAPABILITY = new Set([
  "who are you",
  "what are you",
  "what can you do",
  "what do you do",
  "what can i ask",
  "what can i ask you",
  "how do you work",
  "help",
  "what is this",
  "what do you know",
  "what can you help with",
]);

function normalize(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/[!?.\s]+$/g, "")
    .replace(/\s+/g, " ");
}

export function classifySmalltalk(question: string): SmalltalkInfo | null {
  const q = normalize(question);
  if (!q) return null;
  const isGreeting =
    GREETINGS.has(q) || THANKS.has(q) || (/^(hi|hello|hey)(?:$|\s)/.test(q) && q.split(" ").length <= 3);
  const isCapability = CAPABILITY.has(q);
  if (!isGreeting && !isCapability) return null;
  const definition = isCapability
    ? "I answer questions using the metrics and dimensions configured for your access. Try one of these:"
    : "Hi! I'm 3F — I answer questions about your configured data domains. Try one of these:";
  return {
    title: isCapability ? "What you can ask" : "Hello",
    definitionKind: "meta",
    definition,
    suggestedQuestions: SUGGESTIONS,
  };
}
