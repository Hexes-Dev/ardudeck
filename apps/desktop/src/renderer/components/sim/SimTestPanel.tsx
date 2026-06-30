/**
 * SimTestPanel — live SITL test injection via SIM_* parameters.
 *
 * Standard ArduPilot SITL exposes a large set of SIM_* parameters that perturb
 * the simulation in real time (wind, sensor/actuator failures). These are set
 * over MAVLink PARAM_SET, so real failsafes fire on the real flight code and the
 * result is visible on the telemetry/map screen. No custom physics engine.
 */
import { useCallback, useRef, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';

const PARAM_REAL32 = 9;

export default function SimTestPanel() {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const [open, setOpen] = useState(false);

  // Weather
  const [windSpd, setWindSpd] = useState(0);
  const [windDir, setWindDir] = useState(0);
  const [windTurb, setWindTurb] = useState(0);
  // Failures
  const [battV, setBattV] = useState(16.8);
  const [gpsOn, setGpsOn] = useState(true);
  const [motorFail, setMotorFail] = useState(false);
  const [rcFail, setRcFail] = useState(false);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setParam = useCallback((paramId: string, value: number, debounce = 0) => {
    const fire = () => void window.electronAPI?.setParameter?.(paramId, value, PARAM_REAL32);
    if (debounce <= 0) { fire(); return; }
    clearTimeout(timers.current[paramId]);
    timers.current[paramId] = setTimeout(fire, debounce);
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-tip="Inject wind and failures into SITL (SIM_* params)"
        className="absolute top-14 left-3 z-10 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-subtle text-content-secondary hover:text-content shadow-lg"
      >
        Test Conditions
      </button>
    );
  }

  const row = 'flex items-center justify-between gap-3 text-xs';
  const slider = 'flex-1 accent-sky-500';

  return (
    <div className="absolute top-14 left-3 z-10 w-72 bg-surface-overlay backdrop-blur-sm border border-subtle rounded-xl shadow-xl text-content">
      <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
        <span className="text-sm font-semibold">Test Conditions</span>
        <button onClick={() => setOpen(false)} className="text-content-tertiary hover:text-content text-xs">✕</button>
      </div>

      <div className="p-3 space-y-3">
        {!isConnected && (
          <div className="text-[11px] text-amber-400">Connect to SITL to apply.</div>
        )}

        <div className="text-[11px] font-medium text-content-tertiary uppercase tracking-wide">Weather</div>
        <div className={row}>
          <span className="w-20 text-content-secondary">Wind {windSpd} m/s</span>
          <input type="range" min={0} max={25} step={0.5} value={windSpd} disabled={!isConnected}
            onChange={(e) => { const v = Number(e.target.value); setWindSpd(v); setParam('SIM_WIND_SPD', v, 120); }}
            className={slider} />
        </div>
        <div className={row}>
          <span className="w-20 text-content-secondary">Dir {windDir}°</span>
          <input type="range" min={0} max={359} step={1} value={windDir} disabled={!isConnected}
            onChange={(e) => { const v = Number(e.target.value); setWindDir(v); setParam('SIM_WIND_DIR', v, 120); }}
            className={slider} />
        </div>
        <div className={row}>
          <span className="w-20 text-content-secondary">Gust {windTurb.toFixed(1)}</span>
          <input type="range" min={0} max={1} step={0.05} value={windTurb} disabled={!isConnected}
            onChange={(e) => { const v = Number(e.target.value); setWindTurb(v); setParam('SIM_WIND_TURB', v, 120); }}
            className={slider} />
        </div>

        <div className="text-[11px] font-medium text-content-tertiary uppercase tracking-wide pt-1">Failures</div>
        <div className={row}>
          <span className="w-20 text-content-secondary">Batt {battV.toFixed(1)} V</span>
          <input type="range" min={10.5} max={25.2} step={0.1} value={battV} disabled={!isConnected}
            onChange={(e) => { const v = Number(e.target.value); setBattV(v); setParam('SIM_BATT_VOLTAGE', v, 120); }}
            className={slider} />
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          <FailToggle label="GPS fix" active={gpsOn} okWhenActive
            onClick={() => { const on = !gpsOn; setGpsOn(on); setParam('SIM_GPS1_ENABLE', on ? 1 : 0); }}
            tip="Disable to test GPS-loss failsafe (SIM_GPS1_ENABLE)" />
          <FailToggle label="Motor 1 failure" active={motorFail}
            onClick={() => {
              const fail = !motorFail; setMotorFail(fail);
              setParam('SIM_ENGINE_FAIL', 0);
              setParam('SIM_ENGINE_MUL', fail ? 0 : 1);
            }}
            tip="Kill motor 1 thrust (SIM_ENGINE_FAIL / SIM_ENGINE_MUL)" />
          <FailToggle label="RC loss" active={rcFail}
            onClick={() => { const f = !rcFail; setRcFail(f); setParam('SIM_RC_FAIL', f ? 1 : 0); }}
            tip="Drop RC to test radio failsafe (SIM_RC_FAIL)" />
        </div>
      </div>
    </div>
  );
}

function FailToggle({ label, active, okWhenActive, onClick, tip }: {
  label: string; active: boolean; okWhenActive?: boolean; onClick: () => void; tip: string;
}) {
  // "active" colouring: red when a failure is engaged. For GPS, active=healthy.
  const bad = okWhenActive ? !active : active;
  return (
    <button onClick={onClick} data-tip={tip}
      className={`flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
        bad ? 'bg-red-600/20 border-red-500/40 text-red-300' : 'bg-surface-raised border-subtle text-content-secondary hover:text-content'
      }`}>
      <span>{label}</span>
      <span className="text-[10px] font-medium">{okWhenActive ? (active ? 'OK' : 'LOST') : active ? 'FAILED' : 'OK'}</span>
    </button>
  );
}
