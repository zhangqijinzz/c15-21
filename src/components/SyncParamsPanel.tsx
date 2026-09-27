import { useState } from 'react';
import type { EnergyDevice, SyncableDeviceField } from '../types';

const FIELD_OPTIONS: Array<{ key: SyncableDeviceField; label: string }> = [
  { key: 'watts', label: '功率' },
  { key: 'dailyHours', label: '每日使用时长' },
  { key: 'name', label: '设备名称' },
];

interface SyncParamsPanelProps {
  source: EnergyDevice;
  targets: EnergyDevice[];
  onApply: (targetIds: string[], fields: SyncableDeviceField[]) => void;
  onClose: () => void;
}

export function SyncParamsPanel({ source, targets, onApply, onClose }: SyncParamsPanelProps) {
  const [fields, setFields] = useState<SyncableDeviceField[]>(['watts', 'dailyHours']);
  const [selected, setSelected] = useState<string[]>(targets.map((device) => device.id));

  const toggleField = (field: SyncableDeviceField) =>
    setFields((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field]);
  const toggleTarget = (id: string) =>
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const allSelected = selected.length === targets.length;

  return (
    <div className="sync-overlay" onClick={onClose}>
      <div className="sync-panel" role="dialog" aria-modal="true" aria-label="批量应用设备参数" onClick={(event) => event.stopPropagation()}>
        <h3>把「{source.name}」的参数应用到其它设备</h3>
        <p>模板参数：{source.watts} W · 每天 {source.dailyHours} 小时。应用前会逐台检查，任何一台未通过则全部保持原样。</p>

        <div className="sync-group">
          <span>要同步的参数</span>
          <div className="sync-fields">
            {FIELD_OPTIONS.map((option) => (
              <label className="sync-check" key={option.key}>
                <input type="checkbox" checked={fields.includes(option.key)} onChange={() => toggleField(option.key)} />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="sync-group">
          <span>应用到设备（已选 {selected.length} / {targets.length}）</span>
          <div className="sync-targets">
            <label className="sync-target select-all">
              <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : targets.map((device) => device.id))} />
              全选
            </label>
            {targets.map((device) => (
              <label className="sync-target" key={device.id}>
                <span><input type="checkbox" checked={selected.includes(device.id)} onChange={() => toggleTarget(device.id)} /> {device.name}</span>
                <small>{device.watts} W · {device.dailyHours} h</small>
              </label>
            ))}
          </div>
        </div>

        <div className="sync-actions">
          <button className="secondary-button" onClick={onClose}>取消</button>
          <button className="primary-button" disabled={selected.length === 0 || fields.length === 0} onClick={() => onApply(selected, fields)}>
            应用到 {selected.length} 台设备
          </button>
        </div>
      </div>
    </div>
  );
}
