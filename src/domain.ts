import type { EnergyDevice, EnergyEstimate, EnergyScenario, ScenarioSummary, SyncableDeviceField } from './types';

export const MAX_DAILY_HOURS = 24;

export const exampleScenario: EnergyScenario = {
  id: 'scenario-home',
  name: '夏日居家方案',
  pricePerKwh: 0.62,
  daysPerMonth: 30,
  createdAt: '2026-01-01T00:00:00.000Z',
  devices: [
    { id: 'device-aircon', name: '客厅空调', watts: 1200, dailyHours: 6 },
    { id: 'device-fridge', name: '冰箱', watts: 150, dailyHours: 10 },
    { id: 'device-lamp', name: '书桌台灯', watts: 12, dailyHours: 5 },
  ],
};

export function estimateDevice(device: EnergyDevice, daysPerMonth: number, pricePerKwh: number): EnergyEstimate {
  const dailyKwh = (device.watts * device.dailyHours) / 1000;
  const monthlyKwh = dailyKwh * daysPerMonth;
  return { dailyKwh, monthlyKwh, monthlyCost: monthlyKwh * pricePerKwh };
}

export function summarizeScenario(scenario: EnergyScenario): ScenarioSummary {
  const devices = scenario.devices.map((device) => ({
    ...device,
    ...estimateDevice(device, scenario.daysPerMonth, scenario.pricePerKwh),
    share: 0,
  }));
  const total = devices.reduce(
    (sum, device) => ({
      dailyKwh: sum.dailyKwh + device.dailyKwh,
      monthlyKwh: sum.monthlyKwh + device.monthlyKwh,
      monthlyCost: sum.monthlyCost + device.monthlyCost,
    }),
    { dailyKwh: 0, monthlyKwh: 0, monthlyCost: 0 },
  );
  return {
    total,
    devices: devices.map((device) => ({ ...device, share: total.monthlyKwh ? device.monthlyKwh / total.monthlyKwh : 0 })),
  };
}

export function validateDevice(device: Pick<EnergyDevice, 'name' | 'watts' | 'dailyHours'>): string | null {
  if (!device.name.trim()) return '请填写设备名称';
  if (!Number.isFinite(device.watts) || device.watts < 0) return '功率不能为负数';
  if (!Number.isFinite(device.dailyHours) || device.dailyHours < 0) return '使用时间不能为负数';
  if (device.dailyHours > MAX_DAILY_HOURS) return '每日使用时间不能超过 24 小时';
  return null;
}

export function validateScenarioSettings(pricePerKwh: number, daysPerMonth: number): string | null {
  if (!Number.isFinite(pricePerKwh) || pricePerKwh < 0) return '电价不能为负数';
  if (!Number.isFinite(daysPerMonth) || daysPerMonth < 1 || daysPerMonth > 31) return '计费天数需在 1–31 天之间';
  return null;
}

export interface DeviceSyncFailure {
  deviceId: string;
  deviceName: string;
  reason: string;
}

export type DeviceSyncPlan =
  | { ok: true; devices: EnergyDevice[] }
  | { ok: false; failures: DeviceSyncFailure[] };

/**
 * 规划一次批量应用：把 source 设备的指定字段复制到 targets。
 * 所有目标设备都通过校验才返回新数组；任一失败则返回完整失败清单，调用方不应部分应用。
 */
export function planDeviceSync(
  scenario: EnergyScenario,
  sourceId: string,
  targetIds: readonly string[],
  fields: readonly SyncableDeviceField[],
): DeviceSyncPlan {
  const source = scenario.devices.find((device) => device.id === sourceId);
  if (!source) {
    return { ok: false, failures: [{ deviceId: sourceId, deviceName: sourceId, reason: '找不到作为模板的设备' }] };
  }
  if (fields.length === 0) {
    return { ok: false, failures: [{ deviceId: sourceId, deviceName: source.name, reason: '请至少选择一项要同步的参数' }] };
  }
  const targetIdSet = new Set(targetIds.filter((id) => id !== sourceId));
  if (targetIdSet.size === 0) {
    return { ok: false, failures: [{ deviceId: sourceId, deviceName: source.name, reason: '请选择要应用到的设备' }] };
  }

  const failures = new Map<string, DeviceSyncFailure>();
  const fail = (device: EnergyDevice, reason: string) => {
    const existing = failures.get(device.id);
    if (existing) existing.reason = `${existing.reason}；${reason}`;
    else failures.set(device.id, { deviceId: device.id, deviceName: device.name.trim() || device.id, reason });
  };

  for (const id of targetIdSet) {
    if (!scenario.devices.some((device) => device.id === id)) {
      failures.set(id, { deviceId: id, deviceName: id, reason: '找不到该设备，可能已被移除' });
    }
  }

  const nextDevices = scenario.devices.map((device) => {
    if (!targetIdSet.has(device.id)) return device;
    const next = { ...device };
    for (const field of fields) {
      if (field === 'name') next.name = source.name;
      else if (field === 'watts') next.watts = source.watts;
      else next.dailyHours = source.dailyHours;
    }
    return next;
  });

  for (const device of nextDevices) {
    if (!targetIdSet.has(device.id)) continue;
    const error = validateDevice(device);
    if (error) fail(device, error);
  }

  if (fields.includes('name')) {
    for (const device of nextDevices) {
      if (!targetIdSet.has(device.id)) continue;
      const duplicated = nextDevices.some((other) => other.id !== device.id && other.name.trim() === device.name.trim());
      if (duplicated) fail(device, `名称“${device.name.trim()}”与方案内其它设备重复`);
    }
  }

  if (failures.size > 0) return { ok: false, failures: [...failures.values()] };
  return { ok: true, devices: nextDevices };
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function cloneScenario(source: EnergyScenario, id: string, name: string): EnergyScenario {
  return { ...source, id, name, createdAt: new Date().toISOString(), devices: source.devices.map((device) => ({ ...device, id: `${id}-${device.id}` })) };
}
