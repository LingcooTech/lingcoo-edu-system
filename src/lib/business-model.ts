export interface BusinessModelSettings {
  onlinePackageSalesEnabled: boolean;
  manualPackageGrantEnabled: boolean;
  packagePriceDisplayEnabled: boolean;
  seatReservationFeeEnabled: boolean;
  courseContractEditEnabled: boolean;
}

export const defaultBusinessModel: BusinessModelSettings = {
  onlinePackageSalesEnabled: true,
  manualPackageGrantEnabled: true,
  packagePriceDisplayEnabled: true,
  seatReservationFeeEnabled: false,
  courseContractEditEnabled: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeBusinessModel(input: unknown): BusinessModelSettings {
  const raw = isRecord(input) ? input : {};
  // Legacy settings written before the switch-only model used mode to imply
  // defaults. Keep that fallback so old reservation-platform configs do not
  // accidentally enable online package sales after upgrade.
  const fallback =
    raw.mode === 'reservation_platform'
      ? {
          ...defaultBusinessModel,
          onlinePackageSalesEnabled: false,
          manualPackageGrantEnabled: true,
          packagePriceDisplayEnabled: true,
          seatReservationFeeEnabled: true,
        }
      : defaultBusinessModel;

  return {
    onlinePackageSalesEnabled: readBool(
      raw.onlinePackageSalesEnabled,
      fallback.onlinePackageSalesEnabled,
    ),
    manualPackageGrantEnabled: readBool(
      raw.manualPackageGrantEnabled,
      fallback.manualPackageGrantEnabled,
    ),
    packagePriceDisplayEnabled: readBool(
      raw.packagePriceDisplayEnabled,
      fallback.packagePriceDisplayEnabled,
    ),
    seatReservationFeeEnabled: readBool(
      raw.seatReservationFeeEnabled,
      fallback.seatReservationFeeEnabled,
    ),
    courseContractEditEnabled: readBool(
      raw.courseContractEditEnabled,
      fallback.courseContractEditEnabled,
    ),
  };
}

export function readBusinessModel(settings: unknown): BusinessModelSettings {
  const raw = isRecord(settings) ? settings.businessModel : undefined;
  return normalizeBusinessModel(raw);
}

export function mergeBusinessModel(settings: unknown, businessModel: BusinessModelSettings) {
  return {
    ...(isRecord(settings) ? settings : {}),
    businessModel,
  };
}

export function canUseOnlinePackageSales(
  businessModel: BusinessModelSettings,
  courseOnlineSalesEnabled = true,
) {
  return businessModel.onlinePackageSalesEnabled && courseOnlineSalesEnabled;
}

export function requiresSeatReservationFee(
  businessModel: BusinessModelSettings,
  reservationFeeAmount = 0,
) {
  return businessModel.seatReservationFeeEnabled && reservationFeeAmount > 0;
}
