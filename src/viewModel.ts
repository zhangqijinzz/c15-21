import { cloneScenario, planDeviceSync, summarizeScenario, validateDevice, validateScenarioSettings } from './domain';
import { findScenario, type EnergyRepository } from './repository';
import type { EnergyDevice, EnergyDocument, EnergyScenario, Notice, SyncableDeviceField, ViewStatus } from './types';

export interface EnergyLensState {
  document: EnergyDocument | null;
  status: ViewStatus;
  notice: Notice | null;
  canUndo: boolean;
}

type Listener = (state: EnergyLensState) => void;

export class EnergyLensViewModel {
  private state: EnergyLensState = { document: null, status: 'loading', notice: null, canUndo: false };
  private readonly listeners = new Set<Listener>();
  private undoSnapshot: EnergyDocument | null = null;

  constructor(private readonly repository: EnergyRepository) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): EnergyLensState { return this.state; }

  initialize(): void {
    try {
      this.state = { document: this.repository.load(), status: 'ready', notice: null, canUndo: false };
    } catch {
      this.state = { document: null, status: 'error', notice: { kind: 'error', text: '本地数据读取失败，请刷新重试' }, canUndo: false };
    }
    this.emit();
  }

  get activeScenario(): EnergyScenario | null {
    if (!this.state.document) return null;
    return findScenario(this.state.document, this.state.document.activeScenarioId) ?? null;
  }

  get activeSummary() {
    return this.activeScenario ? summarizeScenario(this.activeScenario) : null;
  }

  updateDevice(deviceId: string, patch: Partial<Pick<EnergyDevice, 'name' | 'watts' | 'dailyHours'>>): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const device = scenario.devices.find((item) => item.id === deviceId);
    if (!device) return;
    const next = { ...device, ...patch };
    const error = validateDevice(next);
    if (error) {
      this.setNotice({ kind: 'error', text: error });
      return;
    }
    this.commit((current) => ({ ...current, devices: current.devices.map((item) => item.id === deviceId ? next : item) }), '参数已更新');
  }

  /**
   * 把 source 设备的指定参数批量应用到同方案的其它设备。
   * 任一目标校验失败则整体不应用，并通过 notice.details 列出每台失败设备的原因。
   */
  syncDeviceParams(sourceId: string, targetIds: string[], fields: SyncableDeviceField[]): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const plan = planDeviceSync(scenario, sourceId, targetIds, fields);
    if (!plan.ok) {
      this.setNotice({
        kind: 'error',
        text: `批量应用未执行：${plan.failures.length} 台设备未通过检查，所有设备保持原样`,
        details: plan.failures.map((failure) => `${failure.deviceName}：${failure.reason}`),
      });
      return;
    }
    const count = targetIds.filter((id) => id !== sourceId).length;
    this.commit((current) => ({ ...current, devices: plan.devices }), `已把参数应用到 ${count} 台设备`, { recordUndo: true });
  }

  undo(): void {
    const snapshot = this.undoSnapshot;
    if (!snapshot) return;
    this.undoSnapshot = null;
    this.persist(snapshot, '已撤回上一步批量应用，设备参数已还原');
  }

  addDevice(): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const device: EnergyDevice = { id: `device-${Date.now()}`, name: '新设备', watts: 100, dailyHours: 1 };
    this.commit((current) => ({ ...current, devices: [...current.devices, device] }), '已添加设备，可继续修改参数');
  }

  removeDevice(deviceId: string): void {
    const scenario = this.activeScenario;
    if (!scenario || scenario.devices.length <= 1) {
      this.setNotice({ kind: 'info', text: '至少保留一个设备，便于计算方案' });
      return;
    }
    this.commit((current) => ({ ...current, devices: current.devices.filter((item) => item.id !== deviceId) }), '设备已移除');
  }

  updateSettings(patch: Partial<Pick<EnergyScenario, 'name' | 'pricePerKwh' | 'daysPerMonth'>>): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const next = { ...scenario, ...patch };
    const error = validateScenarioSettings(next.pricePerKwh, next.daysPerMonth);
    if (error) {
      this.setNotice({ kind: 'error', text: error });
      return;
    }
    this.commit((current) => ({ ...current, name: next.name.trim() || '未命名方案', pricePerKwh: next.pricePerKwh, daysPerMonth: next.daysPerMonth }), '计费参数已更新');
  }

  duplicateActive(): void {
    const source = this.activeScenario;
    if (!source || !this.state.document) return;
    const id = `scenario-${Date.now()}`;
    const copy = cloneScenario(source, id, `${source.name} · 副本`);
    const document = { ...this.state.document, scenarios: [...this.state.document.scenarios, copy], activeScenarioId: id };
    this.persist(document, '方案已复制，现在可以修改副本');
  }

  selectScenario(id: string): void {
    if (!this.state.document || !findScenario(this.state.document, id)) return;
    this.persist({ ...this.state.document, activeScenarioId: id }, '已切换方案');
  }

  complete(): void {
    this.state = { ...this.state, status: 'completed', notice: { kind: 'success', text: '本次推演已保存，可随时回来继续调整' } };
    this.emit();
  }

  private commit(update: (scenario: EnergyScenario) => EnergyScenario, notice: string, options?: { recordUndo?: boolean }): void {
    if (!this.state.document) return;
    const previous = this.state.document;
    const document = { ...previous, scenarios: previous.scenarios.map((scenario) => scenario.id === previous.activeScenarioId ? update(scenario) : scenario) };
    this.persist(document, notice, options?.recordUndo ? structuredClone(previous) : undefined);
  }

  private persist(document: EnergyDocument, notice: string, undoSnapshot?: EnergyDocument): void {
    try {
      this.repository.save(document);
      this.undoSnapshot = undoSnapshot ?? null;
      this.state = { document, status: 'editing', notice: { kind: 'success', text: notice }, canUndo: this.undoSnapshot !== null };
    } catch {
      this.state = { ...this.state, status: 'error', notice: { kind: 'error', text: '保存失败，当前页面仍可继续编辑' } };
    }
    this.emit();
  }

  private setNotice(notice: Notice): void {
    this.state = { ...this.state, status: notice.kind === 'error' ? 'error' : 'editing', notice, canUndo: this.undoSnapshot !== null };
    this.emit();
  }

  private emit(): void { this.listeners.forEach((listener) => listener(this.state)); }
}
