// The four expression groups, ordered exactly as their bundled 4-by-2 reference templates.
export function validateTemplateSet(value = 'fem') {
  if (!['fem', 'masc'].includes(value)) {
    throw Error('Choose Fem or Masc templates.');
  }
  return value;
}

export function templatePath(templateSet, number) {
  return `full/${validateTemplateSet(templateSet)}/${number}.png`;
}

export function templateSetName(value = 'fem') {
  return value === 'masc' ? 'Masc templates' : 'Fem templates';
}

export const definitions = [
  {
    key: 'a',
    number: 1,
    title: 'Positive / energetic / social',
    labels: ['Neutral', 'Joy', 'Amusement', 'Excitement', 'Admiration', 'Approval', 'Gratitude', 'Pride'],
    direction: 'Use outward, readable expressions with distinct intensity and mouth and eye shapes.'
  },
  {
    key: 'b',
    number: 2,
    title: 'Warm / affectionate / hopeful',
    labels: ['Neutral', 'Love', 'Caring', 'Desire', 'Optimism', 'Relief', 'Curiosity', 'Realization'],
    direction: 'Use soft, subtle, face-driven differences rather than huge pose changes.'
  },
  {
    key: 'c',
    number: 3,
    title: 'Negative / aversive / judgmental',
    labels: ['Neutral', 'Anger', 'Annoyance', 'Disapproval', 'Disgust', 'Disappointment', 'Confusion', 'Surprise'],
    direction: 'Clearly differentiate expressions through brows, mouth shape, gaze, and head posture.'
  },
  {
    key: 'd',
    number: 4,
    title: 'Vulnerable / distressed / self-conscious',
    labels: ['Neutral', 'Sadness', 'Fear', 'Nervousness', 'Embarrassment', 'Grief', 'Remorse', 'Spare slot'],
    direction: 'Use lower-energy, vulnerable expressions. Keep the spare slot as an additional neutral character pose, without inventing a named emotion.'
  }
];
