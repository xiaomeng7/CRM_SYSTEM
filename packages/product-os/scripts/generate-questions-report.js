#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  GENERATED_DIR,
  ensureDir,
  loadDefinitions
} = require("./lib/product-definition-utils");
const { scanMarkers } = require("./lib/definition-markers");

function priorityFromKeywords(keywords) {
  if (keywords.includes("MISSING") || keywords.includes("UNKNOWN")) return "Critical";
  if (keywords.includes("QUESTION")) return "Important";
  return "Important";
}

function codePrefix(productCode) {
  return (productCode || "PRD").replace(/[^A-Z0-9]/g, "").slice(0, 3) || "PRD";
}

function buildQuestions(definition) {
  const product = definition.data.product || {};
  const prefix = codePrefix(product.code);
  const markers = scanMarkers(definition.data);
  return markers.map((marker, index) => ({
    productName: product.name || definition.fileName,
    productCode: product.code || null,
    questionId: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    priority: priorityFromKeywords(marker.keywords),
    jsonPath: marker.path,
    question: "Need Product Owner confirmation.",
    current: marker.value
  }));
}

function generateQuestionsReport() {
  const definitions = loadDefinitions();
  const allQuestions = definitions.flatMap(buildQuestions);
  ensureDir(GENERATED_DIR);
  const outputPath = path.join(GENERATED_DIR, "questions-report.md");

  const lines = [];
  lines.push("# Product Questions Report");
  lines.push("");
  lines.push(`Generated At: ${new Date().toISOString()}`);
  lines.push("");

  if (allQuestions.length === 0) {
    lines.push("Product Ready For Release");
  } else {
    for (const q of allQuestions) {
      lines.push("----------------------------------------------------");
      lines.push("");
      lines.push("Product");
      lines.push(q.productName);
      lines.push("");
      lines.push("Question ID");
      lines.push(q.questionId);
      lines.push("");
      lines.push("Priority");
      lines.push(q.priority);
      lines.push("");
      lines.push("JSON Path");
      lines.push(q.jsonPath);
      lines.push("");
      lines.push("Question");
      lines.push(q.question);
      lines.push("");
      lines.push("Current");
      lines.push(q.current);
      lines.push("");
    }
  }

  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  return { outputPath, questionCount: allQuestions.length, questions: allQuestions };
}

function main() {
  const { outputPath, questionCount } = generateQuestionsReport();
  console.log("=== Product Questions Report ===");
  console.log(`Questions: ${questionCount}`);
  console.log(`Report: ${path.relative(process.cwd(), outputPath)}`);
  if (questionCount === 0) {
    console.log("Product Ready For Release");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateQuestionsReport
};
