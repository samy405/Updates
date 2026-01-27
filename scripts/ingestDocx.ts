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

// Note: Priority authors and update indicators removed - using strict definition only

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

/**
 * STRICT UPDATE DEFINITION:
 * A message qualifies ONLY if it introduces or changes:
 * 1) a rule or restriction
 * 2) a process or workflow
 * 3) a standardization
 * 4) an escalation owner or responsibility
 * 5) a lasting operational instruction
 */
function isUpdate(text: string): boolean {
  const lowerText = text.toLowerCase();
  const trimmed = text.trim();

  // EXPLICITLY IGNORE these patterns (even from leadership):
  const ignorePatterns = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|sure|got it|will do)[\s\.!]*$/i,
    /^(can you|could you|would you|when will|how do|what is|where is)[\s\?]*$/i,
    /^(how is|how are|how's|how're)/i, // status checks
    /^(just wanting|just checking|just following up|just noticed)/i, // follow-ups and observations
    /^(per tech|tech is|tech has)/i, // tech status without new steps
    /^(please post|please update|please let me know)/i, // requests for feedback
    /^(fyi|for your information)/i, // FYI without change
    /(appreciate|appreciated|great job|doing great|thank you all)/i, // morale
    /(meeting|sync|standup|huddle)/i, // meeting references without process change
    /(please give.*thumbs up|please react|please review)/i, // review requests
    /^(it looks like|it seems|i noticed|i see)/i, // observations without instructions
    /(still being|still happening|still occurring)/i, // status observations
  ];

  // If message starts with or is primarily an ignored pattern, reject
  for (const pattern of ignorePatterns) {
    if (pattern.test(trimmed) && trimmed.length < 200) {
      // Check if the message is mostly just the ignored pattern
      const afterPattern = trimmed.replace(pattern, "").trim();
      if (afterPattern.length < 50) {
        return false;
      }
    }
  }

  // Must contain at least ONE of these update indicators:
  const updateIndicators = [
    // Rules/restrictions
    /\b(no longer|will not|must not|cannot|should not|do not|don't|unable to)\b.*\b(offer|provide|use|do|send|process|schedule|create|allow|accept)\b/i,
    /\b(restricted|restriction|prohibited|not allowed|not permitted)\b/i,
    /\b(must|required|mandatory|always|never)\b.*\b(direct|send|route|assign|defer|escalate|contact|use)\b/i,
    
    // Process/workflow changes
    /\b(new|updated|changed|adjusted|modified|revised)\s+(process|policy|workflow|procedure|sop|standard|system)\b/i,
    /\b(going forward|effective|starting|beginning|now|from now on)\b.*\b(process|workflow|procedure|policy)\b/i,
    /\b(standardized|standardize|standardization)\b/i,
    
    // Escalation/responsibility (must be an instruction, not observation)
    /\b(please|should|must|if.*assigned).*\b(reassign|route|send|defer|escalate|direct).*\b(to|team|supervisor|rn|ss|ma)\b/i,
    /\b(only|solely|exclusively).*\b(authorized|person|team|individual)\b/i,
    
    // Operational instructions
    /\b(please|should|must).*\b(create|send|use|follow|apply|implement|take|complete)\b.*\b(ticket|macro|link|process|steps|workflow)\b/i,
    /\b(if|when).*\b(then|please|should|must|do)\b/i, // conditional instructions
  ];

  // Check if message contains update indicators
  const hasUpdateIndicator = updateIndicators.some(pattern => pattern.test(lowerText));

  if (!hasUpdateIndicator) {
    return false;
  }

  // Additional validation: must contain substantive content about a change
  const hasSubstantiveChange = !!lowerText.match(/\b(change|update|new|modified|adjusted|standardized|routed|reassigned|restricted|no longer)\b/i);
  
  // Must not be just a status update without instructions
  const isStatusOnly = !!lowerText.match(/^(per tech|tech is|tech has|should be fixed|is fixed|has been fixed)/i) && 
                       !lowerText.match(/\b(please|should|must|if|when|then|steps|process|workflow)\b/i);

  return hasSubstantiveChange && !isStatusOnly;
}

// NOTE: extractUpdatePortions function removed - we now use "end of update" delimiter for splitting

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
  // Normalize whitespace but preserve paragraph breaks (double newlines)
  cleaned = cleaned.replace(/[ \t]+/g, " "); // Collapse spaces/tabs
  cleaned = cleaned.replace(/\n[ \t]+/g, "\n"); // Remove leading spaces on lines
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n"); // Remove trailing spaces on lines
  // Preserve double newlines (paragraph breaks)
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n"); // Max 2 newlines
  return cleaned.trim();
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
 * Generates an editorial title (5-10 words, sentence case) that summarizes the change.
 * Titles are NEWLY WRITTEN summaries, NOT copied text.
 * 
 * Examples:
 * - "All video visits standardized to 20-minute slots"
 * - "Employment verification restricted to Lindsay"
 * - "Medication change requests routed to RN team"
 * - "Sublingual progesterone 300mg no longer offered"
 */
function extractTitle(body: string, category: UpdateCategory): string {
  // Remove author name and common prefixes
  let cleaned = body;
  const authorPattern = /^[A-Z][a-z]+ [A-Z][a-z]+(?:\s+@channel)?\s*/;
  cleaned = cleaned.replace(authorPattern, "");
  cleaned = cleaned.replace(/^replied to a thread:\s*/i, "");
  
  // Remove common greetings and filler
  cleaned = cleaned.replace(/^(hi|hello|hey|good morning|good afternoon|sorry)\s+@?channel[:\s,]*/i, "");
  cleaned = cleaned.replace(/^(please|just|fyi|for your information)[\s,]*/i, "");
  cleaned = cleaned.replace(/^(per tech|tech is|tech has)[\s,]*/i, "");
  
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
  
  // "No longer" / restriction patterns - generate clear editorial title
  if (lowerText.match(/\bno longer\b/)) {
    const noLongerMatch = cleaned.match(/no longer\s+(?:be\s+)?(?:offering|providing|using|doing|sending|processing)\s+([^.!?]{5,60})/i);
    if (noLongerMatch && noLongerMatch[1]) {
      const subject = noLongerMatch[1].trim().split(/\s+/).slice(0, 4).join(" ");
      if (subject.length > 5) {
        return normalizeTitle(`${subject} no longer offered`);
      }
    }
  }
  
  // Specific medication/product restrictions
  const medicationMatch = cleaned.match(/(sublingual\s+progesterone|progesterone\s+sublingual|anastrozole|tadalafil|enclomiphene)/i);
  if (medicationMatch && lowerText.match(/\b(no longer|will not|discontinued|stopped)\b/)) {
    const med = medicationMatch[1].toLowerCase();
    return normalizeTitle(`${med} no longer offered`);
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
  
  // Process/Policy/Workflow patterns - generate editorial summaries
  if (lowerText.match(/\b(new|updated|changed|adjusted|adjusting|standardized)\s+(process|policy|workflow|procedure|sop)\b/)) {
    // Cancellation workflow
    if (lowerText.match(/cancellation\s+workflow/)) {
      if (lowerText.match(/cs.*not.*process.*stripe|send.*ss|shift supervisor/)) {
        return normalizeTitle("Cancellation requests routed to shift supervisor");
      }
      return normalizeTitle("Cancellation workflow updated");
    }
    // Employment verification
    if (lowerText.match(/employment\s+verification/)) {
      if (lowerText.match(/lindsay|email|lindsay@/)) {
        return normalizeTitle("Employment verification restricted to Lindsay");
      }
      return normalizeTitle("Employment verification process updated");
    }
    // Medication/treatment changes
    if (lowerText.match(/medication|treatment|add.?on|subscription\s+add/)) {
      if (lowerText.match(/rn\s+team|reassign.*rn|defer.*rn/)) {
        return normalizeTitle("Medication change requests routed to RN team");
      }
      if (lowerText.match(/defer.*requests.*rn.*instead.*cs/)) {
        return normalizeTitle("Medication change requests deferred to RN team");
      }
      return normalizeTitle("Medication change process updated");
    }
    // Lab processes
    if (lowerText.match(/lab\s+(order|request|process)/)) {
      if (lowerText.match(/email|ss\s+team|shift supervisor/)) {
        return normalizeTitle("Lab order email requests routed to shift supervisor");
      }
      return normalizeTitle("Lab order process updated");
    }
    // Generic workflow
    const workflowMatch = cleaned.match(/(cancellation|employment|verification|lab|billing|pharmacy)\s+workflow/i);
    if (workflowMatch) {
      return normalizeTitle(`${workflowMatch[1]} workflow updated`);
    }
  }
  
  // Standardization patterns
  if (lowerText.match(/\bstandardized|standardize|standardization\b/)) {
    if (lowerText.match(/video\s+visit|20.?minute|slot/)) {
      return normalizeTitle("All video visits standardized to 20-minute slots");
    }
    if (lowerText.match(/appointment|visit/)) {
      return normalizeTitle("Visit duration standardized");
    }
  }
  
  // Video visit changes - check early to catch before other patterns
  if (lowerText.match(/video\s+visit.*20|20.?minute.*slot|all video visits|video visits.*standardized/)) {
    if (lowerText.match(/standardized|standardize/)) {
      return normalizeTitle("All video visits standardized to 20-minute slots");
    }
  }
  
  // Check for "All video visits" pattern specifically
  if (cleaned.match(/All\s+video\s+visits.*standardized/i)) {
    return normalizeTitle("All video visits standardized to 20-minute slots");
  }
  
  // Routing/assignment changes - these are process updates
  if (lowerText.match(/routing\s+error|reassign|route.*to|routed.*to/)) {
    if (lowerText.match(/subscription.*billing.*ma|new subscription.*reassign.*ma|subscription.*ticket.*ma|assigned.*new subscription.*reassign.*ma/)) {
      return normalizeTitle("New subscription tickets routed to MA team");
    }
    if (lowerText.match(/routing\s+error.*subscription/)) {
      return normalizeTitle("Subscription routing error to MA team");
    }
  }
  
  // Direct reassignment instructions
  if (lowerText.match(/if.*assigned.*reassign|please\s+reassign.*to|reassign.*ticket.*to/)) {
    if (lowerText.match(/ma\s+team|ma\s+inbox/)) {
      return normalizeTitle("New subscription tickets reassigned to MA team");
    }
    if (lowerText.match(/rn\s+team/)) {
      return normalizeTitle("Medication requests reassigned to RN team");
    }
    if (lowerText.match(/shift\s+supervisor|ss\s+team/)) {
      return normalizeTitle("Tickets reassigned to shift supervisor");
    }
  }
  
  // Defer/routing instructions
  if (lowerText.match(/defer.*to|send.*to|route.*to|direct.*to/)) {
    if (lowerText.match(/rn\s+team|rn\s+verification/)) {
      return normalizeTitle("Medication change requests deferred to RN team");
    }
    if (lowerText.match(/shift\s+supervisor|ss\s+team/)) {
      return normalizeTitle("Requests routed to shift supervisor");
    }
  }
  
  // Prohibitions and restrictions
  if (lowerText.match(/do\s+not|should\s+not|must\s+not|cannot|unable\s+to|prohibited|not\s+allowed/)) {
    if (lowerText.match(/confirm.*deny.*patient|family\s+member|3rd\s+party|hipaa/)) {
      return normalizeTitle("Third-party patient confirmation prohibited");
    }
    if (lowerText.match(/employment\s+verification.*phone/)) {
      return normalizeTitle("Employment verification over phone prohibited");
    }
    if (lowerText.match(/manually\s+schedule.*lab|work\s+around.*lab/)) {
      return normalizeTitle("Manual lab scheduling prohibited");
    }
  }
  
  // Required actions/macros
  if (lowerText.match(/please\s+send|must\s+send|should\s+send|send.*macro/)) {
    if (lowerText.match(/cancellation\s+reason/)) {
      return normalizeTitle("Cancellation reason request macro required");
    }
  }
  
  // Refund process
  if (lowerText.match(/refund.*requested|please specify.*refund/)) {
    return normalizeTitle("Refund requests must be specified in ticket");
  }
  
  // Price change requests
  if (lowerText.match(/existing.*patient.*price|previous.*price|new.*price/)) {
    return normalizeTitle("Existing patient price change process");
  }
  
  // Look for "routing error" specifically - must check for subscription and MA team
  if (lowerText.match(/routing\s+error/)) {
    if (lowerText.match(/subscription|new subscription/)) {
      if (lowerText.match(/billing.*ma|ma\s+team|reassign.*ma|going.*billing.*instead.*ma/)) {
        return normalizeTitle("Subscription routing error to MA team");
      }
      return normalizeTitle("Subscription routing error");
    }
    return normalizeTitle("Routing error");
  }
  
  // Routing error patterns - check these BEFORE generic "there appears to be"
  if (lowerText.match(/routing\s+error/)) {
    if (lowerText.match(/subscription|new subscription/)) {
      if (lowerText.match(/billing.*ma|ma\s+team|reassign.*ma|going.*billing.*instead.*ma|billing.*team.*instead.*ma/)) {
        return normalizeTitle("Subscription routing error to MA team");
      }
      return normalizeTitle("Subscription routing error");
    }
  }
  
  // "There appears to be" pattern - must have routing error with subscription
  if (lowerText.match(/there\s+appears\s+to\s+be.*routing\s+error/)) {
    if (lowerText.match(/subscription|new subscription/)) {
      if (lowerText.match(/billing.*ma|ma\s+team|reassign.*ma|going.*billing.*instead.*ma/)) {
        return normalizeTitle("Subscription routing error to MA team");
      }
      return normalizeTitle("Subscription routing error");
    }
  }
  
  // Extract from structured sections (UPDATES- or bullet points)
  const bulletMatch2 = cleaned.match(/(?:^|\n)[\-\*•]\s*([A-Z][^\n:]{10,80})(?::|$)/);
  if (bulletMatch2 && bulletMatch2[1]) {
    const bulletText = bulletMatch2[1].trim();
    const bulletLower = bulletText.toLowerCase();
    
    // Generate title from bullet content
    if (bulletLower.match(/employment\s+verification/i)) {
      if (lowerText.match(/lindsay|email|lindsay@/)) {
        return normalizeTitle("Employment verification restricted to Lindsay");
      }
      return normalizeTitle("Employment verification process updated");
    }
    if (bulletLower.match(/subscription\s+add|add.?on\s+medication/i)) {
      if (lowerText.match(/rn\s+team|reassign.*rn/)) {
        return normalizeTitle("Medication add-on requests routed to RN team");
      }
      return normalizeTitle("Medication add-on process updated");
    }
    if (bulletLower.match(/3rd\s+party|family\s+member|hipaa/i)) {
      return normalizeTitle("Third-party communication prohibited for HIPAA");
    }
    if (bulletLower.match(/cancellation\s+reason/i)) {
      return normalizeTitle("Cancellation reason request macro required");
    }
    if (bulletLower.match(/email\s+lab\s+order/i)) {
      return normalizeTitle("Lab order email requests routed to shift supervisor");
    }
    // Use bullet text if it's already clear and meaningful
    if (bulletText.length > 10 && bulletText.length < 60 && !bulletLower.match(/^(updates?|reminders?)$/)) {
      return normalizeTitle(bulletText);
    }
  }
  
  // Direct reassignment instructions
  if (lowerText.match(/if.*assigned.*reassign|please\s+reassign.*to|reassign.*ticket.*to/)) {
    if (lowerText.match(/ma\s+team|ma\s+inbox/)) {
      return normalizeTitle("New subscription tickets reassigned to MA team");
    }
    if (lowerText.match(/rn\s+team/)) {
      return normalizeTitle("Medication requests reassigned to RN team");
    }
    if (lowerText.match(/shift\s+supervisor|ss\s+team/)) {
      return normalizeTitle("Tickets reassigned to shift supervisor");
    }
  }
  
  // Defer/routing instructions
  if (lowerText.match(/defer.*to|send.*to|route.*to|direct.*to/)) {
    if (lowerText.match(/rn\s+team|rn\s+verification/)) {
      return normalizeTitle("Medication change requests deferred to RN team");
    }
    if (lowerText.match(/shift\s+supervisor|ss\s+team/)) {
      return normalizeTitle("Requests routed to shift supervisor");
    }
  }
  
  // HRT labs not required
  if (lowerText.match(/hrt.*lab.*not\s+required|no\s+lab.*hrt|pilot.*program.*lab/)) {
    return normalizeTitle("HRT labs not required for pilot program patients");
  }
  
  // Lab charge scenarios
  if (lowerText.match(/charge.*lab|lab.*fee|\$35.*lab/)) {
    return normalizeTitle("Lab charges applied outside subscription");
  }
  
  // Fallback: generate from category and key terms
  const categoryTitles: Record<UpdateCategory, string> = {
    "Pharmacy": "Pharmacy process update",
    "Billing": "Billing process update",
    "Labs": "Lab process update",
    "Operations": "Operations process update",
    "Internal Tools / Systems": "System process update",
    "Contractor / Staffing": "Staffing process update",
    "Compliance / Clinical": "Compliance process update",
    "Miscellaneous": "Process update",
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

/**
 * Preserves paragraph structure and bullet points while normalizing whitespace
 */
function preserveStructure(text: string): string {
  // Normalize line breaks: preserve double newlines (paragraph breaks), collapse single newlines within paragraphs
  let normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Preserve bullet points and numbered lists
  // First, mark bullet lines
  const lines = normalized.split("\n");
  const preserved: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Empty lines become single newline (paragraph separator)
    if (trimmed.length === 0) {
      if (preserved.length > 0 && preserved[preserved.length - 1] !== "\n") {
        preserved.push("\n");
      }
      continue;
    }
    
    // Bullet or numbered list item - preserve as-is
    if (/^[\-\*•]\s+/.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed)) {
      preserved.push(trimmed);
      continue;
    }
    
    // Regular line - trim but preserve
    preserved.push(trimmed);
  }
  
  // Join with single newlines, but preserve double newlines for paragraphs
  return preserved.join("\n").replace(/\n\n+/g, "\n\n").trim();
}

/**
 * Validates that an update doesn't end mid-sentence or mid-word
 */
function validateUpdateCompleteness(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  
  // Check for incomplete endings
  const incompleteEndings = /\b(please|and|to|if|when|then|but|or|with|for|from|by|at|in|on|the|a|an)$/i;
  if (incompleteEndings.test(trimmed)) {
    return false;
  }
  
  // Check if ends with proper punctuation or is a complete thought
  if (/[.!?]$/.test(trimmed)) {
    return true;
  }
  
  // If ends with colon, it might be a heading - acceptable
  if (/:$/.test(trimmed)) {
    return true;
  }
  
  // If ends with a complete word (not cut off), it's probably okay
  // But prefer sentences ending with punctuation
  const lastWord = trimmed.split(/\s+/).pop() || "";
  if (lastWord.length > 2 && !/[.!?]$/.test(trimmed)) {
    // Warn but don't fail - might be intentional
    return true;
  }
  
  return true; // Default to accepting
}

/**
 * Removes non-update chatter (greetings, appreciation) while preserving instructions
 */
function removeChatter(text: string): string {
  const lines = text.split("\n");
  const cleaned: string[] = [];
  let foundUpdateContent = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      if (foundUpdateContent) {
        cleaned.push("");
      }
      continue;
    }
    
    // Skip pure greetings/appreciation at the start
    if (!foundUpdateContent) {
      if (/^(hi|hello|hey|thanks|thank you|appreciate|great job)[\s\.!]*$/i.test(trimmed)) {
        continue;
      }
      if (/^(just checking|just wanting|just following up)[\s\.]*$/i.test(trimmed)) {
        continue;
      }
    }
    
    // Once we find real content, keep everything
    if (trimmed.length > 10 && !/^(hi|hello|hey|thanks|thank you)[\s\.!]*$/i.test(trimmed)) {
      foundUpdateContent = true;
    }
    
    if (foundUpdateContent || trimmed.length > 5) {
      cleaned.push(trimmed);
    }
  }
  
  return cleaned.join("\n").trim();
}

async function ingestDocx(): Promise<void> {
  console.log("=== CS Updates Ingestion ===");
  console.log(`Looking for DOCX file at: ${DOCX_FILE}`);
  
  if (!fs.existsSync(DOCX_FILE)) {
    console.error(`ERROR: DOCX file not found at: ${DOCX_FILE}`);
    console.error("Please ensure 'CSupdates feeder.docx' exists in the project root.");
    process.exit(1);
  }
  
  console.log(`✓ File found: ${DOCX_FILE}`);
  console.log("Reading DOCX file...");
  const result = await mammoth.extractRawText({ path: DOCX_FILE });
  const rawText = result.value;
  console.log(`✓ Extracted ${rawText.length} characters from document`);

  console.log("Loading existing updates...");
  let existingData: UpdatesData;
  const sourceFile = fs.existsSync(DATA_FILE_SOURCE) ? DATA_FILE_SOURCE : DATA_FILE;
  if (fs.existsSync(sourceFile)) {
    const fileContent = fs.readFileSync(sourceFile, "utf-8");
    existingData = JSON.parse(fileContent);
  } else {
    existingData = { updates: [], lastIngestedDate: null };
  }

  const existingUpdates = existingData.updates;

  // STEP 1: Extract date headings and their positions
  const lines = rawText.split(/\n/);
  const dateHeadings: { date: Date; lineIndex: number }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const date = parseDateHeading(lines[i].trim());
    if (date) {
      dateHeadings.push({ date, lineIndex: i });
    }
  }

  console.log(`Found ${dateHeadings.length} date headings`);

  // STEP 2: Split by "end of update" delimiter (case-insensitive)
  // Try multiple patterns to catch variations
  const endOfUpdatePatterns = [
    /\n\s*end\s+of\s+update\s*\n/gi,
    /\n\s*end\s+of\s+update\s*$/gim,
    /end\s+of\s+update\s*\n/gi,
    /END\s+OF\s+UPDATE/gi,
  ];
  
  let updateBlocks: string[] = [];
  let workingText = rawText;
  
  // Try each pattern
  for (const pattern of endOfUpdatePatterns) {
    const matches = workingText.match(pattern);
    if (matches && matches.length > 0) {
      console.log(`Found ${matches.length} "end of update" delimiters using pattern`);
      updateBlocks = workingText.split(pattern);
      break;
    }
  }
  
  // If no delimiters found, check if document might not use them
  if (updateBlocks.length === 0 || (updateBlocks.length === 1 && updateBlocks[0].trim().length > 0)) {
    console.warn("No 'end of update' delimiters found. Document may not use this format.");
    console.warn("Falling back to date-section-based splitting (legacy mode)");
    // Fall back to legacy behavior - split by date sections only
    updateBlocks = [rawText];
  }
  
  console.log(`Processing ${updateBlocks.length} update blocks`);

  const newUpdates: Update[] = [];
  let lastProcessedDate: Date | null = null;

  // STEP 3: Process each update block
  for (let blockIndex = 0; blockIndex < updateBlocks.length; blockIndex++) {
    let block = updateBlocks[blockIndex].trim();
    if (block.length === 0) continue;

    // Find the nearest preceding date heading
    // Calculate approximate line index of this block
    let blockStartPos = 0;
    for (let i = 0; i < blockIndex; i++) {
      blockStartPos += updateBlocks[i].length;
      if (i < updateBlocks.length - 1) {
        // Add length of "end of update" delimiter (approximate)
        blockStartPos += 20;
      }
    }
    const blockStartLine = rawText.substring(0, blockStartPos).split("\n").length - 1;
    let associatedDate: Date | null = null;
    
    for (let i = dateHeadings.length - 1; i >= 0; i--) {
      if (dateHeadings[i].lineIndex <= blockStartLine) {
        associatedDate = dateHeadings[i].date;
        break;
      }
    }
    
    if (!associatedDate) {
      console.warn(`Update block ${blockIndex + 1} has no associated date, skipping`);
      continue;
    }

    const dateStr = associatedDate.toISOString().split("T")[0];

    // Remove date headings from the block content
    block = block.split("\n").filter(line => !parseDateHeading(line.trim())).join("\n").trim();
    
    // Remove "end of update" text if it appears in the block
    block = block.replace(/\s*end\s+of\s+update\s*/gi, "").trim();
    
    // Check if block contains multiple distinct updates (separated by clear section markers)
    // Look for patterns like "-Employment Verification", "-Subscription Add Ons", etc.
    // These indicate multiple updates that should be split
    const sectionMarkerPattern = /(?:^|\n)\s*-\s*([A-Z][A-Za-z\s]{5,50})\s*(?:\n|$)/g;
    const sectionMatches: { index: number; title: string }[] = [];
    let sectionMatch;
    
    // Reset regex
    sectionMarkerPattern.lastIndex = 0;
    while ((sectionMatch = sectionMarkerPattern.exec(block)) !== null) {
      const title = sectionMatch[1].trim();
      // Only consider substantial section titles (not just "Updates" or "Reminders")
      if (title.length > 5 && !/^(updates?|reminders?|notes?)$/i.test(title)) {
        sectionMatches.push({
          index: sectionMatch.index,
          title: title,
        });
      }
    }
    
    // If we found multiple distinct sections, split them into separate updates
    const updateSections: string[] = [];
    if (sectionMatches.length > 1) {
      console.log(`Block ${blockIndex + 1} contains ${sectionMatches.length} distinct sections, splitting...`);
      
      // For the first section, include everything from the start of the block
      // For subsequent sections, start from their marker
      for (let i = 0; i < sectionMatches.length; i++) {
        let sectionStart: number;
        let sectionEnd: number;
        
        if (i === 0) {
          // First section: include everything from block start to second section
          sectionStart = 0;
          sectionEnd = sectionMatches.length > 1 ? sectionMatches[1].index : block.length;
        } else {
          // Subsequent sections: start from their marker
          sectionStart = sectionMatches[i].index;
          sectionEnd = i < sectionMatches.length - 1 ? sectionMatches[i + 1].index : block.length;
        }
        
        let sectionBlock = block.substring(sectionStart, sectionEnd).trim();
        updateSections.push(sectionBlock);
      }
    } else {
      // Single update block - use as-is
      updateSections.push(block);
    }
    
    // Process each section as a separate update
    for (let sectionIndex = 0; sectionIndex < updateSections.length; sectionIndex++) {
      let sectionBlock = updateSections[sectionIndex];
      
      // Preserve structure (paragraphs, bullets)
      sectionBlock = preserveStructure(sectionBlock);
      
      // Remove Slack artifacts but preserve content structure
      sectionBlock = cleanSlackText(sectionBlock);
      
      // Remove non-update chatter (greetings, appreciation) but keep all instructions
      sectionBlock = removeChatter(sectionBlock);
      
      if (sectionBlock.length < 30) {
        console.warn(`Section ${sectionIndex + 1} of block ${blockIndex + 1} too short, skipping`);
        continue;
      }

      // Validate update completeness
      if (!validateUpdateCompleteness(sectionBlock)) {
        console.warn(`Section ${sectionIndex + 1} of block ${blockIndex + 1} may be incomplete, but processing anyway`);
      }

      // Check if this is actually an update
      if (!isUpdate(sectionBlock)) {
        console.log(`Section ${sectionIndex + 1} of block ${blockIndex + 1} does not qualify as update, skipping`);
        continue;
      }

      const author = extractAuthor(sectionBlock);
      const category = detectCategory(sectionBlock);
      const title = extractTitle(sectionBlock, category);
      
      // NO TRUNCATION - store full content
      const body = sectionBlock; // Full content, never truncated
      const sourceExcerpt = sectionBlock.length > 300 ? sectionBlock.substring(0, 300) + "..." : sectionBlock; // Only for display
      
      const id = generateId(title, dateStr);
      const supersedesIds = detectSupersedes(sectionBlock, existingUpdates);

      // Mark superseded updates
      for (const supersededId of supersedesIds) {
        const supersededUpdate = existingUpdates.find((u) => u.id === supersededId);
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
        body, // Full content, never truncated
        sourceExcerpt,
        supersedesIds,
        supersededById: null,
        status: "active",
        needsAnswer: false,
      };

      newUpdates.push(update);
      console.log(`Extracted update: ${title} (${category}) - ${body.length} chars`);
    }
    
    if (associatedDate > (lastProcessedDate || new Date(0))) {
      lastProcessedDate = associatedDate;
    }
  }

  // For full re-ingestion, replace all existing updates
  // Otherwise, merge new with existing
  const shouldReplaceAll = process.env.REINGEST_ALL === "true" || newUpdates.length > 0;
  
  let allUpdates: Update[];
  if (shouldReplaceAll && newUpdates.length > 0) {
    // Replace all updates from dates we're processing
    const processedDates = new Set(newUpdates.map(u => u.datePosted));
    const keptUpdates = existingUpdates.filter(u => !processedDates.has(u.datePosted));
    allUpdates = [...keptUpdates, ...newUpdates];
    console.log(`Replaced updates for ${processedDates.size} date(s), kept ${keptUpdates.length} existing updates`);
  } else {
    // Merge new with existing, deduplicate
    const seenTitles = new Set<string>();
    const deduplicatedNew: Update[] = [];
    for (const update of newUpdates) {
      const titleKey = `${update.datePosted}-${update.title.toLowerCase().trim()}`;
      if (!seenTitles.has(titleKey)) {
        seenTitles.add(titleKey);
        deduplicatedNew.push(update);
      } else {
        console.log(`Skipping duplicate: ${update.title}`);
      }
    }
    allUpdates = [...existingUpdates, ...deduplicatedNew];
  }

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

  console.log(`\n=== Ingestion Summary ===`);
  console.log(`Total updates in database: ${allUpdates.length}`);
  console.log(`New updates added: ${newUpdates.length}`);
  console.log(`Updates written to: ${DATA_FILE}`);
  console.log(`Updates written to: ${DATA_FILE_SOURCE}`);
  
  // Write to both locations
  fs.writeFileSync(DATA_FILE, JSON.stringify(updatedData, null, 2), "utf-8");
  fs.writeFileSync(DATA_FILE_SOURCE, JSON.stringify(updatedData, null, 2), "utf-8");
  
  console.log(`✓ Files written successfully`);
  console.log(`\nIngestion complete!`);
  
  if (allUpdates.length === 0) {
    console.warn("\n⚠️  WARNING: No updates were extracted. Check:");
    console.warn("  1. Document contains 'end of update' delimiters");
    console.warn("  2. Updates meet the strict definition criteria");
    console.warn("  3. Date headings are properly formatted");
  }
}

ingestDocx().catch((error) => {
  console.error("Error during ingestion:", error);
  process.exit(1);
});
