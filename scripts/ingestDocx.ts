import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import mammoth from "mammoth";
import { Update, UpdatesData, UpdateCategory } from "../src/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "../public/data/updates.json");
const DATA_FILE_SOURCE = path.join(__dirname, "../data/updates.json");
const DOCX_FILE = path.join(__dirname, "../CSupdates.docx");

// Priority authors
const PRIORITY_AUTHORS = ["Jessica Booker", "Lindsay Burden", "Camryn Burden"];

// Update indicators
const UPDATE_INDICATORS = [
  "effective immediately",
  "going forward",
  "we no longer",
  "instead",
  "updated process",
  "new process",
  "new policy",
  "change",
  "update",
  "new error",
  "new fix",
  "steps",
  "rollout",
  "deprecation",
  "deprecated",
];

// Category keywords mapping
const CATEGORY_KEYWORDS: Record<UpdateCategory, string[]> = {
  Pharmacy: ["pharmacy", "medication", "prescription", "rx", "drug"],
  Billing: ["billing", "invoice", "payment", "charge", "cost", "fee"],
  Labs: ["lab", "laboratory", "test", "results", "specimen"],
  Operations: ["operation", "workflow", "process", "procedure", "sop"],
  "Internal Tools / Systems": ["tool", "system", "platform", "software", "app", "dashboard"],
  "Contractor / Staffing": ["contractor", "staffing", "staff", "hire", "onboard"],
  "Compliance / Clinical": ["compliance", "clinical", "regulation", "policy", "protocol"],
  Miscellaneous: [],
};

function detectCategory(text: string): UpdateCategory {
  const lowerText = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === "Miscellaneous") continue;
    if (keywords.some((keyword) => lowerText.includes(keyword))) {
      return category as UpdateCategory;
    }
  }
  return "Miscellaneous";
}

function isUpdate(text: string, author: string): boolean {
  const lowerText = text.toLowerCase();

  // Priority authors are always evaluated
  const isPriorityAuthor = PRIORITY_AUTHORS.some(
    (name) => author.toLowerCase().includes(name.toLowerCase())
  );

  // Check for update indicators
  const hasIndicator = UPDATE_INDICATORS.some((indicator) =>
    lowerText.includes(indicator)
  );

  // For priority authors, be more lenient
  if (isPriorityAuthor) {
    return (
      hasIndicator ||
      lowerText.includes("new") ||
      lowerText.includes("change") ||
      lowerText.includes("update") ||
      lowerText.includes("process") ||
      lowerText.includes("policy")
    );
  }

  // For others, require clear update language
  return (
    hasIndicator ||
    lowerText.includes("announcing") ||
    lowerText.includes("effective") ||
    lowerText.includes("going forward") ||
    lowerText.includes("new process") ||
    lowerText.includes("updated process")
  );
}

function extractAuthor(text: string): string {
  // Common Slack paste formats:
  // "Author Name [timestamp]" or "Author Name:" or "Author Name -"
  const patterns = [
    /^([A-Z][a-z]+ [A-Z][a-z]+)(?:\s*\[|\s*:|\s*-)/,
    /^([A-Z][a-z]+ [A-Z][a-z]+)\s/,
    /^([A-Z][a-z]+)\s/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return "Unknown";
}

function cleanSlackText(text: string): string {
  // Remove timestamps like [10:30 AM] or [Jan 28, 2026]
  let cleaned = text.replace(/\[\d{1,2}:\d{2}\s*(AM|PM)\]/gi, "");
  cleaned = cleaned.replace(/\[[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\]/g, "");
  // Remove reaction counts like :thumbsup: (5)
  cleaned = cleaned.replace(/:\w+:\s*\(\d+\)/g, "");
  // Remove thread indicators
  cleaned = cleaned.replace(/^Thread:/gi, "");
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function generateId(title: string, datePosted: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
  const dateSlug = datePosted.replace(/-/g, "");
  return `${dateSlug}-${slug}`;
}

function parseDateHeading(text: string): Date | null {
  // Try to parse dates like "January 28, 2026" or "Jan 28, 2026"
  const patterns = [
    /([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/,
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        // Month name format
        const monthNames = [
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ];
        const month = monthNames.indexOf(match[1].toLowerCase());
        if (month !== -1) {
          return new Date(
            parseInt(match[3]),
            month,
            parseInt(match[2])
          );
        }
      } else if (pattern === patterns[1]) {
        // MM/DD/YYYY
        return new Date(
          parseInt(match[3]),
          parseInt(match[1]) - 1,
          parseInt(match[2])
        );
      } else {
        // YYYY-MM-DD
        return new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3])
        );
      }
    }
  }
  return null;
}

function extractTitle(body: string): string {
  // Try to extract first sentence or first 60 chars
  const firstSentence = body.match(/^[^.!?]+[.!?]/);
  if (firstSentence) {
    return firstSentence[0].trim().substring(0, 80);
  }
  return body.substring(0, 80).trim() + (body.length > 80 ? "..." : "");
}

function detectSupersedes(
  text: string,
  existingUpdates: Update[]
): string[] {
  const lowerText = text.toLowerCase();
  const supersedesIds: string[] = [];

  // Look for phrases like "replaces", "supersedes", "instead of", "no longer"
  if (
    lowerText.includes("replaces") ||
    lowerText.includes("supersedes") ||
    lowerText.includes("instead of") ||
    lowerText.includes("no longer")
  ) {
    // Try to match against existing updates by title or category
    for (const update of existingUpdates) {
      if (update.status === "active") {
        const updateLower = (update.title + " " + update.body).toLowerCase();
        // Simple keyword matching - could be improved
        const words = updateLower.split(/\s+/);
        const matchingWords = words.filter((word) =>
          lowerText.includes(word) && word.length > 4
        );
        if (matchingWords.length >= 2) {
          supersedesIds.push(update.id);
        }
      }
    }
  }

  return supersedesIds;
}

async function ingestDocx(): Promise<void> {
  console.log("Reading DOCX file...");
  const result = await mammoth.extractRawText({ path: DOCX_FILE });
  const text = result.value;

  console.log("Loading existing updates...");
  let existingData: UpdatesData;
  // Check both locations (public for runtime, data for source)
  const sourceFile = fs.existsSync(DATA_FILE_SOURCE) ? DATA_FILE_SOURCE : DATA_FILE;
  if (fs.existsSync(sourceFile)) {
    const fileContent = fs.readFileSync(sourceFile, "utf-8");
    existingData = JSON.parse(fileContent);
  } else {
    existingData = { updates: [], lastIngestedDate: null };
  }

  const existingUpdates = existingData.updates;
  const existingDateStrings = new Set(
    existingUpdates.map((u) => u.datePosted)
  );

  // Split by date headings
  const lines = text.split(/\n/);
  const sections: { date: Date; content: string[] }[] = [];
  let currentDate: Date | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const date = parseDateHeading(trimmed);
    if (date) {
      // Save previous section
      if (currentDate) {
        sections.push({ date: currentDate, content: currentContent });
      }
      // Start new section
      currentDate = date;
      currentContent = [];
    } else if (currentDate) {
      currentContent.push(trimmed);
    }
  }

  // Save last section
  if (currentDate) {
    sections.push({ date: currentDate, content: currentContent });
  }

  console.log(`Found ${sections.length} date sections`);

  const newUpdates: Update[] = [];
  let lastProcessedDate: Date | null = null;

  for (const section of sections) {
    const dateStr = section.date.toISOString().split("T")[0];

    // Skip if already processed
    if (existingDateStrings.has(dateStr)) {
      console.log(`Skipping already processed date: ${dateStr}`);
      continue;
    }

    // Process messages in this section
    const messages = section.content.join("\n").split(/\n(?=[A-Z][a-z]+)/);
    // Also split by common message separators
    const allMessages: string[] = [];
    for (const msg of messages) {
      const split = msg.split(/(?:\n\n|\n(?=[A-Z][a-z]+ [A-Z][a-z]+))/);
      allMessages.push(...split);
    }

    for (const message of allMessages) {
      const cleaned = cleanSlackText(message);
      if (cleaned.length < 20) continue; // Skip very short messages

      const author = extractAuthor(cleaned);
      if (!isUpdate(cleaned, author)) {
        continue; // Skip non-updates
      }

      const category = detectCategory(cleaned);
      const title = extractTitle(cleaned);
      const body = cleaned.substring(0, 500); // First 500 chars as body
      const sourceExcerpt = cleaned.substring(0, 200); // First 200 chars as excerpt
      const id = generateId(title, dateStr);
      const supersedesIds = detectSupersedes(cleaned, existingUpdates);

      // Mark superseded updates
      for (const supersededId of supersedesIds) {
        const supersededUpdate = existingUpdates.find(
          (u) => u.id === supersededId
        );
        if (supersededUpdate) {
          supersededUpdate.status = "superseded";
          supersededUpdate.supersededById = id;
        }
      }

      const update: Update = {
        id,
        datePosted: dateStr,
        author,
        category,
        title,
        body,
        sourceExcerpt,
        supersedesIds,
        supersededById: null,
        status: "active",
        needsAnswer: false,
      };

      newUpdates.push(update);
      console.log(`Extracted update: ${title} (${category})`);
    }

    if (section.date > (lastProcessedDate || new Date(0))) {
      lastProcessedDate = section.date;
    }
  }

  // Merge new updates with existing
  const allUpdates = [...existingUpdates, ...newUpdates];

  // Update lastIngestedDate
  const finalLastDate =
    lastProcessedDate && lastProcessedDate > (existingData.lastIngestedDate ? new Date(existingData.lastIngestedDate) : new Date(0))
      ? lastProcessedDate.toISOString().split("T")[0]
      : existingData.lastIngestedDate;

  const updatedData: UpdatesData = {
    updates: allUpdates,
    lastIngestedDate: finalLastDate,
  };

  // Ensure public/data directory exists
  const publicDataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(publicDataDir)) {
    fs.mkdirSync(publicDataDir, { recursive: true });
  }

  console.log(`Writing ${allUpdates.length} total updates...`);
  // Write to both locations
  fs.writeFileSync(DATA_FILE, JSON.stringify(updatedData, null, 2), "utf-8");
  fs.writeFileSync(DATA_FILE_SOURCE, JSON.stringify(updatedData, null, 2), "utf-8");
  console.log(`Ingestion complete! Added ${newUpdates.length} new updates.`);
}

ingestDocx().catch((error) => {
  console.error("Error during ingestion:", error);
  process.exit(1);
});
