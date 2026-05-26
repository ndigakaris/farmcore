// ── TIER DEFINITIONS ─────────────────────────────────────────
export const TIERS = {
  trial: {
    name:        'Free Trial',
    emoji:       '🌱',
    color:       '#6B7C3A',
    animalLimit: 50,
    userLimit:   2,
    durationDays: 14,
    features: {
      animals:      true,
      production:   true,
      health:       true,
      feed:         true,
      finance:      true,
      employees:    true,
      reproduction: false,
      procurement:  false,
      assets:       false,
      crops:        false,
      calendar:     true,
      lab:          false,
      reports:      false,
      notifications:true,
      settings:     true,
      multiUser:    false,
      pdfExport:    false,
      apiAccess:    false,
    },
  },
  starter: {
    name:        'Starter',
    emoji:       '🌿',
    color:       '#2D5016',
    priceMonthly: 2500,
    priceYearly:  25000,
    animalLimit:  50,
    userLimit:    2,
    features: {
      animals:      true,
      production:   true,
      health:       true,
      feed:         true,
      finance:      true,
      employees:    true,
      reproduction: false,
      procurement:  false,
      assets:       false,
      crops:        false,
      calendar:     true,
      lab:          false,
      reports:      true,
      notifications:true,
      settings:     true,
      multiUser:    false,
      pdfExport:    true,
      apiAccess:    false,
    },
  },
  professional: {
    name:        'Professional',
    emoji:       '🌳',
    color:       '#C9A84C',
    priceMonthly: 8000,
    priceYearly:  80000,
    animalLimit:  500,
    userLimit:    10,
    features: {
      animals:      true,
      production:   true,
      health:       true,
      feed:         true,
      finance:      true,
      employees:    true,
      reproduction: true,
      procurement:  true,
      assets:       true,
      crops:        true,
      calendar:     true,
      lab:          true,
      reports:      true,
      notifications:true,
      settings:     true,
      multiUser:    true,
      pdfExport:    true,
      apiAccess:    false,
    },
  },
  enterprise: {
    name:        'Enterprise',
    emoji:       '🏆',
    color:       '#8B6340',
    priceMonthly: 25000,
    priceYearly:  250000,
    animalLimit:  Infinity,
    userLimit:    Infinity,
    features: {
      animals:      true,
      production:   true,
      health:       true,
      feed:         true,
      finance:      true,
      employees:    true,
      reproduction: true,
      procurement:  true,
      assets:       true,
      crops:        true,
      calendar:     true,
      lab:          true,
      reports:      true,
      notifications:true,
      settings:     true,
      multiUser:    true,
      pdfExport:    true,
      apiAccess:    true,
      whiteLabel:   true,
      dedicatedSupport: true,
    },
  },
};

// ── LICENSE VALIDATION ────────────────────────────────────────
export function validateLicense(license) {
  if (!license) return { valid: false, reason: 'No license found', daysLeft: 0 };

  const now = new Date();

  if (license.status === 'suspended') return { valid: false, reason: 'License suspended. Contact support.', daysLeft: 0 };
  if (license.status === 'cancelled') return { valid: false, reason: 'License cancelled.', daysLeft: 0 };

  if (license.tier === 'trial') {
    const trialEnd = new Date(license.trialEndsAt || license.trial_ends_at);
    const daysLeft = Math.ceil((trialEnd - now) / 86400000);
    if (daysLeft < 0) return { valid: false, reason: 'Trial expired. Please upgrade to continue.', daysLeft: 0 };
    return { valid: true, tier: 'trial', daysLeft, isTrialExpiringSoon: daysLeft <= 3 };
  }

  const periodEnd = new Date(license.currentPeriodEnd || license.current_period_end);
  const daysLeft  = Math.ceil((periodEnd - now) / 86400000);
  if (daysLeft < 0) return { valid: false, reason: 'Subscription expired. Please renew to continue.', daysLeft: 0 };

  return { valid: true, tier: license.tier, daysLeft, isExpiringSoon: daysLeft <= 7 };
}

// ── FEATURE CHECK ─────────────────────────────────────────────
export function canAccessFeature(license, feature) {
  if (!license) return false;
  const validation = validateLicense(license);
  if (!validation.valid) return false;
  const tier = TIERS[license.tier] || TIERS.trial;
  return !!tier.features[feature];
}

// ── ANIMAL LIMIT CHECK ────────────────────────────────────────
export function canAddAnimal(license, currentCount) {
  if (!license) return false;
  const tier = TIERS[license.tier] || TIERS.trial;
  return currentCount < (tier.animalLimit || 50);
}

// ── USER LIMIT CHECK ──────────────────────────────────────────
export function canAddUser(license, currentCount) {
  if (!license) return false;
  const tier = TIERS[license.tier] || TIERS.trial;
  return currentCount < (tier.userLimit || 2);
}

// ── DAYS REMAINING ────────────────────────────────────────────
export function getDaysRemaining(license) {
  if (!license) return 0;
  const end = new Date(license.tier === 'trial'
    ? (license.trialEndsAt || license.trial_ends_at)
    : (license.currentPeriodEnd || license.current_period_end));
  return Math.max(0, Math.ceil((end - new Date()) / 86400000));
}
