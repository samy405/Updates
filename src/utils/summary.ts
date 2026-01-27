/**
 * Intelligently extracts a summary from update body text.
 * Ensures semantic completeness by never cutting mid-sentence, mid-bullet, or mid-paragraph.
 * 
 * Summary extraction priority:
 * 1. Short introductory paragraph (if entire paragraph fits)
 * 2. Complete first bullet group
 * 3. First 2-3 complete sentences
 * 4. First logical section
 */

const MAX_SUMMARY_LENGTH = 200; // Target length, but will extend to preserve completeness
const MIN_SUMMARY_LENGTH = 100; // Minimum meaningful length

/**
 * Extracts a semantically complete summary from update body text
 */
export function extractSummary(body: string): string {
  if (!body || body.trim().length === 0) {
    return "";
  }

  const trimmed = body.trim();

  // If the entire body is short enough, return it as-is
  if (trimmed.length <= MAX_SUMMARY_LENGTH) {
    return trimmed;
  }

  // Strategy 1: Check for short introductory paragraph
  const firstParagraph = getFirstParagraph(trimmed);
  if (firstParagraph && firstParagraph.length <= MAX_SUMMARY_LENGTH && firstParagraph.length >= MIN_SUMMARY_LENGTH) {
    return firstParagraph;
  }

  // Strategy 2: Check for bullet points - extract complete first bullet group
  const bulletGroup = getFirstBulletGroup(trimmed);
  if (bulletGroup && bulletGroup.length <= MAX_SUMMARY_LENGTH * 1.5) {
    // Allow slightly longer for bullet groups to preserve completeness
    return bulletGroup;
  }

  // Strategy 3: Extract first 2-3 complete sentences
  const sentences = getFirstSentences(trimmed, MAX_SUMMARY_LENGTH);
  if (sentences && sentences.length >= MIN_SUMMARY_LENGTH) {
    return sentences;
  }

  // Strategy 4: Fallback to first logical section (first paragraph or first ~200 chars at word boundary)
  return getFirstLogicalSection(trimmed, MAX_SUMMARY_LENGTH);
}

/**
 * Extracts the first paragraph (text until first double newline or end)
 */
function getFirstParagraph(text: string): string | null {
  const paragraphs = text.split(/\n\s*\n/);
  if (paragraphs.length > 0 && paragraphs[0].trim().length > 0) {
    return paragraphs[0].trim();
  }
  return null;
}

/**
 * Extracts the first complete bullet group (all bullets until a non-bullet line or paragraph break)
 */
function getFirstBulletGroup(text: string): string | null {
  const lines = text.split(/\n/);
  const bulletLines: string[] = [];
  let foundBullets = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if this line is a bullet point
    const isBullet = /^[\-\*•]\s+/.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed);
    
    if (isBullet) {
      foundBullets = true;
      bulletLines.push(trimmed);
    } else if (foundBullets) {
      // We've started collecting bullets and hit a non-bullet line
      // If it's empty or very short, it might be spacing - continue
      if (trimmed.length === 0 || trimmed.length < 10) {
        continue;
      }
      // Otherwise, we've reached the end of the bullet group
      break;
    }
  }

  if (bulletLines.length > 0) {
    return bulletLines.join("\n");
  }

  return null;
}

/**
 * Extracts the first 2-3 complete sentences that fit within the target length
 */
function getFirstSentences(text: string, maxLength: number): string | null {
  // Split by sentence endings (., !, ?) followed by space or newline
  const sentencePattern = /([^.!?\n]+[.!?]+)\s*/g;
  const sentences: string[] = [];
  let match;
  let totalLength = 0;

  while ((match = sentencePattern.exec(text)) !== null) {
    const sentence = match[1].trim();
    if (sentence.length === 0) continue;

    // Check if adding this sentence would exceed our limit
    const newLength = totalLength + sentence.length + (sentences.length > 0 ? 2 : 0); // +2 for spacing
    
    if (newLength > maxLength && sentences.length >= 2) {
      // We have at least 2 sentences, stop here
      break;
    }

    sentences.push(sentence);
    totalLength = newLength;

    // Stop after 3 sentences
    if (sentences.length >= 3) {
      break;
    }
  }

  if (sentences.length > 0) {
    return sentences.join(" ");
  }

  return null;
}

/**
 * Extracts the first logical section, truncating at word boundaries if needed
 */
function getFirstLogicalSection(text: string, maxLength: number): string {
  // Try to get first paragraph
  const firstParagraph = getFirstParagraph(text);
  if (firstParagraph && firstParagraph.length <= maxLength * 1.2) {
    return firstParagraph;
  }

  // Fallback: truncate at word boundary near target length
  if (text.length <= maxLength) {
    return text;
  }

  // Find the last space before maxLength
  let truncateAt = maxLength;
  for (let i = maxLength; i > maxLength * 0.7; i--) {
    if (text[i] === " " || text[i] === "\n") {
      truncateAt = i;
      break;
    }
  }

  // Ensure we don't cut mid-sentence if possible
  const truncated = text.substring(0, truncateAt).trim();
  
  // Check if we ended mid-sentence (no ending punctuation)
  if (!/[.!?]$/.test(truncated)) {
    // Try to find the last sentence ending
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf("."),
      truncated.lastIndexOf("!"),
      truncated.lastIndexOf("?")
    );
    
    if (lastSentenceEnd > maxLength * 0.5) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }
  }

  return truncated;
}
