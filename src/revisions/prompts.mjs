// Ask for a localized edit on the hidden working canvas, with supporting identity and expression references.
export function revisionPrompt({ target, rectangle, instruction, emotion, neutralReference }) {
  const { x, y, editWidth, editHeight, canvasWidth, canvasHeight } = rectangle;
  const context = target.kind === 'canonical' ? [
    'Image 2 is the uploaded character art: use it to support the same character identity.',
    'Image 3 is the canonical framing guide: preserve the target image framing, not a new composition.',
    'Keep the canonical background opaque and the expression neutral unless the requested change specifies otherwise.'
  ] : [
    'Image 2 is the approved canonical identity reference. Preserve its facial identity, hair, skin tone, outfit, rendering style, and lighting unless that specific detail is requested to change.',
    neutralReference ? 'Image 3 is the original Sheet A Neutral: use only for consistent identity and scale, not to replace the target expression.' : '',
    `Image ${neutralReference ? 4 : 3} is the ${emotion} template panel. Use only its expression and pose guidance; never copy the template character identity or clothing.`,
    `This remains the ${emotion} emotion slot. Keep the existing expression except for the requested adjustment.`,
    'Keep a transparent background with no painted backdrop, divider lines, labels, or text.'
  ];
  return [
    'Revise only the single character in image 1. Image 1 is the edit target; supporting images must not replace it.',
    `Return exactly ${canvasWidth}x${canvasHeight} pixels with the same aspect ratio as image 1. The target occupies x=${x}, y=${y}, width=${editWidth}, height=${editHeight} pixels, using a top-left origin.`,
    'Keep the character at the exact same position, scale, and framing inside that rectangle. Keep all edits inside it and preserve the surrounding padding unchanged.',
    'Do not zoom, recenter, resize the character, stretch, add a border, make a sheet, add characters, or introduce new props.',
    'Preserve all unspecified details. The requested change takes precedence only for the details it explicitly mentions.',
    ...context,
    `Requested change: ${instruction}`
  ].filter(Boolean).join(' ');
}
