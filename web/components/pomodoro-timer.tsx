"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Pencil, Timer, Volume2, VolumeX, X } from "lucide-react";

const PRESET_OPTIONS = [15, 25, 30, 45, 60] as const;

const NOISES = [
  { id: "rain", label: "雨声", src: "/audio/white-noise/rain.ogg" },
  { id: "waves", label: "海浪", src: "/audio/white-noise/waves.ogg" },
  { id: "campfire", label: "篝火", src: "/audio/white-noise/campfire.ogg" },
  { id: "forest", label: "森林鸟鸣", src: "/audio/white-noise/forest.ogg" },
  { id: "cafe", label: "咖啡馆", src: "/audio/white-noise/cafe.ogg" },
  { id: "wind", label: "风声", src: "/audio/white-noise/wind.ogg" },
  { id: "chimes", label: "风铃", src: "/audio/white-noise/chimes.ogg" },
  { id: "crickets", label: "虫鸣", src: "/audio/white-noise/crickets.mp3" },
  { id: "cave", label: "洞穴回响", src: "/audio/white-noise/cave.ogg" },
  { id: "factory", label: "机械低鸣", src: "/audio/white-noise/factory.ogg" }
] as const;

const FOCUS_QUOTES = [
  "不要轻言放弃，胜利往往在最后一次坚持之后。",
  "再坚持五分钟，专注会从阻力变成习惯。",
  "你现在守住的不是时间，是对自己的承诺。",
  "困难会过去，完成后的踏实会留下。",
  "把注意力收回来，你已经走在正确的路上。",
  "越想退出，越说明这段专注正在变得有价值。",
  "今天的坚持，会成为明天更轻松的开始。",
  "别急着离开，真正的进步常出现在后半程。",
  "稳住节奏，比一时兴起更重要。",
  "完成这一轮，你会感谢刚刚没有放弃的自己。",
  "专注不是没有分心，而是一次次回到目标。",
  "每一秒认真，都在削弱拖延的习惯。",
  "先完成，再评价；先坚持，再调整。",
  "你不需要完美，只需要把这一轮走完。",
  "放弃很快，坚持会让结果变清晰。",
  "现在继续，是给未来的自己减负。",
  "别让临门一脚输给一瞬间的松动。",
  "目标还在，时间还在，你也还可以继续。",
  "把这段时间守住，就是一次真正的胜利。",
  "坚持不是硬撑，是把重要的事放回第一位。"
];

export function PomodoroTimer() {
  const [active, setActive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [targetMinutes, setTargetMinutes] = useState(25);
  const [customInput, setCustomInput] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [goal, setGoal] = useState("");
  const [noisePlaying, setNoisePlaying] = useState(false);
  const [selectedNoise, setSelectedNoise] = useState<string>(NOISES[0].id);
  const [completed, setCompleted] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [exitQuote, setExitQuote] = useState(FOCUS_QUOTES[0]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cancelExitButtonRef = useRef<HTMLButtonElement>(null);

  const currentNoise = NOISES.find((item) => item.id === selectedNoise) || NOISES[0];

  const stopNoise = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setNoisePlaying(false);
  }, []);

  const startNoise = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = true;
    audio.volume = 0.42;
    void audio.play().then(() => setNoisePlaying(true)).catch(() => setNoisePlaying(false));
  }, []);

  const toggleNoise = useCallback(() => {
    if (noisePlaying) stopNoise();
    else startNoise();
  }, [noisePlaying, startNoise, stopNoise]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    if (noisePlaying) startNoise();
  }, [selectedNoise, noisePlaying, startNoise]);

  const playCompleteSound = useCallback(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
  }, []);

  const getEffectiveMinutes = useCallback(() => {
    if (useCustom) {
      const value = parseInt(customInput, 10);
      return value > 0 && value <= 180 ? value : 25;
    }
    return targetMinutes;
  }, [customInput, targetMinutes, useCustom]);

  const startTimer = useCallback(() => {
    const minutes = getEffectiveMinutes();
    setSeconds(minutes * 60);
    setActive(true);
    setCompleted(false);
    setConfirmExit(false);
  }, [getEffectiveMinutes]);

  const stopTimer = useCallback(() => {
    setActive(false);
    setSeconds(0);
    setCompleted(false);
    setConfirmExit(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    stopNoise();
  }, [stopNoise]);

  const requestExit = useCallback(() => {
    setExitQuote(FOCUS_QUOTES[Math.floor(Math.random() * FOCUS_QUOTES.length)]);
    setConfirmExit(true);
  }, []);

  useEffect(() => {
    if (!confirmExit) return;
    cancelExitButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmExit(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmExit]);

  useEffect(() => {
    if (!active || completed) return;
    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setCompleted(true);
          stopNoise();
          playCompleteSound();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, completed, playCompleteSound, stopNoise]);

  const formatTime = (value: number) => {
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60).toString().padStart(2, "0");
    const secs = (value % 60).toString().padStart(2, "0");
    return hours > 0 ? `${hours}:${minutes}:${secs}` : `${minutes}:${secs}`;
  };

  const progress = active && !completed ? 1 - seconds / (getEffectiveMinutes() * 60) : 0;
  const circumference = 2 * Math.PI * 140;
  const dashOffset = circumference * (1 - progress);

  if (!active) {
    return (
      <div className="pomodoro-page">
        <header className="page-hero">
          <div>
            <span className="eyebrow">Pomodoro Timer</span>
            <h1 className="page-title">番茄钟</h1>
          </div>
        </header>

        <section className="section">
          <div className="card pomodoro-duration-card">
            <div className="panel-heading">
              <h2 className="card-title"><Clock size={18} /> 选择专注时长</h2>
            </div>
            <div className="pomodoro-duration-grid">
              {PRESET_OPTIONS.map((minutes) => (
                <button key={minutes} className={"pomodoro-duration-btn" + (!useCustom && targetMinutes === minutes ? " active" : "")} onClick={() => { setTargetMinutes(minutes); setUseCustom(false); }} type="button">
                  <strong>{minutes}</strong>
                  <span>分钟</span>
                </button>
              ))}
            </div>
            <div className="pomodoro-custom-row">
              <button className={"pomodoro-custom-toggle" + (useCustom ? " active" : "")} onClick={() => setUseCustom(!useCustom)} type="button">
                <Pencil size={14} />
                <span>自定义时长</span>
              </button>
              {useCustom ? (
                <div className="pomodoro-custom-input-wrap">
                  <input className="input pomodoro-custom-input" type="number" min={1} max={180} placeholder="分钟" value={customInput} onChange={(event) => setCustomInput(event.target.value)} />
                  <span className="muted">分钟</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="card pomodoro-goal-card">
            <div className="panel-heading">
              <h2 className="card-title"><Timer size={18} /> 设置目标</h2>
            </div>
            <input className="input pomodoro-goal-input" placeholder="输入本次专注目标" value={goal} onChange={(event) => setGoal(event.target.value)} />
          </div>
        </section>

        <section className="section">
          <button className="button pomodoro-start-btn" onClick={startTimer} type="button">
            <Timer size={18} /> 开始专注
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="pomodoro-overlay">
      <audio ref={audioRef} src={currentNoise.src} />
      <div className="pomodoro-active-area" aria-hidden={confirmExit}>
        {completed ? (
          <div className="pomodoro-complete">
            <h2>专注完成</h2>
            <p>{goal || "完成了一次番茄钟专注"}</p>
            <button className="button" onClick={stopTimer} type="button">返回</button>
          </div>
        ) : (
          <>
            <div className="pomodoro-timer-center">
              <svg className="pomodoro-ring" viewBox="0 0 300 300">
                <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(31,75,110,0.1)" strokeWidth="6" />
                <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(31,75,110,0.8)" strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" transform="rotate(-90 150 150)" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
              </svg>
              <div className="pomodoro-timer-display">{formatTime(seconds)}</div>
              <p className="pomodoro-goal-display">{goal || "保持专注"}</p>
            </div>

            <div className="pomodoro-noise-picker" aria-label="白噪音类型">
              {NOISES.map((noise) => (
                <button className={"pomodoro-noise-chip" + (selectedNoise === noise.id ? " active" : "")} key={noise.id} onClick={() => setSelectedNoise(noise.id)} type="button">
                  {noise.label}
                </button>
              ))}
            </div>

            <div className="pomodoro-cards-row">
              <button className={"card pomodoro-control-card" + (noisePlaying ? " active-card" : "")} onClick={toggleNoise} type="button">
                <div className="pomodoro-card-icon">{noisePlaying ? <Volume2 size={28} /> : <VolumeX size={28} />}</div>
                <span className="pomodoro-card-label">{noisePlaying ? `${currentNoise.label}播放中` : "开启白噪音"}</span>
                <span className="pomodoro-card-hint">可切换音频并持续播放</span>
              </button>
              <button className="card pomodoro-control-card stop-card" onClick={requestExit} type="button">
                <div className="pomodoro-card-icon"><X size={28} /></div>
                <span className="pomodoro-card-label">退出专注</span>
                <span className="pomodoro-card-hint">需要二次确认</span>
              </button>
            </div>
          </>
        )}
      </div>

      {confirmExit ? (
        <div className="modal-backdrop pomodoro-exit-backdrop" role="presentation">
          <section className="modal-panel pomodoro-exit-modal" role="dialog" aria-modal="true" aria-labelledby="pomodoro-exit-title" aria-describedby="pomodoro-exit-copy">
            <div className="pomodoro-exit-mark"><X size={18} /></div>
            <h2 className="card-title" id="pomodoro-exit-title">确认退出专注？</h2>
            <p id="pomodoro-exit-copy">{exitQuote}</p>
            <div className="modal-actions pomodoro-exit-actions">
              <button ref={cancelExitButtonRef} className="button secondary" onClick={() => setConfirmExit(false)} type="button">继续专注</button>
              <button className="button" onClick={stopTimer} type="button">退出</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
