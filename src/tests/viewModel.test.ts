import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../domain';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; save: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  return { data, load: () => structuredClone(data), save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; }) };
}

describe('EnergyLensViewModel', () => {
  let repository: ReturnType<typeof makeRepository>;
  let vm: EnergyLensViewModel;
  beforeEach(() => { repository = makeRepository(); vm = new EnergyLensViewModel(repository); vm.initialize(); });

  it('initializes, persists edits, and recalculates results', () => {
    expect(vm.getState().status).toBe('ready');
    const before = vm.activeSummary?.total.monthlyKwh;
    vm.updateDevice('device-aircon', { dailyHours: 2 });
    expect(vm.activeSummary?.total.monthlyKwh).toBeLessThan(before ?? Infinity);
    expect(repository.save).toHaveBeenCalled();
  });

  it('keeps invalid values out of the document and exposes an error notice', () => {
    vm.updateDevice('device-aircon', { watts: -50 });
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toBe('功率不能为负数');
    expect(vm.activeScenario?.devices[0].watts).toBe(1200);
  });

  it('duplicates a scenario and can recover a saved document', () => {
    vm.duplicateActive();
    expect(vm.getState().document?.scenarios).toHaveLength(2);
    const recovered = new EnergyLensViewModel(repository);
    recovered.initialize();
    expect(recovered.getState().document?.scenarios).toHaveLength(2);
  });

  it('surfaces persistence failure as a recoverable error', () => {
    repository.save.mockImplementation(() => { throw new Error('quota'); });
    vm.addDevice();
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toContain('保存失败');
  });

  it('applies a tuned device to other devices and recalculates totals and shares', () => {
    const before = vm.activeSummary?.total.monthlyKwh ?? 0;
    vm.copyDeviceParams('device-aircon', ['device-fridge', 'device-lamp'], ['watts', 'dailyHours']);
    const devices = vm.activeScenario?.devices ?? [];
    expect(devices.find((device) => device.id === 'device-fridge')).toMatchObject({ name: '冰箱', watts: 1200, dailyHours: 6 });
    expect(devices.find((device) => device.id === 'device-lamp')).toMatchObject({ name: '书桌台灯', watts: 1200, dailyHours: 6 });
    expect(vm.activeSummary?.total.monthlyKwh).toBeGreaterThan(before);
    vm.activeSummary?.devices.forEach((device) => expect(device.share).toBeCloseTo(1 / 3));
    expect(vm.getState().canUndo).toBe(true);
    expect(repository.save).toHaveBeenCalled();
  });

  it('syncs only the selected fields', () => {
    vm.copyDeviceParams('device-aircon', ['device-lamp'], ['dailyHours']);
    const lamp = vm.activeScenario?.devices.find((device) => device.id === 'device-lamp');
    expect(lamp).toMatchObject({ name: '书桌台灯', watts: 12, dailyHours: 6 });
  });

  it('rejects the whole copy when a name would duplicate and lists the blocked devices', () => {
    vm.copyDeviceParams('device-aircon', ['device-fridge', 'device-lamp'], ['name', 'watts']);
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.details).toHaveLength(2);
    expect(vm.getState().notice?.details?.[0]).toContain('冰箱');
    expect(vm.getState().notice?.details?.[0]).toContain('重复');
    expect(vm.getState().notice?.details?.[1]).toContain('书桌台灯');
    const devices = vm.activeScenario?.devices ?? [];
    expect(devices.find((device) => device.id === 'device-fridge')).toMatchObject({ name: '冰箱', watts: 150 });
    expect(devices.find((device) => device.id === 'device-lamp')).toMatchObject({ name: '书桌台灯', watts: 12 });
    expect(vm.getState().canUndo).toBe(false);
  });

  it('rejects out-of-range copied values without touching the document', () => {
    repository.data.scenarios[0].devices.push({ id: 'device-broken', name: '旧烤箱', watts: 800, dailyHours: 30 });
    const brokenVm = new EnergyLensViewModel(repository);
    brokenVm.initialize();
    brokenVm.copyDeviceParams('device-broken', ['device-fridge'], ['dailyHours']);
    expect(brokenVm.getState().status).toBe('error');
    expect(brokenVm.getState().notice?.details?.[0]).toContain('冰箱');
    expect(brokenVm.getState().notice?.details?.[0]).toContain('24');
    expect(brokenVm.activeScenario?.devices.find((device) => device.id === 'device-fridge')?.dailyHours).toBe(10);
  });

  it('asks for targets and fields instead of copying nothing silently', () => {
    vm.copyDeviceParams('device-aircon', ['device-fridge'], []);
    expect(vm.getState().notice?.kind).toBe('info');
    vm.copyDeviceParams('device-aircon', [], ['watts']);
    expect(vm.getState().notice?.kind).toBe('info');
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-fridge')?.watts).toBe(150);
  });

  it('undoes a batch copy and restores the previous totals', () => {
    const before = vm.activeSummary?.total.monthlyKwh ?? 0;
    vm.copyDeviceParams('device-aircon', ['device-fridge', 'device-lamp'], ['watts', 'dailyHours']);
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-fridge')?.watts).toBe(1200);
    vm.undo();
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-fridge')?.watts).toBe(150);
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-lamp')?.watts).toBe(12);
    expect(vm.activeSummary?.total.monthlyKwh).toBeCloseTo(before);
    expect(vm.getState().canUndo).toBe(false);
    expect(vm.getState().notice?.text).toContain('撤回');
  });
});
