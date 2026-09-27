import { describe, expect, it } from 'vitest';
import { estimateDevice, planDeviceParamCopy, summarizeScenario, validateDevice } from '../domain';
import type { EnergyScenario } from '../types';

const copyFixture: EnergyScenario = {
  id: 's', name: 'test', pricePerKwh: 1, daysPerMonth: 30, createdAt: '', devices: [
    { id: 'a', name: '空调', watts: 1200, dailyHours: 6 },
    { id: 'b', name: '冰箱', watts: 150, dailyHours: 10 },
    { id: 'c', name: '台灯', watts: 12, dailyHours: 5 },
  ],
};

describe('energy domain', () => {
  it('calculates kWh and cost from watts, hours, days and price', () => {
    const result = estimateDevice({ id: 'a', name: '空调', watts: 1000, dailyHours: 2 }, 30, 0.5);
    expect(result).toEqual({ dailyKwh: 2, monthlyKwh: 60, monthlyCost: 30 });
  });

  it('keeps device shares explainable and sums to 100%', () => {
    const scenario: EnergyScenario = { id: 's', name: 'test', pricePerKwh: 1, daysPerMonth: 30, createdAt: '', devices: [
      { id: 'a', name: 'a', watts: 100, dailyHours: 1 }, { id: 'b', name: 'b', watts: 300, dailyHours: 1 },
    ] };
    const summary = summarizeScenario(scenario);
    expect(summary.total.monthlyKwh).toBe(12);
    expect(summary.devices.map((device) => device.share)).toEqual([0.25, 0.75]);
  });

  it('rejects negative power and more than 24 hours', () => {
    expect(validateDevice({ name: 'x', watts: -1, dailyHours: 1 })).toBe('功率不能为负数');
    expect(validateDevice({ name: 'x', watts: 1, dailyHours: 24.1 })).toBe('每日使用时间不能超过 24 小时');
  });
});

describe('planDeviceParamCopy', () => {
  it('copies the selected fields to every target and leaves everything else untouched', () => {
    const plan = planDeviceParamCopy(copyFixture, 'a', ['b', 'c'], ['watts', 'dailyHours']);
    expect(plan.ok).toBe(true);
    expect(plan.devices.find((device) => device.id === 'b')).toMatchObject({ name: '冰箱', watts: 1200, dailyHours: 6 });
    expect(plan.devices.find((device) => device.id === 'c')).toMatchObject({ name: '台灯', watts: 1200, dailyHours: 6 });
    expect(plan.devices.find((device) => device.id === 'a')).toMatchObject({ watts: 1200, dailyHours: 6 });
    expect(copyFixture.devices[1].watts).toBe(150);
  });

  it('syncs only the requested fields', () => {
    const plan = planDeviceParamCopy(copyFixture, 'a', ['c'], ['dailyHours']);
    expect(plan.ok).toBe(true);
    expect(plan.devices.find((device) => device.id === 'c')).toMatchObject({ watts: 12, dailyHours: 6 });
  });

  it('rejects targets whose copied name would duplicate and keeps the original list', () => {
    const plan = planDeviceParamCopy(copyFixture, 'a', ['b', 'c'], ['name', 'watts']);
    expect(plan.ok).toBe(false);
    expect(plan.devices).toBe(copyFixture.devices);
    expect(plan.failures).toHaveLength(2);
    expect(plan.failures[0]).toMatchObject({ deviceId: 'b', deviceName: '冰箱' });
    expect(plan.failures[0].reasons.join()).toContain('重复');
  });

  it('rejects copied values that fall outside the allowed range', () => {
    const broken: EnergyScenario = { ...copyFixture, devices: [...copyFixture.devices, { id: 'd', name: '旧烤箱', watts: 800, dailyHours: 30 }] };
    const plan = planDeviceParamCopy(broken, 'd', ['b'], ['dailyHours']);
    expect(plan.ok).toBe(false);
    expect(plan.failures).toHaveLength(1);
    expect(plan.failures[0].reasons).toContain('每日使用时间不能超过 24 小时');
  });

  it('refuses to plan without a source, targets, or fields', () => {
    expect(planDeviceParamCopy(copyFixture, 'missing', ['b'], ['watts']).ok).toBe(false);
    expect(planDeviceParamCopy(copyFixture, 'a', [], ['watts']).ok).toBe(false);
    expect(planDeviceParamCopy(copyFixture, 'a', ['a'], ['watts']).ok).toBe(false);
    expect(planDeviceParamCopy(copyFixture, 'a', ['b'], []).ok).toBe(false);
  });
});
