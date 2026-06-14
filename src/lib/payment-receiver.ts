export function resolvePaymentReceiverName(input: {
  paymentReceiverType?: string | null;
  receiverInstitutionName?: string | null;
  providerInstitutionName?: string | null;
  legacyDisplayName?: string | null;
  organizationBrandName?: string | null;
  organizationName: string;
}) {
  const institutionName = input.receiverInstitutionName?.trim();
  if (institutionName) return institutionName;

  if (input.paymentReceiverType === 'provider') {
    const providerName = input.providerInstitutionName?.trim();
    if (providerName) return providerName;
  }

  return (
    input.legacyDisplayName?.trim() ||
    input.organizationBrandName?.trim() ||
    input.organizationName.trim() ||
    '平台'
  );
}
