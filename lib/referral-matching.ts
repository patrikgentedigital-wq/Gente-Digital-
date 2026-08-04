export type CollaboratorReference = {
  id: string;
  name: string;
};

export function normalizeReferralText(value: string | null | undefined) {
  return value
    ? value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    : '';
}

/**
 * Resolves a referral to one official collaborator when the match is unambiguous.
 * This also handles older forms that stored a shortened version of the name.
 */
export function matchCollaboratorReference(
  reference: string | null | undefined,
  collaborators: CollaboratorReference[],
) {
  const normalizedReference = normalizeReferralText(reference);
  if (!normalizedReference || normalizedReference === 'organico' || normalizedReference === 'nao especificado') {
    return null;
  }

  const exactMatches = collaborators.filter((collaborator) => {
    const normalizedId = normalizeReferralText(collaborator.id);
    const normalizedName = normalizeReferralText(collaborator.name);
    return normalizedReference === normalizedId || normalizedReference === normalizedName;
  });

  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;

  const shortenedNameMatches = collaborators.filter((collaborator) => {
    const normalizedName = normalizeReferralText(collaborator.name);
    return normalizedName.startsWith(`${normalizedReference} `) || normalizedReference.startsWith(`${normalizedName} `);
  });

  return shortenedNameMatches.length === 1 ? shortenedNameMatches[0] : null;
}
