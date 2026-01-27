import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import mammoth from "mammoth";
import type { Update, UpdatesData, UpdateCategory } from "../src/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "../public/data/updates.json");
const DATA_FILE_SOURCE = path.join(__dirname, "../data/updates.json");
const DOCX_FILE = path.join(__dirname, "../CSupdates feeder.docx");

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
  const trimmed = text.trim();

  // Skip obvious non-updates (but only if they're very short or don't contain update content)
  const casualGreetings = /^(hi|hello|hey|thanks|thank you|ok|okay|sure|got it|will do)[\s\.!]*$/i;
  if (casualGreetings.test(trimmed) && trimmed.length < 100) {
    return false;
  }

  // Skip pure questions without update content
  const pureQuestion = /^(can you|could you|would you|when will|how do|what is|where is)[\s\?]*$/i;
  if (pureQuestion.test(trimmed) && trimmed.length < 150) {
    return false;
  }

  // Priority authors are always evaluated
  const isPriorityAuthor = PRIORITY_AUTHORS.some(
    (name) => author.toLowerCase().includes(name.toLowerCase())
  );

  // Check for update indicators
  const hasIndicator = UPDATE_INDICATORS.some((indicator) =>
    lowerText.includes(indicator)
  );

  // Check for procedural/operational language
  const proceduralKeywords = [
    "process", "policy", "procedure", "workflow", "sop", "standard",
    "effective", "implement", "rollout", "deploy", "change", "update",
    "new", "now", "going forward", "starting", "beginning", "deprecate",
    "fix", "error", "issue", "resolve", "solution", "steps", "instructions",
  ];

  const hasProceduralLanguage = proceduralKeywords.some((keyword) =>
    lowerText.includes(keyword)
  );

  // For priority authors, be more lenient but still require substance
  if (isPriorityAuthor) {
    // Must have some substance (not just "update" or "change" alone)
    const hasSubstance = lowerText.length > 50 || 
      (hasIndicator && lowerText.length > 30) ||
      (hasProceduralLanguage && lowerText.length > 40);
    
    return hasSubstance && (
      hasIndicator ||
      hasProceduralLanguage ||
      lowerText.includes("announce") ||
      lowerText.includes("important")
    );
  }

  // For others, require clear update language and official tone
  return (
    (hasIndicator || hasProceduralLanguage) &&
    (lowerText.includes("announcing") ||
      lowerText.includes("effective") ||
      lowerText.includes("going forward") ||
      lowerText.includes("new process") ||
      lowerText.includes("updated process") ||
      lowerText.includes("official") ||
      lowerText.includes("policy change"))
  );
}

function extractAuthor(text: string): string {
  // Common Slack paste formats:
  // "Author Name [timestamp]" or "Author Name:" or "Author Name -" or "Author Name at 10:30 AM"
  const patterns = [
    /^([A-Z][a-z]+ [A-Z][a-z]+)(?:\s*\[|\s*:|\s*-|\s+at\s+\d)/i,
    /^([A-Z][a-z]+ [A-Z][a-z]+)\s/i,
    /^([A-Z][a-z]+)\s/i,
    // Try to match priority authors even if format is different
    /(Jessica\s+Booker|Lindsay\s+Burden|Camryn\s+Burden)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const author = match[1].trim();
      // Normalize spacing
      return author.replace(/\s+/g, " ");
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
  // Try to parse dates like "January 28, 2026" or "Jan 28, 2026" or "January 28, 2026" at start of line
  const trimmed = text.trim();
  
  // Month abbreviations mapping
  const monthMap: Record<string, number> = {
    "january": 0, "jan": 0,
    "february": 1, "feb": 1,
    "march": 2, "mar": 2,
    "april": 3, "apr": 3,
    "may": 4,
    "june": 5, "jun": 5,
    "july": 6, "jul": 6,
    "august": 7, "aug": 7,
    "september": 8, "sep": 8, "sept": 8,
    "october": 9, "oct": 9,
    "november": 10, "nov": 10,
    "december": 11, "dec": 11,
  };

  // Pattern 1: "Wednesday 1/28:" or "Wednesday 1/28/26:" (day name followed by M/D or M/D/YY)
  const dayNamePattern = /^[A-Z][a-z]+\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*:?/i;
  const dayNameMatch = trimmed.match(dayNamePattern);
  if (dayNameMatch) {
    const month = parseInt(dayNameMatch[1]) - 1;
    const day = parseInt(dayNameMatch[2]);
    let year = dayNameMatch[3] ? parseInt(dayNameMatch[3]) : new Date().getFullYear();
    
    // Handle 2-digit years
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    if (year >= 2020 && year <= 2030 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // Pattern 2: "January 28, 2026" or "Jan 28, 2026" (full month name or abbreviation)
  const fullDatePattern = /^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/i;
  const fullMatch = trimmed.match(fullDatePattern);
  if (fullMatch) {
    const monthName = fullMatch[1].toLowerCase();
    const month = monthMap[monthName];
    if (month !== undefined) {
      const year = parseInt(fullMatch[3]);
      const day = parseInt(fullMatch[2]);
      // Validate date is reasonable (between 2020 and 2030)
      if (year >= 2020 && year <= 2030 && day >= 1 && day <= 31) {
        return new Date(year, month, day);
      }
    }
  }

  // Pattern 3: MM/DD/YYYY or MM/DD/YY
  const slashPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
  const slashMatch = trimmed.match(slashPattern);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    let year = parseInt(slashMatch[3]);
    
    // Handle 2-digit years
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    if (year >= 2020 && year <= 2030 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // Pattern 4: YYYY-MM-DD
  const dashPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
  const dashMatch = trimmed.match(dashPattern);
  if (dashMatch) {
    const year = parseInt(dashMatch[1]);
    const month = parseInt(dashMatch[2]) - 1;
    const day = parseInt(dashMatch[3]);
    if (year >= 2020 && year <= 2030 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  return null;
}

/**
 * Extracts a meaningful, concise title from update body text.
 * 
 * Test cases (before -> after):
 * - "Hi @channel we had an error occur with our lab scheduling" -> "Lab scheduling error fix"
 * - "Per tech this should be fixed" -> "Technical issue resolved"
 * - "There appears to be a routing error when a new subscription occurs" -> "Subscription routing error"
 * - "Important reminders and updates. -Employment Verification..." -> "Employment verification process"
 * - "Good morning @channel. We have some Updates... -Sublingual Progesterone..." -> "Sublingual progesterone policy change"
 * - "Hey @channel. ... -Cancellation Reasons..." -> "Cancellation workflow update"
 * - "last night there was a brief outage while we were making updates for HRT" -> "HRT system outage fix"
 */
function extractTitle(body: string, category: UpdateCategory): string {
  // Remove author name and common prefixes
  let cleaned = body;
  const authorPattern = /^[A-Z][a-z]+ [A-Z][a-z]+(?:\s+@channel)?\s*/;
  cleaned = cleaned.replace(authorPattern, "");
  cleaned = cleaned.replace(/^replied to a thread:\s*/i, "");
  
  // Remove common greetings
  cleaned = cleaned.replace(/^(hi|hello|hey|good morning|good afternoon)\s+@?channel[:\s,]*/i, "");
  cleaned = cleaned.replace(/^sorry\s+[^.]*\.\s*/i, "");
  
  // Look for explicit title markers (e.g., "Title:", "Subject:")
  // Also look for "Title: Testy Mr Tester Lab Booking error" patterns
  // Match across line breaks if needed
  const titleMatch = cleaned.match(/(?:title|subject)[:\s]+([^\n"']{10,80})/i);
  if (titleMatch && titleMatch[1]) {
    let title = titleMatch[1].trim();
    // Clean up the title (remove quotes, extra spaces, stop at next quote or newline)
    title = title.replace(/^["']|["']$/g, "").split(/["'\n]/)[0].trim();
    if (title.length > 10 && title.length < 80) {
      // Extract key part if it's too long - prefer first meaningful words
      const words = title.split(/\s+/);
      if (words.length > 10) {
        // Take first 8 words that form a coherent title
        return normalizeTitle(words.slice(0, 8).join(" "));
      }
      return normalizeTitle(title);
    }
  }
  
  // Look for bullet headers (e.g., "-Employment Verification", "UPDATES-Sublingual Progesterone")
  // Also match "UPDATES-" prefix
  const bulletMatch = cleaned.match(/(?:^|\n)(?:updates?[\s-]+)?[\-\*•]\s*([A-Z][^\n:]{5,60})(?::|$)/i);
  if (bulletMatch && bulletMatch[1]) {
    const bulletTitle = bulletMatch[1].trim();
    // Skip if it's just "UPDATES" or "REMINDERS"
    if (!/^(updates?|reminders?)$/i.test(bulletTitle) && bulletTitle.length > 5) {
      return normalizeTitle(bulletTitle);
    }
  }
  
  // Look for section headers in all caps or title case
  const headerMatch = cleaned.match(/(?:^|\n)([A-Z][A-Z\s]{5,40}):/);
  if (headerMatch && headerMatch[1]) {
    const header = headerMatch[1].trim();
    if (header.split(/\s+/).length <= 6) {
      return normalizeTitle(header);
    }
  }
  
  // Extract based on key phrases
  const lowerText = cleaned.toLowerCase();
  
  // Look for "no longer" patterns with subject
  if (lowerText.match(/\bno longer\b/)) {
    const noLongerMatch = cleaned.match(/no longer\s+(?:be\s+)?(?:offering|providing|using|doing|sending)\s+([^.!?]{5,40})/i);
    if (noLongerMatch && noLongerMatch[1]) {
      const subject = noLongerMatch[1].trim().split(/\s+/).slice(0, 5).join(" ");
      if (subject.length > 5) {
        return normalizeTitle(`${subject} policy change`);
      }
    }
  }
  
  // Look for specific medication/product names with policy changes
  const medicationMatch = cleaned.match(/(sublingual\s+progesterone|progesterone\s+sublingual|anastrozole|tadalafil|enclomiphene)/i);
  if (medicationMatch && lowerText.match(/\b(no longer|will not|discontinued|stopped)\b/)) {
    return normalizeTitle(`${medicationMatch[1]} policy change`);
  }
  
  // Error/Issue patterns - look for subject before or after error word
  if (lowerText.match(/\b(error|issue|bug|problem|outage)\b/)) {
    // Pattern: "we had an error occur with our lab scheduling" -> extract "lab scheduling"
    const errorWithSubjectMatch = cleaned.match(/(?:error|issue|bug|problem|outage)\s+(?:occur|with|in|on)\s+(?:our|the|a|an)?\s*([a-z]+(?:\s+[a-z]+){1,3})/i);
    if (errorWithSubjectMatch && errorWithSubjectMatch[1]) {
      const subject = errorWithSubjectMatch[1].trim();
      if (subject.length > 3 && !/^(an|the|a|this|that|there|we|our)$/i.test(subject)) {
        const action = getActionWord(lowerText);
        return normalizeTitle(`${subject} ${action}`);
      }
    }
    // Pattern: "error occur with our lab scheduling" -> extract "lab scheduling"
    const errorWithOurMatch = cleaned.match(/error\s+occur\s+with\s+our\s+([a-z]+(?:\s+[a-z]+){1,2})/i);
    if (errorWithOurMatch && errorWithOurMatch[1]) {
      const subject = errorWithOurMatch[1].trim();
      if (subject.length > 3) {
        return normalizeTitle(`${subject} error fix`);
      }
    }
    // Pattern: "lab scheduling error" (subject before error)
    const errorMatch = cleaned.match(/([a-z]+(?:\s+[a-z]+){1,2})\s+(?:error|issue|bug|problem|outage)/i);
    if (errorMatch && errorMatch[1]) {
      const subject = errorMatch[1].trim();
      // Validate it's a real subject (not just "an" or "the")
      if (subject.length > 3 && !/^(an|the|a|this|that|there|we|our|had|with)$/i.test(subject)) {
        const action = getActionWord(lowerText);
        return normalizeTitle(`${subject} ${action}`);
      }
    }
    // Look for system/service names mentioned near error
    const systemMatch = cleaned.match(/(lab|billing|pharmacy|system|subscription|checkout|routing|scheduling|labcorp|sonora|quest)\s*(?:error|issue|problem|outage|scheduling|booking)/i);
    if (systemMatch) {
      const system = systemMatch[1];
      const action = getActionWord(lowerText);
      return normalizeTitle(`${system} ${action}`);
    }
  }
  
  // Fix/Resolution patterns
  if (lowerText.match(/\b(fixed|resolved|corrected|patched|should be fixed)\b/)) {
    // Look for what was fixed
    const fixSubjectMatch = cleaned.match(/(labcorp|lab|routing|subscription|checkout|scheduling|system)\s+(?:issue|error|problem)\s+(?:should\s+be\s+)?fixed/i);
    if (fixSubjectMatch) {
      return normalizeTitle(`${fixSubjectMatch[1]} issue resolved`);
    }
    // Generic fix
    if (lowerText.match(/per tech.*fixed/i)) {
      return normalizeTitle("Technical issue resolved");
    }
  }
  
  // Process/Policy/Workflow patterns
  if (lowerText.match(/\b(new|updated|changed|adjusted|adjusting)\s+(process|policy|workflow|procedure|sop)\b/)) {
    // Look for workflow name
    const workflowMatch = cleaned.match(/(cancellation|employment|verification|lab|billing|pharmacy)\s+workflow/i);
    if (workflowMatch) {
      return normalizeTitle(`${workflowMatch[1]} workflow update`);
    }
    // Look for process name
    const processMatch = cleaned.match(/(?:new|updated|changed|adjusted|adjusting)\s+([a-z]+(?:\s+[a-z]+){0,2})\s+(?:process|policy|workflow)/i);
    if (processMatch && processMatch[1]) {
      return normalizeTitle(`${processMatch[1]} ${getProcessAction(lowerText)}`);
    }
  }
  
  // Look for "routing error" specifically
  if (lowerText.match(/routing\s+error/)) {
    if (lowerText.match(/subscription/)) {
      return normalizeTitle("Subscription routing error");
    }
    return normalizeTitle("Routing error");
  }
  
  // Look for "there appears to be" pattern
  if (lowerText.match(/there\s+appears\s+to\s+be/)) {
    const appearsMatch = cleaned.match(/there\s+appears\s+to\s+be\s+a\s+([a-z]+(?:\s+[a-z]+){0,2})\s+(?:error|issue)/i);
    if (appearsMatch && appearsMatch[1]) {
      return normalizeTitle(`${appearsMatch[1]} error`);
    }
  }
  
  // Look for specific update subjects in structured format
  const updateMatch = cleaned.match(/(?:updates?|reminders?)[\s:]+([A-Z][^\n]{10,50})/i);
  if (updateMatch && updateMatch[1]) {
    const updateText = updateMatch[1].trim();
    // Extract first meaningful part
    const parts = updateText.split(/[.!?]/)[0].split(/\s+/).slice(0, 6);
    if (parts.length >= 2) {
      return normalizeTitle(parts.join(" "));
    }
  }
  
  // Extract first meaningful sentence (skip greetings and filler)
  const sentences = cleaned.split(/[.!?]+/).filter(s => {
    const trimmed = s.trim();
    return trimmed.length > 20 && 
           !trimmed.match(/^(thanks|thank you|please|just|sorry|appreciate|hi|hey|good morning|good afternoon)/i) &&
           !trimmed.match(/^(how is|what is|when will|can you|could you)/i);
  });
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const words = trimmed.split(/\s+/);
    
    // Skip if too short or too long
    if (words.length < 4 || words.length > 15) continue;
    
    // Remove leading filler words
    let startIdx = 0;
    while (startIdx < words.length && /^(the|a|an|this|that|there|we|our|please|just|hi|hey|we\s+had|we\s+have)/i.test(words[startIdx])) {
      startIdx++;
    }
    
    if (startIdx < words.length) {
      const meaningfulWords = words.slice(startIdx, startIdx + 8);
      if (meaningfulWords.length >= 3) {
        const candidate = meaningfulWords.join(" ");
        // Validate it's not just filler
        if (candidate.length > 10 && !candidate.match(/^(is|are|was|were|will|can|should)\s*$/i)) {
          return normalizeTitle(candidate);
        }
      }
    }
  }
  
  // Fallback: category-based generic title
  const categoryTitles: Record<UpdateCategory, string> = {
    "Pharmacy": "Pharmacy update",
    "Billing": "Billing update",
    "Labs": "Lab process update",
    "Operations": "Operations update",
    "Internal Tools / Systems": "System update",
    "Contractor / Staffing": "Staffing update",
    "Compliance / Clinical": "Compliance update",
    "Miscellaneous": "Update",
  };
  
  return categoryTitles[category];
}

function normalizeTitle(title: string): string {
  // Remove extra whitespace
  let normalized = title.replace(/\s+/g, " ").trim();
  
  // Remove leading prepositions and filler words
  normalized = normalized.replace(/^(with|for|to|from|by|at|in|on|the|a|an|and|or|but|be|is|are|was|were|we|our|this|that|there)\s+/i, "");
  
  // Remove trailing punctuation
  normalized = normalized.replace(/[.,;:!?]+$/, "");
  
  // Skip if title is too short or meaningless after cleaning
  if (normalized.length < 5 || /^(to|and|or|but|the|a|an|is|are|was|were)$/i.test(normalized)) {
    return normalized; // Return as-is, will fall back to category title
  }
  
  // Convert to sentence case (first letter uppercase, rest lowercase, except proper nouns)
  const words = normalized.split(/\s+/);
  const sentenceCase = words.map((word, index) => {
    // Keep acronyms and proper nouns (words that start with capital)
    if (word.match(/^[A-Z]{2,}$/) || (index > 0 && word[0] === word[0].toUpperCase() && word.length > 1)) {
      return word;
    }
    // First word always capitalized
    if (index === 0) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    // Keep common proper nouns and technical terms
    const properNouns = ["LabCorp", "Sonora", "Quest", "HRT", "TRT", "GLP", "RN", "CS", "SS", "CIO", "HIPAA", "Stripe", "Mac", "PC"];
    if (properNouns.some(pn => word.toLowerCase().includes(pn.toLowerCase()))) {
      return word;
    }
    return word.toLowerCase();
  }).join(" ");
  
  // Limit length
  if (sentenceCase.length > 80) {
    const words = sentenceCase.split(/\s+/);
    let result = "";
    for (const word of words) {
      if ((result + " " + word).length > 77) break;
      result += (result ? " " : "") + word;
    }
    return result + "...";
  }
  
  return sentenceCase;
}

function getActionWord(text: string): string {
  if (text.match(/\bfixed|resolved|corrected\b/)) return "fix";
  if (text.match(/\boutage|down\b/)) return "outage";
  if (text.match(/\berror\b/)) return "error";
  if (text.match(/\bissue\b/)) return "issue";
  return "issue";
}

function getProcessAction(text: string): string {
  if (text.match(/\bnew\b/)) return "process";
  if (text.match(/\bupdated|changed|adjusted\b/)) return "update";
  return "change";
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
  if (!fs.existsSync(DOCX_FILE)) {
    console.error(`DOCX file not found at: ${DOCX_FILE}`);
    process.exit(1);
  }
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
    // Join all content and split by common message patterns
    const fullContent = section.content.join("\n");
    
    // Split by patterns that indicate new messages:
    // - Double newlines
    // - Lines starting with capitalized names (likely author names)
    // - Lines with timestamps
    const messageSplits = fullContent.split(/\n\n+/);
    const allMessages: string[] = [];
    
    for (const chunk of messageSplits) {
      // Further split by author name patterns
      const subMessages = chunk.split(/\n(?=[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s*[:\[\-]|\s+at\s+\d))/);
      for (const msg of subMessages) {
        const trimmed = msg.trim();
        if (trimmed.length > 0) {
          allMessages.push(trimmed);
        }
      }
    }

    for (const message of allMessages) {
      const cleaned = cleanSlackText(message);
      if (cleaned.length < 20) continue; // Skip very short messages

      const author = extractAuthor(cleaned);
      if (!isUpdate(cleaned, author)) {
        continue; // Skip non-updates
      }

      const category = detectCategory(cleaned);
      const title = extractTitle(cleaned, category);
      
      // Use full cleaned text as body, but limit to reasonable length
      const body = cleaned.length > 1000 ? cleaned.substring(0, 1000) + "..." : cleaned;
      const sourceExcerpt = cleaned.length > 250 ? cleaned.substring(0, 250) + "..." : cleaned;
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
