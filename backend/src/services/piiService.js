/**
 * PII Detection & Masking Service
 * Detects personally identifiable information (PII) in feedback text
 * and masks it before persistence to protect customer privacy.
 *
 * Supported PII types:
 *   - email      : email addresses
 *   - phone      : phone numbers
 *   - name       : person names (via compromise NLP)
 *   - address    : street addresses
 *   - creditCard : credit card numbers
 *   - ip         : IP addresses
 */

import nlp from 'compromise';

// ============================================================
// Regex patterns for PII detection
// ============================================================

const PII_PATTERNS = [
  {
    type: 'email',
    label: '[EMAIL]',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    type: 'phone',
    label: '[PHONE]',
    // Matches common phone formats: +1 555-123-4567, (555) 123-4567, 555.123.4567, etc.
    regex: /(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
  },
  {
    type: 'creditCard',
    label: '[CREDIT_CARD]',
    // Matches 13-19 digit card numbers, optionally grouped by spaces/dashes
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
  },
  {
    type: 'ip',
    label: '[IP]',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
  {
    type: 'address',
    label: '[ADDRESS]',
    // Matches street addresses like "123 Main St", "456 Oak Avenue"
    regex: /\b\d{1,5}\s+[A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)*(?:\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Ct|Court|Pl|Place|Way|Hwy|Highway))\.?\b/gi,
  },
];

// ============================================================
// Name detection using compromise NLP
// ============================================================

/**
 * Detect person names in text using compromise NLP.
 * @param {string} text - Input text
 * @returns {Array<{value: string, start: number, end: number}>} - Detected names
 */
function detectNames(text) {
  const doc = nlp(text);
  const names = [];
  const matches = doc.match('#Person+');
  matches.forEach((m) => {
    const value = m.text();
    const index = text.indexOf(value);
    if (index >= 0) {
      names.push({
        value,
        start: index,
        end: index + value.length,
      });
    }
  });
  return names;
}

// ============================================================
// Main PII detection & masking functions
// ============================================================

/**
 * Detect PII in a text string.
 * @param {string} text - Input text
 * @returns {Array<{type: string, value: string, start: number, end: number}>} - Detected PII items
 */
export function detectPII(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const detected = [];

  // Regex-based detection
  for (const pattern of PII_PATTERNS) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      const value = match[0];
      const start = match.index;
      detected.push({
        type: pattern.type,
        value,
        start,
        end: start + value.length,
      });
    }
  }

  // Name detection via compromise
  const names = detectNames(text);
  for (const name of names) {
    detected.push({
      type: 'name',
      value: name.value,
      start: name.start,
      end: name.end,
    });
  }

  // Sort by start position and deduplicate overlapping matches
  detected.sort((a, b) => a.start - b.start);
  const unique = [];
  for (const item of detected) {
    const last = unique[unique.length - 1];
    if (last && item.start < last.end) {
      // Overlapping match — keep the longer one
      if (item.end > last.end) {
        unique[unique.length - 1] = item;
      }
      continue;
    }
    unique.push(item);
  }

  return unique;
}

/**
 * Mask PII in a text string.
 * @param {string} text - Input text
 * @returns {{maskedText: string, piiFlagged: boolean, piiTypes: string[]}} - Masked result
 */
export function maskPII(text) {
  if (!text || typeof text !== 'string') {
    return {
      maskedText: text || '',
      piiFlagged: false,
      piiTypes: [],
    };
  }

  const detected = detectPII(text);
  if (detected.length === 0) {
    return {
      maskedText: text,
      piiFlagged: false,
      piiTypes: [],
    };
  }

  // Build masked text by replacing detected PII with labels
  let maskedText = text;
  const piiTypes = [...new Set(detected.map((d) => d.type))];

  // Replace from end to start to preserve indices
  for (let i = detected.length - 1; i >= 0; i--) {
    const item = detected[i];
    const label = PII_PATTERNS.find((p) => p.type === item.type)?.label || '[PII]';
    maskedText = maskedText.slice(0, item.start) + label + maskedText.slice(item.end);
  }

  return {
    maskedText,
    piiFlagged: true,
    piiTypes,
  };
}

/**
 * Mask PII in a canonical feedback item.
 * Masks the text field and customer email/name fields.
 * @param {Object} item - Canonical feedback item
 * @returns {Object} - Item with PII masked
 */
export function maskPIIInItem(item) {
  if (!item) {
    return item;
  }

  const result = { ...item };
  const piiTypes = new Set();

  // Mask the main text field
  if (result.text) {
    const textResult = maskPII(result.text);
    result.text = textResult.maskedText;
    if (textResult.piiFlagged) {
      textResult.piiTypes.forEach((t) => piiTypes.add(t));
    }
  }

  // Mask customer email
  if (result.customer?.email) {
    const emailResult = maskPII(result.customer.email);
    result.customer = {
      ...result.customer,
      email: emailResult.maskedText,
    };
    if (emailResult.piiFlagged) {
      emailResult.piiTypes.forEach((t) => piiTypes.add(t));
    }
  }

  // Mask customer name
  if (result.customer?.name) {
    const nameResult = maskPII(result.customer.name);
    result.customer = {
      ...result.customer,
      name: nameResult.maskedText,
    };
    if (nameResult.piiFlagged) {
      nameResult.piiTypes.forEach((t) => piiTypes.add(t));
    }
  }

  // Flag the item
  if (piiTypes.size > 0) {
    result.piiFlagged = true;
    result.piiTypes = [...piiTypes];
  }

  return result;
}