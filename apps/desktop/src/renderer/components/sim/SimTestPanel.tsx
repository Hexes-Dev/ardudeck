/**
 * SimTestPanel — live SITL failure/condition injection via SIM_* parameters.
 *
 * Standard ArduPilot SITL exposes a large set of SIM_* parameters that perturb
 * the simulation in real time (wind, power, GPS/nav, sensor and actuator
 * failures). These are set over MAVLink PARAM_SET, so real failsafes fire on the
 * real flight code and the result is visible on telemetry/map. No custom physics.
 *
 * The condition model + presets live in sim-test-conditions.ts (pure/testable);
 * this component maps each field to its SIM_* param and renders the bench.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import {
  PARAM_REAL32,
  engineFailMask,
  SIM_DEFAULTS,
  SIM_PRESETS,
  type SimConditions,
  type SimPatch,
} from './sim-test-conditions';

const MOTOR_COUNT = 8; // covers up to an octocopter; extra bits are ignored by SITL

export default function SimTestPanel() {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const [open, setOpen] = useState(false);

  const [cond, setCond] = useState<SimConditions>(SIM_DEFAULTS);
  // Battery is handled apart from the condition model: its slider range keys off
  // the vehicle's actual pack voltage (a 14S VTOL sits ~60 V, a 4S quad ~16 V).
  const [battNominal, setBattNominal] = useState(16.8);
  const [battV, setBattV] = useState<number | null>(null); // null = untouched

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fire = useCallback((paramId: string, value: number, debounce = 0) => {
    const send = () => void window.electronAPI?.setParameter?.(paramId, value, PARAM_REAL32);
    if (debounce <= 0) { send(); return; }
    clearTimeout(timers.current[paramId]);
    timers.current[paramId] = setTimeout(send, debounce);
  }, []);

  // Read the live pack voltage once connected so the battery slider auto-ranges.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void window.electronAPI?.readParameterBatch?.(['SIM_BATT_VOLTAGE'])
      .then((res) => {
        const v = res?.values?.['SIM_BATT_VOLTAGE'];
        if (!cancelled && typeof v === 'number' && v > 0) setBattNominal(v);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isConnected]);

  /** Merge a patch into state and push the SIM_* param(s) for each present field. */
  const applyPatch = useCallback((patch: SimPatch, debounce = 0) => {
    setCond((c) => ({ ...c, ...patch }));
    if (patch.failedMotors !== undefined) fire('SIM_ENGINE_FAIL', engineFailMask(patch.failedMotors));
    if (patch.engineMul !== undefined) fire('SIM_ENGINE_MUL', patch.engineMul);
    if (patch.gpsEnable !== undefined) fire('SIM_GPS1_ENABLE', patch.gpsEnable ? 1 : 0);
    if (patch.gpsJam !== undefined) fire('SIM_GPS1_JAM', patch.gpsJam ? 1 : 0);
    if (patch.gpsGlitch !== undefined) { fire('SIM_GPS1_GLTCH_X', patch.gpsGlitch, debounce); fire('SIM_GPS1_GLTCH_Y', patch.gpsGlitch, debounce); }
    if (patch.gpsSats !== undefined) fire('SIM_GPS1_NUMSATS', patch.gpsSats, debounce);
    if (patch.baroDisable !== undefined) fire('SIM_BARO_DISABLE', patch.baroDisable ? 1 : 0);
    if (patch.mag1Fail !== undefined) fire('SIM_MAG1_FAIL', patch.mag1Fail ? 1 : 0);
    if (patch.mag2Fail !== undefined) fire('SIM_MAG2_FAIL', patch.mag2Fail ? 1 : 0);
    if (patch.vibe !== undefined) fire('SIM_VIB_MOT_MAX', patch.vibe, debounce);
    if (patch.rcFail !== undefined) fire('SIM_RC_FAIL', patch.rcFail ? 1 : 0);
    if (patch.windSpd !== undefined) fire('SIM_WIND_SPD', patch.windSpd, debounce);
    if (patch.windDir !== undefined) fire('SIM_WIND_DIR', patch.windDir, debounce);
    if (patch.windTurb !== undefined) fire('SIM_WIND_TURB', patch.windTurb, debounce);
  }, [fire]);

  const toggleMotor = useCallback((n: number) => {
    setCond((c) => {
      const failed = c.failedMotors.includes(n) ? c.failedMotors.filter((m) => m !== n) : [...c.failedMotors, n];
      fire('SIM_ENGINE_FAIL', engineFailMask(failed));
      // Selecting a motor with full thrust would be a no-op, so default a fresh
      // failure to dead; clearing the last motor restores full thrust.
      let engineMul = c.engineMul;
      if (failed.length > 0 && c.failedMotors.length === 0) { engineMul = 0; fire('SIM_ENGINE_MUL', 0); }
      if (failed.length === 0) { engineMul = 1; fire('SIM_ENGINE_MUL', 1); }
      return { ...c, failedMotors: failed, engineMul };
    });
  }, [fire]);

  const resetAll = useCallback(() => {
    applyPatch(SIM_DEFAULTS);
    setBattV(null);
    fire('SIM_BATT_VOLTAGE', battNominal);
  }, [applyPatch, fire, battNominal]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-tip="Inject wind, power, GPS/nav, sensor and motor failures into SITL (SIM_* params)"
        className="absolute top-14 left-3 z-10 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-subtle text-content-secondary hover:text-content shadow-lg"
      >
        Test Conditions
      </button>
    );
  }

  const row = 'flex items-center justify-between gap-3 text-xs';
  const slider = 'flex-1 accent-sky-500';
  const anyFailure =
    cond.failedMotors.length > 0 || !cond.gpsEnable || cond.gpsJam || cond.gpsGlitch > 0 ||
    cond.gpsSats < 10 || cond.baroDisable || cond.mag1Fail || cond.mag2Fail || cond.vibe > 0 ||
    cond.rcFail || (battV !== null && battV < battNominal * 0.98);

  return (
    <div className="absolute top-14 left-3 z-10 w-80 max-h-[82vh] overflow-y-auto bg-surface-overlay backdrop-blur-sm border border-subtle rounded-xl shadow-xl text-content">
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-subtle bg-surface-overlay/95 backdrop-blur-sm">
        <span className="text-sm font-semibold">Test Conditions</span>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAll}
            disabled={!isConnected || !anyFailure}
            data-tip="Restore all SIM_* conditions to safe defaults"
            className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
              anyFailure && isConnected
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                : 'border-subtle text-content-tertiary'
            }`}
          >
            Reset all
          </button>
          <button onClick={() => setOpen(false)} className="text-content-tertiary hover:text-content text-xs">✕</button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {!isConnected && (
          <div className="text-[11px] text-amber-400">Connect to SITL to apply.</div>
        )}

        {/* One-click scenarios */}
        <Section label="Scenarios" />
        <div className="grid grid-cols-3 gap-1.5">
          {SIM_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPatch(p.patch)}
              disabled={!isConnected}
              data-tip={p.tip}
              className="px-1.5 py-1.5 text-[11px] font-medium rounded-md border border-subtle bg-surface-raised text-content-secondary hover:text-content hover:border-red-500/40 disabled:opacity-40 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Actuators */}
        <Section label="Motors" />
        <div className={row}>
          <span className="w-16 text-content-secondary shrink-0">Fail</span>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: MOTOR_COUNT }, (_, i) => i + 1).map((n) => {
              const on = cond.failedMotors.includes(n);
              return (
                <button
                  key={n}
                  onClick={() => toggleMotor(n)}
                  disabled={!isConnected}
                  data-tip={`Toggle motor ${n} failure (SIM_ENGINE_FAIL bit ${n - 1})`}
                  className={`w-6 h-6 text-[11px] font-medium rounded border transition-colors ${
                    on ? 'bg-red-600/25 border-red-500/50 text-red-300' : 'bg-surface-raised border-subtle text-content-tertiary hover:text-content'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
        {cond.failedMotors.length > 0 && (
          <div className={row}>
            <span className="w-24 text-content-secondary">Thrust {Math.round(cond.engineMul * 100)}%</span>
            <input type="range" min={0} max={1} step={0.05} value={cond.engineMul} disabled={!isConnected}
              onChange={(e) => applyPatch({ engineMul: Number(e.target.value) }, 120)}
              data-tip="Remaining thrust on failed motors (SIM_ENGINE_MUL): 0% = dead, else partial power loss"
              className={slider} />
          </div>
        )}

        {/* Power */}
        <Section label="Power" />
        <div className={row}>
          <span className="w-24 text-content-secondary">Batt {(battV ?? battNominal).toFixed(1)} V</span>
          <input type="range" min={Math.round(battNominal * 0.5)} max={Math.max(1, Math.round(battNominal * 1.05))} step={0.1}
            value={battV ?? battNominal} disabled={!isConnected}
            onChange={(e) => { const v = Number(e.target.value); setBattV(v); fire('SIM_BATT_VOLTAGE', v, 120); }}
            data-tip="Pack voltage (SIM_BATT_VOLTAGE) - drop toward the failsafe threshold to test low-battery actions"
            className={slider} />
        </div>

        {/* GPS / navigation */}
        <Section label="GPS / Nav" />
        <div className="grid grid-cols-1 gap-1.5">
          <FailToggle label="GPS fix" active={cond.gpsEnable} okWhenActive
            onClick={() => applyPatch({ gpsEnable: !cond.gpsEnable })}
            tip="Disable to test the GPS-loss failsafe / EKF fallback (SIM_GPS1_ENABLE)" />
          <FailToggle label="GPS jamming" active={cond.gpsJam}
            onClick={() => applyPatch({ gpsJam: !cond.gpsJam })}
            tip="Simulate GPS jamming (SIM_GPS1_JAM)" />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Glitch {cond.gpsGlitch} m</span>
          <input type="range" min={0} max={50} step={1} value={cond.gpsGlitch} disabled={!isConnected}
            onChange={(e) => applyPatch({ gpsGlitch: Number(e.target.value) }, 120)}
            data-tip="Inject a horizontal position offset (SIM_GPS1_GLTCH_X/Y) to test glitch rejection / flyaway"
            className={slider} />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Sats {cond.gpsSats}</span>
          <input type="range" min={0} max={20} step={1} value={cond.gpsSats} disabled={!isConnected}
            onChange={(e) => applyPatch({ gpsSats: Number(e.target.value) }, 120)}
            data-tip="Reported satellite count (SIM_GPS1_NUMSATS); drop below the arming minimum to degrade the fix"
            className={slider} />
        </div>

        {/* Sensors */}
        <Section label="Sensors" />
        <div className="grid grid-cols-2 gap-1.5">
          <FailToggle label="Baro" active={cond.baroDisable}
            onClick={() => applyPatch({ baroDisable: !cond.baroDisable })}
            tip="Disable the barometer (SIM_BARO_DISABLE)" />
          <FailToggle label="Compass 1" active={cond.mag1Fail}
            onClick={() => applyPatch({ mag1Fail: !cond.mag1Fail })}
            tip="Fail the primary compass (SIM_MAG1_FAIL)" />
          <FailToggle label="Compass 2" active={cond.mag2Fail}
            onClick={() => applyPatch({ mag2Fail: !cond.mag2Fail })}
            tip="Fail the secondary compass (SIM_MAG2_FAIL)" />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Vibe {cond.vibe.toFixed(0)}</span>
          <input type="range" min={0} max={60} step={1} value={cond.vibe} disabled={!isConnected}
            onChange={(e) => applyPatch({ vibe: Number(e.target.value) }, 120)}
            data-tip="Motor-driven vibration amplitude (SIM_VIB_MOT_MAX, m/s/s) - high values clip the IMU"
            className={slider} />
        </div>

        {/* Comms */}
        <Section label="RC / Comms" />
        <FailToggle label="RC loss" active={cond.rcFail}
          onClick={() => applyPatch({ rcFail: !cond.rcFail })}
          tip="Drop RC to trigger the radio failsafe (SIM_RC_FAIL)" />

        {/* Weather */}
        <Section label="Weather" />
        <div className={row}>
          <span className="w-24 text-content-secondary">Wind {cond.windSpd} m/s</span>
          <input type="range" min={0} max={25} step={0.5} value={cond.windSpd} disabled={!isConnected}
            onChange={(e) => applyPatch({ windSpd: Number(e.target.value) }, 120)} className={slider} />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Dir {cond.windDir}°</span>
          <input type="range" min={0} max={359} step={1} value={cond.windDir} disabled={!isConnected}
            onChange={(e) => applyPatch({ windDir: Number(e.target.value) }, 120)} className={slider} />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Gust {cond.windTurb.toFixed(2)}</span>
          <input type="range" min={0} max={1} step={0.05} value={cond.windTurb} disabled={!isConnected}
            onChange={(e) => applyPatch({ windTurb: Number(e.target.value) }, 120)} className={slider} />
        </div>
      </div>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return <div className="text-[11px] font-medium text-content-tertiary uppercase tracking-wide pt-1">{label}</div>;
}

function FailToggle({ label, active, okWhenActive, onClick, tip }: {
  label: string; active: boolean; okWhenActive?: boolean; onClick: () => void; tip: string;
}) {
  // "active" colouring: red when a failure is engaged. For GPS fix, active=healthy.
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
