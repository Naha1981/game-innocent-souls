export const LAUNCH_OFFER = {
  id: 'hero',
  priceCents: 49900,
  priceLabel: 'R499',
  headline: 'Turn your child into their own game.',
  subheadline: 'One photo. One adventure. One game they can share with family.',
} as const;

export const CHAPTER_OFFER = {
  id: 'chapter',
  priceCents: 10000,
  priceLabel: 'R100',
  headline: 'Add another chapter to your child’s story.',
  examples: ['new age', 'new outfit', 'new sport', 'birthday edition', 'school milestone'],
} as const;
