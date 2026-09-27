// Weighted sentiment lexicon mapping terms to sentiment scores in [-1.0, 1.0]
export const SENTIMENT_LEXICON = {
  // Strong positive terms (weight 1.0)
  'excellent': 1.0, 'perfect': 1.0, 'amazing': 1.0, 'outstanding': 1.0,
  'love': 1.0, 'fantastic': 1.0, 'wonderful': 1.0, 'brilliant': 1.0,
  // Moderate positive terms (weight 0.5)
  'good': 0.5, 'great': 0.5, 'nice': 0.5, 'helpful': 0.5, 'easy': 0.5,
  'fast': 0.5, 'positive': 0.5, 'happy': 0.5, 'satisfied': 0.5,
  // Weak positive terms (weight 0.25)
  'okay': 0.25, 'fine': 0.25, 'decent': 0.25, 'acceptable': 0.25,
  // Strong negative terms (weight -1.0)
  'terrible': -1.0, 'horrible': -1.0, 'awful': -1.0, 'disaster': -1.0,
  'hate': -1.0, 'worst': -1.0, 'atrocious': -1.0, 'unacceptable': -1.0,
  // Moderate negative terms (weight -0.5)
  'bad': -0.5, 'poor': -0.5, 'slow': -0.5, 'broken': -0.5, 'frustrating': -0.5,
  'disappointing': -0.5, 'problem': -0.5, 'issue': -0.5, 'delay': -0.5,
  // Weak negative terms (weight -0.25)
  'meh': -0.25, 'lacking': -0.25, 'subpar': -0.25, 'inconvenient': -0.25
};

// Negation terms that flip sentiment polarity
export const NEGATION_TERMS = ['not', 'no', 'never', 'neither', 'nor', 'hardly', 'barely', 'without', 'lack', 'lacks', 'lacking'];

// Intensifier terms that amplify or dampen sentiment
export const INTENSIFIERS = {
  'very': 1.5, 'really': 1.5, 'extremely': 2.0, 'absolutely': 2.0,
  'incredibly': 2.0, 'so': 1.3, 'quite': 1.2, 'rather': 1.2,
  'somewhat': 0.7, 'slightly': 0.6, 'a bit': 0.6, 'a little': 0.6
};

// Expanded aspect keyword mapping
export const ASPECT_KEYWORDS = {
  checkout: ['checkout', 'payment', 'pay', 'cart', 'card', 'billing', 'purchase', 'transaction'],
  delivery: ['delivery', 'shipping', 'ship', 'arrival', 'package', 'late', 'delay', 'tracking', 'courier', 'dispatch'],
  'product quality': ['quality', 'defect', 'broken', 'packaging', 'material', 'durable', 'durability', 'faulty', 'damaged', 'condition'],
  'customer support': ['support', 'customer service', 'agent', 'helpdesk', 'helpline', 'representative', 'assistance', 'response time'],
  'store experience': ['store', 'location', 'staff', 'line', 'wait', 'queue', 'cleanliness', 'ambience', 'atmosphere', 'parking'],
  price: ['price', 'cost', 'expensive', 'cheap', 'affordable', 'value', 'pricing', 'fee', 'charge'],
  app: ['app', 'mobile', 'website', 'online', 'interface', 'ui', 'ux', 'navigation', 'login', 'crash', 'bug'],
  returns: ['return', 'refund', 'exchange', 'replacement', 'warranty', 'guarantee']
};