import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../domain';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; save: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  return { data, load: () => data, save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; }) };
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

  it('applies params to selected devices, refreshes totals and can be undone', () => {
    const before = vm.activeSummary?.total.monthlyKwh ?? 0;
    vm.syncDeviceParams('device-aircon', ['device-fridge', 'device-lamp'], ['watts', 'dailyHours']);
    expect(vm.activeScenario?.devices.every((device) => device.watts === 1200 && device.dailyHours === 6)).toBe(true);
    expect(vm.activeSummary?.total.monthlyKwh).toBeGreaterThan(before);
    expect(vm.activeSummary?.devices.map((device) => device.share).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(vm.getState().canUndo).toBe(true);

    vm.undo();
    expect(vm.getState().canUndo).toBe(false);
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-fridge')).toMatchObject({ watts: 150, dailyHours: 10 });
    expect(vm.activeSummary?.total.monthlyKwh).toBeCloseTo(before);
  });

  it('applies nothing and lists every failure when any device is rejected', () => {
    const before = vm.activeScenario?.devices;
    vm.syncDeviceParams('device-aircon', ['device-fridge', 'device-lamp'], ['name']);
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.details).toHaveLength(2);
    expect(vm.getState().notice?.details?.[0]).toContain('重复');
    expect(vm.activeScenario?.devices).toEqual(before);
    expect(vm.getState().canUndo).toBe(false);
  });

  it('clears the undo snapshot when a normal edit follows a sync', () => {
    vm.syncDeviceParams('device-aircon', ['device-fridge'], ['watts']);
    expect(vm.getState().canUndo).toBe(true);
    vm.updateDevice('device-lamp', { dailyHours: 3 });
    expect(vm.getState().canUndo).toBe(false);
    vm.undo();
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-fridge')?.watts).toBe(1200);
  });
});
