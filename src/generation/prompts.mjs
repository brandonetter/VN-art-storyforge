// Editable provider-independent prompt templates. Tokens are filled once, after loading the template.
export const defaultPrompts = {
  canonical: [
    'Create a canonical character reference.',
    'Use image 1 (canonreference.png) as the reference for pose, framing, composition, and presentation.',
    'Use image 2 as the character identity reference: preserve its facial features, hair, skin tone, clothing, and defining details.',
    'Depict only this character with clean, consistent details and an opaque background matching image 1.',
    'No text, extra characters, or added props. This image will be the identity reference for future emotion sheets.'
  ].join(' '),
  sheet: [
    'Create one 4:3 emotional character sprite sheet with exactly four equal columns and two equal rows.',
    'Image 1 is the expression, pose, framing, style, and panel layout reference for Sheet {sheet} ({title}).',
    'Image 2 is the confirmed canonical character identity: preserve its hair, facial features, skin tone, clothing, proportions, and defining details in every panel and across every sheet.',
    "Do not copy the template character's identity or outfit. Image 3 is the exact grid guide.",
    '{anchor}',
    'Preserve straight grid lines at 25%, 50%, and 75% of the width and 50% of the height; do not merge or rearrange panels.',
    'Panel order, left to right: {panelsTop}; then {panelsBottom}.',
    '{direction}',
    'The first Neutral panel must consistently match the canonical neutral expression.',
    'Keep the entire head, hair, hands, and body within the left, right, and top edge of each panel, with visible breathing room.',
    'Use a consistent camera distance and character scale across all panels and sheets.',
    'For Sheet A, establish these from the Neutral panel of image 1; for Sheets B, C, and D, match the generated Sheet A Neutral anchor in image 4.',
    'Frame the character from the top of the hair to mid-thigh, with the bottom panel edge intersecting the thighs at the same anatomical point in every panel.',
    'Keep head size, headroom, and vertical placement consistent with that Neutral reference.',
    'Do not zoom in, enlarge the character, or shift the framing to emphasize an expression or accommodate a pose.',
    'Keep skin tone, especially the face, identical across all panels.',
    'Use the same clean rendering style, lighting, line weight, and clothing details as the canonical reference.',
    'Draw a transparent background. No text, extra characters, or added props.'
  ].join(' '),
  sheetAnchor: [
    'Image 4 is the single shared Neutral anchor cropped from generated Sheet A.',
    'The top-left panel of image 1 already depicts this correct character.',
    'Preserve that identity, framing, scale, linework, lighting, and rendering style throughout this sheet;',
    'adapt only the remaining pose and expression references to the same character.',
    'Continue using image 2 as the canonical identity reference.'
  ].join(' ')
};

export function fillPrompt(template, values) {
  return template.replace(/\{([a-zA-Z]+)\}/g, (token, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : token).replace(/\s+/g, ' ').trim();
}

export const canonicalPrompt = defaultPrompts.canonical;

export function sheetPrompt(sheet, prompts = defaultPrompts) {
  return fillPrompt(prompts.sheet, {
    sheet: sheet.key.toUpperCase(), title: sheet.title,
    panelsTop: sheet.labels.slice(0, 4).join(', '),
    panelsBottom: sheet.labels.slice(4).join(', '),
    direction: prompts[`direction${sheet.key.toUpperCase()}`] ?? sheet.direction,
    anchor: sheet.key === 'a' ? '' : fillPrompt(prompts.sheetAnchor, { sheet: sheet.key.toUpperCase() })
  });
}
