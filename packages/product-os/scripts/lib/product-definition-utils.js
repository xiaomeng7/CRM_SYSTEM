const fs = require("fs");
const path = require("path");

const DEFINITIONS_DIR = path.resolve(__dirname, "../../definitions");
const GENERATED_DIR = path.resolve(__dirname, "../../prisma/generated");
const REQUIRED_TOP_LEVEL_KEYS = [
  "product",
  "hero",
  "subtitle",
  "story",
  "experiences",
  "capabilities",
  "bom",
  "labour",
  "pricing",
  "content",
  "automation",
  "icons",
  "theme",
  "layout",
  "images",
  "rules",
  "notes"
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getDefinitionFiles() {
  if (!fs.existsSync(DEFINITIONS_DIR)) return [];
  return fs
    .readdirSync(DEFINITIONS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(DEFINITIONS_DIR, name))
    .sort();
}

function loadDefinitions() {
  const files = getDefinitionFiles();
  return files.map((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    return {
      filePath,
      fileName: path.basename(filePath),
      data: JSON.parse(raw)
    };
  });
}

module.exports = {
  DEFINITIONS_DIR,
  GENERATED_DIR,
  REQUIRED_TOP_LEVEL_KEYS,
  ensureDir,
  loadDefinitions
};
