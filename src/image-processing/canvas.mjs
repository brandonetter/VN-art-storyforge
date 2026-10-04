// Use browser Canvas for PNG normalization, proportional resizing, panel crops, and Neutral anchoring.
// Every image remains local except the references explicitly sent to the selected AI provider.
function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) {
    throw Error('This browser cannot process images with Canvas.');
  }
  return { element, context };
}

function png(element) {
  return new Promise((resolve, reject) => element.toBlob(blob => blob ? resolve(blob) : reject(Error('Unable to encode PNG.')), 'image/png'));
}

export async function dimensions(blob) {
  const image = await createImageBitmap(blob);
  try {
    return { width: image.width, height: image.height };
  } finally {
    image.close();
  }
}

export function fitDimensions(width, height, maxWidth, maxHeight, enlarge = false) {
  const scale = Math.min(maxWidth / width, maxHeight / height, enlarge ? Infinity : 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function normalize(blob, maxWidth = Infinity, maxHeight = Infinity, opaque = false) {
  const image = await createImageBitmap(blob);
  try {
    const size = fitDimensions(image.width, image.height, maxWidth, maxHeight);
    const { element, context } = canvas(size.width, size.height);
    if (opaque) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(image, 0, 0, size.width, size.height);
    return await png(element);
  } finally {
    image.close();
  }
}

export function panelBounds(width, height, index) {
  const insetX = Math.max(2, Math.round(width / 724)), insetY = Math.max(2, Math.round(height / 543));
  const col = index % 4, row = Math.floor(index / 4);
  const x = Math.round(col * width / 4) + insetX, y = Math.round(row * height / 2) + insetY;
  const cropWidth = Math.round((col + 1) * width / 4) - x - insetX;
  const cropHeight = Math.round((row + 1) * height / 2) - y - insetY;
  if (cropWidth < 1 || cropHeight < 1) {
    throw Error('Generated sheet is too small to crop.');
  }
  return { x, y, width: cropWidth, height: cropHeight };
}

export async function crop(blob, index) {
  const image = await createImageBitmap(blob);
  try {
    const bounds = panelBounds(image.width, image.height, index);
    const { element, context } = canvas(bounds.width, bounds.height);
    context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    return await png(element);
  } finally {
    image.close();
  }
}

export async function anchor(template, neutral) {
  const image = await createImageBitmap(template);
  let pose;
  try {
    pose = await createImageBitmap(neutral);
    const { element, context } = canvas(image.width, image.height);
    context.drawImage(image, 0, 0);
    const bounds = panelBounds(image.width, image.height, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    const size = fitDimensions(pose.width, pose.height, bounds.width, bounds.height, true);
    context.drawImage(pose, bounds.x + (bounds.width - size.width) / 2, bounds.y + (bounds.height - size.height) / 2, size.width, size.height);
    return await png(element);
  } finally {
    image.close();
    pose?.close();
  }
}

export function revisionGeometry(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw Error('The image has invalid dimensions.');
  }
  const paddedWidth = Math.max(width, height / 3);
  const paddedHeight = Math.max(height, width / 3);
  const scale = Math.max(1, Math.sqrt(655360 / (paddedWidth * paddedHeight)));
  let canvasWidth = Math.ceil(paddedWidth * scale / 16) * 16;
  let canvasHeight = Math.ceil(paddedHeight * scale / 16) * 16;
  // Rounding can push a 3:1 canvas just outside the provider's ratio limit.
  canvasWidth = Math.max(canvasWidth, Math.ceil(canvasHeight / 3 / 16) * 16);
  canvasHeight = Math.max(canvasHeight, Math.ceil(canvasWidth / 3 / 16) * 16);
  const ratio = canvasWidth / canvasHeight;
  if (canvasWidth > 3840 || canvasHeight > 3840 || canvasWidth * canvasHeight > 8294400 || ratio < 1 / 3 || ratio > 3) {
    throw Error('This image cannot fit a supported revision canvas without scaling.');
  }
  // Fill the working canvas so the model edits the same framing it returns.
  // Keeping a small, unscaled cutout in large padding invites a zoomed/recentered
  // response that would be clipped when extracting the original rectangle.
  const fitted = fitDimensions(width, height, canvasWidth, canvasHeight, true);
  return {
    canvasWidth, canvasHeight, width, height,
    editWidth: fitted.width, editHeight: fitted.height,
    x: Math.floor((canvasWidth - fitted.width) / 2),
    y: Math.floor((canvasHeight - fitted.height) / 2)
  };
}

export async function createWorkingImage(blob, opaque) {
  const image = await createImageBitmap(blob);
  try {
    const rectangle = revisionGeometry(image.width, image.height);
    const { element, context } = canvas(rectangle.canvasWidth, rectangle.canvasHeight);
    if (opaque) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, element.width, element.height);
    }
    context.drawImage(image, rectangle.x, rectangle.y, rectangle.editWidth, rectangle.editHeight);
    return { image: await png(element), rectangle };
  } finally {
    image.close();
  }
}

export async function extractRevision(blob, rectangle, opaque) {
  const image = await createImageBitmap(blob);
  try {
    // Providers can return the requested composition at a different resolution.
    // Map the edit bounds proportionally rather than using input pixel offsets.
    // Allow minor aspect rounding, but reject a different composition to avoid
    // silently stretching or cropping a portrait into a square/landscape image.
    const scaleX = image.width / rectangle.canvasWidth;
    const scaleY = image.height / rectangle.canvasHeight;
    if (Math.abs(scaleX / scaleY - 1) > 0.02) {
      throw Error('The provider changed the revision canvas aspect ratio. Your original image is unchanged; try again.');
    }
    const { element, context } = canvas(rectangle.width, rectangle.height);
    if (opaque) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, element.width, element.height);
    }
    context.drawImage(image, rectangle.x * scaleX, rectangle.y * scaleY,
      rectangle.editWidth * scaleX, rectangle.editHeight * scaleY,
      0, 0, rectangle.width, rectangle.height);
    return await png(element);
  } finally {
    image.close();
  }
}
