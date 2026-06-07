export type BusinessMode = 'course_sales' | 'reservation_platform' | 'hybrid';

export interface BusinessModelSettings {
  mode: BusinessMode;
  onlinePackageSalesEnabled: boolean;
  manualPackageGrantEnabled: boolean;
  packagePriceDisplayEnabled: boolean;
  seatReservationFeeEnabled: boolean;
}

export const defaultBusinessModel: BusinessModelSettings = {
  mode: 'course_sales',
  onlinePackageSalesEnabled: true,
  manualPackageGrantEnabled: true,
  packagePriceDisplayEnabled: true,
  seatReservationFeeEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readMode(value: unknown): BusinessMode {
  return value === 'reservation_platform' || value === 'hybrid' || value === 'course_sales'
    ? value
    : defaultBusinessModel.mode;
}

export function normalizeBusinessModel(input: unknown): BusinessModelSettings {
  const raw = isRecord(input) ? input : {};
  const mode = readMode(raw.mode);
  const modeDefaults =
    mode === 'reservation_platform'
      ? {
          ...defaultBusinessModel,
          mode,
          onlinePackageSalesEnabled: false,
          manualPackageGrantEnabled: true,
          packagePriceDisplayEnabled: true,
          seatReservationFeeEnabled: true,
        }
      : { ...defaultBusinessModel, mode };

  return {
    mode,
    onlinePackageSalesEnabled: readBool(
      raw.onlinePackageSalesEnabled,
      modeDefaults.onlinePackageSalesEnabled,
    ),
    manualPackageGrantEnabled: readBool(
      raw.manualPackageGrantEnabled,
      modeDefaults.manualPackageGrantEnabled,
    ),
    packagePriceDisplayEnabled: readBool(
      raw.packagePriceDisplayEnabled,
      modeDefaults.packagePriceDisplayEnabled,
    ),
    seatReservationFeeEnabled: readBool(
      raw.seatReservationFeeEnabled,
      modeDefaults.seatReservationFeeEnabled,
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
  return (
    businessModel.onlinePackageSalesEnabled &&
    businessModel.mode !== 'reservation_platform' &&
    courseOnlineSalesEnabled
  );
}

export function requiresSeatReservationFee(
  businessModel: BusinessModelSettings,
  reservationFeeAmount = 0,
) {
  return businessModel.seatReservationFeeEnabled && reservationFeeAmount > 0;
}
