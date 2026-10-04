// Provider-independent instructions for character identity, framing, and expression sheets.
// Each paragraph is separate so artists can adjust the instructions without reading one long line.
export const canonicalPrompt = [
  'Create a canonical character reference.',
  'Use image 1 (canonreference.png) as the reference for pose, framing, composition, and presentation.',
  'Use image 2 as the character identity reference: preserve its facial features, hair, skin tone, clothing, and defining details.',
  'Depict only this character with clean, consistent details and an opaque background matching image 1.',
  'No text, extra characters, or added props. This image will be the identity reference for future emotion sheets.'
].join(' ');

export function sheetPrompt(sheet) {
  const sharedAnchor = sheet.key !== 'a' ? [
    'Image 4 is the single shared Neutral anchor cropped from generated Sheet A.',
    'The top-left panel of image 1 already depicts this correct character.',
    'Preserve that identity, framing, scale, linework, lighting, and rendering style throughout this sheet;',
    'adapt only the remaining pose and expression references to the same character.',
    'Continue using image 2 as the canonical identity reference.'
  ].join(' ') : '';
  return [
    'Create one 4:3 emotional character sprite sheet with exactly four equal columns and two equal rows.',
    `Image 1 is the expression, pose, framing, style, and panel layout reference for Sheet ${sheet.key.toUpperCase()} (${sheet.title}).`,
    'Image 2 is the confirmed canonical character identity: preserve its hair, facial features, skin tone, clothing, proportions, and defining details in every panel and across every sheet.',
    "Do not copy the template character's identity or outfit. Image 3 is the exact grid guide.",
    sharedAnchor,
    'Preserve straight grid lines at 25%, 50%, and 75% of the width and 50% of the height; do not merge or rearrange panels.',
    `Panel order, left to right: ${sheet.labels.slice(0, 4).join(', ')}; then ${sheet.labels.slice(4).join(', ')}.`,
    sheet.direction,
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
  ].filter(Boolean).join(' ');
}
