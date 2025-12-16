const parseAIJSON = (raw) => {
  if (!raw) return null;

  // convert object to string if needed
  let txt = typeof raw === "string" ? raw : JSON.stringify(raw);

  // remove ```json or ``` wrappers
  txt = txt.replace(/```json/gi, "").replace(/```/g, "").trim();

  // AI sometimes returns escaped JSON (string inside a string)
  // fix: parse twice if needed
  try {
    return JSON.parse(txt);
  } catch (e1) {
    try {
      return JSON.parse(JSON.parse(txt));
    } catch (e2) {
      console.error("PARSE FAILED:", e2.message);
      return null;
    }
  }
};

export { 
    parseAIJSON
}