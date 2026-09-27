import { useState } from 'react';
import type { DeviceParamField, EnergyDevice } from '../types';

interface BatchCopyPanelProps {
  devices: EnergyDevice[];
  onApply: (sourceId: string, targetIds: string[], fields: DeviceParamField[]) => void;
}

const FIELD_OPTIONS: Array<{ key: DeviceParamField; label: string }> = [
  { key: 'watts', label: '功率' },
  { key: 'dailyHours', label: '每日时长' },
  { key: 'name', label: '设备名称' },
];

export function BatchCopyPanel({ devices, onApply }: BatchCopyPanelProps) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [fields, setFields] = useState<DeviceParamField[]>(['watts', 'dailyHours']);
  const [picked, setPicked] = useState<string[] | null>(null);

  const source = devices.find((device) => device.id === sourceId) ?? devices[0];
  const others = devices.filter((device) => device.id !== source?.id);
  const targets = picked === null ? others.map((device) => device.id) : picked.filter((id) => others.some((device) => device.id === id));

  if (!source || others.length === 0) return null;

  const selectSource = (id: string) => { setSourceId(id); setPicked(null); };
  const toggleField = (key: DeviceParamField) => setFields((current) => current.includes(key) ? current.filter((field) => field !== key) : [...current, key]);
  const toggleTarget = (id: string) => setPicked(targets.includes(id) ? targets.filter((target) => target !== id) : [...targets, id]);
  const allSelected = targets.length === others.length;

  return (
    <section className="batch-copy" aria-label="批量应用设备参数">
      <div className="batch-copy-head"><strong>批量应用</strong><p>把「{source.name}」的参数一次同步给其它设备</p></div>
      <div className="batch-copy-row">
        <label className="batch-source"><span>从</span>
          <select value={source.id} onChange={(event) => selectSource(event.target.value)}>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
        </label>
        <div className="batch-fields"><span>同步</span>
          {FIELD_OPTIONS.map((option) => (
            <label key={option.key}><input type="checkbox" checked={fields.includes(option.key)} onChange={() => toggleField(option.key)} />{option.label}</label>
          ))}
        </div>
      </div>
      <div className="batch-targets">
        <div className="batch-targets-head"><span>应用到（已选 {targets.length} / {others.length} 台）</span>
          <button type="button" className="batch-toggle-all" onClick={() => setPicked(allSelected ? [] : others.map((device) => device.id))}>{allSelected ? '全不选' : '全选'}</button>
        </div>
        <div className="batch-chips">
          {others.map((device) => (
            <button type="button" key={device.id} aria-pressed={targets.includes(device.id)} className={`batch-chip ${targets.includes(device.id) ? 'selected' : ''}`} onClick={() => toggleTarget(device.id)}>{device.name}</button>
          ))}
        </div>
      </div>
      <button type="button" className="batch-apply" onClick={() => onApply(source.id, targets, fields)}>应用到 {targets.length} 台设备</button>
    </section>
  );
}
