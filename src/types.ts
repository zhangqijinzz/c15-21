export interface EnergyDevice {
  id: string;
  name: string;
  watts: number;
  dailyHours: number;
}

export interface EnergyScenario {
  id: string;
  name: string;
  pricePerKwh: number;
  daysPerMonth: number;
  devices: EnergyDevice[];
  createdAt: string;
}

export interface EnergyDocument {
  version: 1;
  scenarios: EnergyScenario[];
  activeScenarioId: string;
}

export type ViewStatus = 'loading' | 'ready' | 'editing' | 'error' | 'completed';

export interface Notice {
  kind: 'success' | 'error' | 'info';
  text: string;
  details?: string[];
}

export type DeviceParamField = 'name' | 'watts' | 'dailyHours';

export interface DeviceCopyFailure {
  deviceId: string;
  deviceName: string;
  reasons: string[];
}

export interface DeviceCopyPlan {
  ok: boolean;
  devices: EnergyDevice[];
  failures: DeviceCopyFailure[];
}

export interface EnergyEstimate {
  dailyKwh: number;
  monthlyKwh: number;
  monthlyCost: number;
}

export interface ScenarioSummary {
  total: EnergyEstimate;
  devices: Array<EnergyDevice & EnergyEstimate & { share: number }>;
}
