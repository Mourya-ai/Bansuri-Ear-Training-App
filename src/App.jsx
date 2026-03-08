import { useState, useEffect, useRef } from "react";

// ─── DATA ────────────────────────────────────────────────────────────────────

const SCALES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const SCALE_LABELS = ["C","C#/Db","D","D#/Eb","E","F","F#/Gb","G","G#/Ab","A","A#/Bb","B"];

const SARGAM_FULL = [
  { sargam: "Sa",        semitone: 0,  komal: false },
  { sargam: "Komal Re",  semitone: 1,  komal: true  },
  { sargam: "Re",        semitone: 2,  komal: false },
  { sargam: "Komal Ga",  semitone: 3,  komal: true  },
  { sargam: "Ga",        semitone: 4,  komal: false },
  { sargam: "Ma",        semitone: 5,  komal: false },
  { sargam: "Tivra Ma",  semitone: 6,  komal: true  },
  { sargam: "Pa",        semitone: 7,  komal: false },
  { sargam: "Komal Dha", semitone: 8,  komal: true  },
  { sargam: "Dha",       semitone: 9,  komal: false },
  { sargam: "Komal Ni",  semitone: 10, komal: true  },
  { sargam: "Ni",        semitone: 11, komal: false },
];

const DIFFICULTY_NOTES = {
  beginner:     [0, 2, 4, 5, 7, 9, 11, 12],
  intermediate: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  advanced:     [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
};

function getWesternNote(saIndex, semitoneOffset) {
  const idx = ((saIndex + semitoneOffset) % 12 + 12) % 12;
  return SCALES[idx];
}

function getNoteLabel(saIndex, semitoneOffset) {
  const degree      = ((semitoneOffset % 12) + 12) % 12;
  const octaveShift = Math.floor(semitoneOffset / 12);
  const note        = SARGAM_FULL.find(n => n.semitone === degree);
  const western     = getWesternNote(saIndex, semitoneOffset);
  let sargam = note?.sargam || "Sa";
  if (octaveShift < 0)      sargam = "L. " + sargam;
  else if (octaveShift > 0) sargam = "H. " + sargam;
  return { sargam, western, komal: note?.komal || false };
}

// ─── PROGRESS HOOK (localStorage) ────────────────────────────────────────────
//
// ROLLING WINDOW MODEL:
//   Each difficulty level stores the last 20 answers as a boolean array.
//   e.g. history: [true, true, false, true, ...]
//   Accuracy = correct count in window / window length × 100
//   Old answers fall off automatically once window fills up.
//
// NOTE ERRORS:
//   Separately track how many times each note was answered wrong (lifetime).
//   Used to show "Focus on these" — not affected by rolling window.

const STORAGE_KEY  = "swara_progress_v2"; // v2 = new rolling window format
const WINDOW_SIZE  = 20;

const DEFAULT_LEVEL = () => ({ history: [], noteErrors: {} });

const DEFAULT_PROGRESS = {
  beginner:     DEFAULT_LEVEL(),
  intermediate: DEFAULT_LEVEL(),
  advanced:     DEFAULT_LEVEL(),
  streak:       { lastDate: null, days: 0 },
  totalQuizzes: 0,
};

// ── helpers ──────────────────────────────────────────────────────────────────
function calcAccuracy(history) {
  if (!history.length) return null; // null = no data yet
  const correct = history.filter(Boolean).length;
  return Math.round(correct / history.length * 100);
}

function getTrend(history) {
  // Compare first half vs second half of window to show ↑ ↓ →
  if (history.length < 6) return null;
  const mid   = Math.floor(history.length / 2);
  const first = history.slice(0, mid).filter(Boolean).length / mid;
  const last  = history.slice(mid).filter(Boolean).length / (history.length - mid);
  if (last - first >  0.1) return "up";
  if (first - last >  0.1) return "down";
  return "flat";
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw);
    // Ensure shape is correct after future format changes
    return {
      ...DEFAULT_PROGRESS,
      ...parsed,
      beginner:     { ...DEFAULT_LEVEL(), ...parsed.beginner },
      intermediate: { ...DEFAULT_LEVEL(), ...parsed.intermediate },
      advanced:     { ...DEFAULT_LEVEL(), ...parsed.advanced },
    };
  } catch { return DEFAULT_PROGRESS; }
}

function saveProgress(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

// ── hook ─────────────────────────────────────────────────────────────────────
function useProgress() {
  const [progress, setProgress] = useState(loadProgress);

  const recordAnswer = (difficulty, sargamName, isCorrect) => {
    setProgress(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const level   = updated[difficulty];

      // Push to rolling window, drop oldest if over WINDOW_SIZE
      level.history.push(isCorrect);
      if (level.history.length > WINDOW_SIZE) level.history.shift();

      // Track wrong notes (lifetime, for "Focus on these")
      if (!isCorrect) {
        level.noteErrors[sargamName] = (level.noteErrors[sargamName] || 0) + 1;
      }

      updated.totalQuizzes += 1;

      // Streak logic
      const today     = getTodayString();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (updated.streak.lastDate === today) {
        // already counted today
      } else if (updated.streak.lastDate === yesterday) {
        updated.streak.days += 1;
        updated.streak.lastDate = today;
      } else {
        updated.streak.days = 1;
        updated.streak.lastDate = today;
      }

      saveProgress(updated);
      return updated;
    });
  };

  const resetProgress = () => {
    saveProgress(DEFAULT_PROGRESS);
    setProgress(DEFAULT_PROGRESS);
  };

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type:"application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "swara_progress.json"; a.click();
    URL.revokeObjectURL(url);
  };

  // Called from Learn mode — only updates streak, no rolling window
  const recordPractice = () => {
    setProgress(prev => {
      const updated   = JSON.parse(JSON.stringify(prev));
      const today     = getTodayString();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (updated.streak.lastDate === today) {
        // already counted today, nothing to do
      } else if (updated.streak.lastDate === yesterday) {
        updated.streak.days += 1;
        updated.streak.lastDate = today;
      } else {
        updated.streak.days = 1;
        updated.streak.lastDate = today;
      }
      saveProgress(updated);
      return updated;
    });
  };

  return { progress, recordAnswer, recordPractice, resetProgress, exportProgress, calcAccuracy, getTrend };
}

// ─── AUDIO SYSTEM ────────────────────────────────────────────────────────────
//
// SINGLE FOLDER: /public/audio/
//   Files: C3.mp3, Cs3.mp3 ... B3.mp3, C4.mp3 ... B4.mp3, C5.mp3 ... E5.mp3
//   Sharps use "s": C# → Cs, F# → Fs, G# → Gs etc.
//
// SAPTAK defines which octave Sa lives in:
//   Middle (Madhya) → Sa base octave = 4  e.g. E middle → Sa = E4
//   Bass   (Mandra) → Sa base octave = 3  e.g. E bass   → Sa = E3
//
// OCTAVE MATH (auto-handles crossings like Dha/Ni going into next octave):
//   absoluteNote = (saIndex + saBaseOctave × 12) + semitoneOffset
//   noteName     = absoluteNote % 12
//   noteOctave   = Math.floor(absoluteNote / 12)
//
// Example — E bass (saIndex=4, baseOctave=3):
//   Sa  offset 0  → 40 → E3.mp3
//   Dha offset 9  → 49 → Cs4.mp3  ← naturally crosses octave
//   Sa' offset 12 → 52 → E4.mp3   ← higher Sa lands in octave 4

const NOTE_NAMES_FILE = ["C","Cs","D","Ds","E","F","Fs","G","Gs","A","As","B"];

const SAPTAK_CONFIG = {
  middle: { label:"Middle", hindi:"Madhya Saptak", baseOctave: 5 },
  bass:   { label:"Bass",   hindi:"Mandra Saptak", baseOctave: 4 },
};

function getAudioFile(saIndex, semitoneOffset, saptak = "middle") {
  const saBaseOctave = SAPTAK_CONFIG[saptak].baseOctave;
  const absoluteNote = saIndex + saBaseOctave * 12 + semitoneOffset;
  const noteName     = NOTE_NAMES_FILE[absoluteNote % 12];
  const noteOctave   = Math.floor(absoluteNote / 12);
  return `/audio/${noteName}${noteOctave}.m4a`;
}

// Preloaded audio cache so taps feel instant
const audioCache = {};

function preloadNotes(saIndex, semitones, saptak) {
  semitones.forEach(s => {
    const file = getAudioFile(saIndex, s, saptak);
    if (!audioCache[file]) {
      const audio = new Audio(file);
      audio.preload = "auto";
      audioCache[file] = audio;
    }
  });
}

let currentAudio = null;

function playAudioFile(saIndex, semitoneOffset, saptak = "middle") {
  const file = getAudioFile(saIndex, semitoneOffset, saptak);
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  const audio = audioCache[file] || new Audio(file);
  audioCache[file] = audio;
  audio.currentTime = 0;
  audio.play().catch(() => console.warn("Audio not found:", file));
  currentAudio = audio;
  return audio;
}

// ─── TINY WAVEFORM ANIMATION ──────────────────────────────────────────────────
function Waveform({ playing }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:3, height:24 }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{
          width: 3, borderRadius: 99,
          background: "var(--gold)",
          height: playing ? `${8 + Math.random()*14}px` : "4px",
          animation: playing ? `wave ${0.4 + i*0.1}s ease-in-out infinite alternate` : "none",
          animationDelay: `${i*0.07}s`,
          transition: "height 0.2s"
        }}/>
      ))}
    </div>
  );
}

// ─── NOTE PILL ────────────────────────────────────────────────────────────────
function NotePill({ sargam, western, komal, playing, onPlay, size = "md" }) {
  const isPlaying = playing;
  return (
    <button onClick={onPlay} style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 2,
      padding: size === "lg" ? "18px 28px" : "12px 20px",
      borderRadius: 16,
      border: isPlaying ? "2px solid var(--gold)" : "2px solid rgba(255,255,255,0.08)",
      background: isPlaying
        ? "linear-gradient(135deg, rgba(212,175,55,0.25), rgba(212,175,55,0.1))"
        : komal
          ? "rgba(180,100,255,0.08)"
          : "rgba(255,255,255,0.05)",
      cursor: "pointer",
      transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
      transform: isPlaying ? "scale(1.05)" : "scale(1)",
      boxShadow: isPlaying ? "0 0 24px rgba(212,175,55,0.3)" : "none",
      minWidth: size === "lg" ? 100 : 80,
    }}>
      <span style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: size === "lg" ? 20 : 16,
        fontWeight: 700,
        color: isPlaying ? "var(--gold)" : komal ? "#c084fc" : "var(--cream)",
        letterSpacing: 0.5,
      }}>{sargam}</span>
      <span style={{
        fontFamily: "monospace",
        fontSize: size === "lg" ? 13 : 11,
        color: isPlaying ? "var(--gold-dim)" : "rgba(255,255,255,0.4)",
        letterSpacing: 1,
      }}>{western}</span>
    </button>
  );
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────

function HomeScreen({ onNavigate, selectedScale, onSelectScale, selectedSaptak, onSelectSaptak }) {
  const [scaleOpen, setScaleOpen] = useState(false);
  const [saptakOpen, setSaptakOpen] = useState(false);
  const saptak = SAPTAK_CONFIG[selectedSaptak];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", padding:"32px 24px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <div style={{
            width:36, height:36, borderRadius:10,
            background:"linear-gradient(135deg, var(--gold), #b8860b)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:18
          }}>𝄞</div>
          <div>
            <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:700, color:"var(--cream)", lineHeight:1 }}>Bansuri</div>
            <div style={{ fontSize:11, color:"var(--gold)", letterSpacing:2, textTransform:"uppercase" }}>Ear Training</div>
          </div>
        </div>
      </div>

      {/* Flute Selector — Scale + Saptak side by side */}
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:10 }}>Your Flute</div>

        <div style={{ display:"flex", gap:10 }}>
          {/* Scale picker */}
          <div style={{ flex:1, position:"relative" }}>
            <button onClick={() => { setScaleOpen(!scaleOpen); setSaptakOpen(false); }} style={{
              width:"100%", padding:"14px 16px",
              background:"rgba(255,255,255,0.05)",
              border:"2px solid " + (scaleOpen ? "var(--gold)" : "rgba(255,255,255,0.1)"),
              borderRadius:14, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center",
              transition:"all 0.2s"
            }}>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:2 }}>Scale</div>
                <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, fontWeight:700, color:"var(--cream)" }}>
                  {SCALE_LABELS[SCALES.indexOf(selectedScale)]}
                </div>
                <div style={{ fontSize:11, color:"var(--gold)" }}>Sa = {selectedScale}</div>
              </div>
              <span style={{ color:"var(--gold)", fontSize:16, transform: scaleOpen ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}>⌄</span>
            </button>
            {scaleOpen && (
              <div style={{
                position:"absolute", top:"calc(100% + 6px)", left:0, right:0, zIndex:20,
                background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:14, overflow:"hidden",
                display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
                boxShadow:"0 12px 40px rgba(0,0,0,0.7)"
              }}>
                {SCALES.map((s, i) => (
                  <button key={s} onClick={() => { onSelectScale(s); setScaleOpen(false); }} style={{
                    padding:"12px 6px", border:"none",
                    background: s === selectedScale ? "rgba(212,175,55,0.2)" : "transparent",
                    cursor:"pointer", color: s === selectedScale ? "var(--gold)" : "var(--cream)",
                    fontFamily:"'Playfair Display', serif", fontSize:13,
                    fontWeight: s === selectedScale ? 700 : 400,
                    borderBottom:"1px solid rgba(255,255,255,0.05)",
                    transition:"background 0.15s"
                  }}>{SCALE_LABELS[i]}</button>
                ))}
              </div>
            )}
          </div>

          {/* Saptak picker */}
          <div style={{ flex:1, position:"relative" }}>
            <button onClick={() => { setSaptakOpen(!saptakOpen); setScaleOpen(false); }} style={{
              width:"100%", padding:"14px 16px",
              background:"rgba(255,255,255,0.05)",
              border:"2px solid " + (saptakOpen ? "var(--gold)" : "rgba(255,255,255,0.1)"),
              borderRadius:14, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center",
              transition:"all 0.2s"
            }}>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:2 }}>Register</div>
                <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, fontWeight:700, color:"var(--cream)" }}>
                  {saptak.label}
                </div>
                <div style={{ fontSize:11, color:"var(--gold)" }}>{saptak.hindi}</div>
              </div>
              <span style={{ color:"var(--gold)", fontSize:16, transform: saptakOpen ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}>⌄</span>
            </button>
            {saptakOpen && (
              <div style={{
                position:"absolute", top:"calc(100% + 6px)", left:0, right:0, zIndex:20,
                background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:14, overflow:"hidden",
                boxShadow:"0 12px 40px rgba(0,0,0,0.7)"
              }}>
                {Object.entries(SAPTAK_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => { onSelectSaptak(key); setSaptakOpen(false); }} style={{
                    width:"100%", padding:"14px 16px", border:"none",
                    background: key === selectedSaptak ? "rgba(212,175,55,0.15)" : "transparent",
                    cursor:"pointer", textAlign:"left",
                    borderBottom:"1px solid rgba(255,255,255,0.05)",
                    transition:"background 0.15s"
                  }}>
                    <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, fontWeight:700, color: key === selectedSaptak ? "var(--gold)" : "var(--cream)" }}>{cfg.label}</div>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>{cfg.hindi}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary pill */}
        <div style={{ marginTop:10, padding:"8px 14px", borderRadius:10, background:"rgba(212,175,55,0.07)", border:"1px solid rgba(212,175,55,0.15)", display:"inline-flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:12, color:"var(--gold)" }}>🎶</span>
          <span style={{ fontSize:12, color:"rgba(255,255,255,0.5)" }}>
            {saptak.label} {SCALE_LABELS[SCALES.indexOf(selectedScale)]} flute &nbsp;·&nbsp; Sa = {selectedScale}{saptak.baseOctave}
          </span>
        </div>
      </div>

      {/* Nav Cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:14, flex:1 }}>
        {[
          { id:"learn",    icon:"🎵", title:"Learning Mode", sub:"Tap notes to hear them", color:"#1e3a5f" },
          { id:"quiz",     icon:"🎯", title:"Quiz Mode",     sub:"Test your ear",          color:"#2d1b47" },
          { id:"progress", icon:"📈", title:"Progress",      sub:"Track your journey",     color:"#1a3a2a" },
        ].map(card => (
          <button key={card.id} onClick={() => onNavigate(card.id)} style={{
            padding:"20px 24px", borderRadius:20,
            background: card.color,
            border:"1px solid rgba(255,255,255,0.08)",
            cursor:"pointer", display:"flex", alignItems:"center", gap:16,
            transition:"all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
            textAlign:"left"
          }}>
            <span style={{ fontSize:28 }}>{card.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, fontWeight:700, color:"var(--cream)", marginBottom:2 }}>{card.title}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)" }}>{card.sub}</div>
            </div>
            <span style={{ color:"rgba(255,255,255,0.2)", fontSize:18 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DifficultyDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const levels = [
    { id:"beginner",     label:"Beginner",     emoji:"🟢" },
    { id:"intermediate", label:"Intermediate", emoji:"🟡" },
    { id:"advanced",     label:"Advanced",     emoji:"🔴" },
  ];
  const current = levels.find(l => l.id === value);
  return (
    <div style={{ position:"relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display:"flex", alignItems:"center", gap:8,
        padding:"7px 14px", borderRadius:99,
        background:"rgba(255,255,255,0.07)",
        border:"1px solid " + (open ? "var(--gold)" : "rgba(255,255,255,0.12)"),
        cursor:"pointer", color:"var(--cream)", fontSize:13, fontWeight:600,
        transition:"all 0.15s"
      }}>
        <span>{current.emoji}</span>
        <span style={{ fontFamily:"'Playfair Display', serif" }}>{current.label}</span>
        <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)", transform: open ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 6px)", right:0,
          background:"#161625", border:"1px solid rgba(255,255,255,0.12)",
          borderRadius:14, overflow:"hidden", zIndex:10,
          boxShadow:"0 12px 40px rgba(0,0,0,0.6)", minWidth:160
        }}>
          {levels.map(lv => (
            <button key={lv.id} onClick={() => { onChange(lv.id); setOpen(false); }} style={{
              width:"100%", padding:"12px 16px",
              background: lv.id === value ? "rgba(212,175,55,0.1)" : "transparent",
              border:"none", cursor:"pointer",
              display:"flex", alignItems:"center", gap:10,
              color: lv.id === value ? "var(--gold)" : "var(--cream)",
              fontSize:14, fontWeight: lv.id === value ? 700 : 400,
              fontFamily:"'Playfair Display', serif",
              borderBottom:"1px solid rgba(255,255,255,0.05)",
              transition:"background 0.15s"
            }}>
              <span>{lv.emoji}</span>{lv.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LearnScreen({ onBack, saIndex, saptak, recordPractice }) {
  const [difficulty, setDifficulty] = useState("beginner");
  const [playingNote, setPlayingNote] = useState(null);
  const timerRef = useRef(null);
  const practicedToday = useRef(false); // only fire once per session
  const semitones = DIFFICULTY_NOTES[difficulty];

  // Preload notes when difficulty or scale changes
  useEffect(() => {
    preloadNotes(saIndex, semitones, saptak);
  }, [difficulty, saIndex, saptak]);

  const playNote = (semitone) => {
    // Count as practice for streak on first tap of the session
    if (!practicedToday.current) {
      practicedToday.current = true;
      recordPractice();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setPlayingNote(semitone);
    const audio = playAudioFile(saIndex, semitone, saptak);
    audio.onended = () => setPlayingNote(null);
    timerRef.current = setTimeout(() => setPlayingNote(null), 3000);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", padding:"28px 24px 24px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--gold)", fontSize:14, cursor:"pointer", padding:0 }}>← Back</button>
        <DifficultyDropdown value={difficulty} onChange={setDifficulty} />
      </div>

      <div style={{ marginBottom:20 }}>
        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:700, color:"var(--cream)", marginBottom:2 }}>Listen & Learn</div>
        <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)" }}>Tap any note to hear it</div>
      </div>

      {/* Sa Reference */}
      <div style={{
        padding:"14px 20px", borderRadius:14, marginBottom:20,
        background:"linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))",
        border:"1px solid rgba(212,175,55,0.3)",
        display:"flex", alignItems:"center", justifyContent:"space-between"
      }}>
        <div>
          <div style={{ fontSize:12, color:"var(--gold)", letterSpacing:1, marginBottom:2 }}>REFERENCE</div>
          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:18, fontWeight:700, color:"var(--cream)" }}>Sa = {SCALES[saIndex]}</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>{SAPTAK_CONFIG[saptak].label} · {SAPTAK_CONFIG[saptak].hindi}</div>
        </div>
        <button onClick={() => playNote(0)} style={{
          padding:"8px 16px", borderRadius:10,
          background:"rgba(212,175,55,0.2)", border:"1px solid rgba(212,175,55,0.4)",
          color:"var(--gold)", fontSize:13, cursor:"pointer", fontWeight:600,
          display:"flex", alignItems:"center", gap:8
        }}>
          <Waveform playing={playingNote === 0} /> Play Sa
        </button>
      </div>

      {/* Notes Grid */}
      <div style={{ flex:1, overflowY:"auto" }}>
        <div style={{ display:"grid", gridTemplateColumns: difficulty === "advanced" ? "1fr 1fr" : "1fr 1fr 1fr", gap:10 }}>
          {semitones.map(semitone => {
            const { sargam, western, komal } = getNoteLabel(saIndex, semitone);
            return (
              <NotePill
                key={semitone}
                sargam={sargam} western={western} komal={komal}
                playing={playingNote === semitone}
                onPlay={() => playNote(semitone)}
                size={difficulty === "advanced" ? "md" : "lg"}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuizScreen({ onBack, saIndex, saptak, recordAnswer }) {
  const [difficulty, setDifficulty] = useState("beginner");
  const semitones = DIFFICULTY_NOTES[difficulty].filter(s => s !== 12);
  const [phase, setPhase] = useState("intro"); // intro | question | result
  const [questionNote, setQuestionNote] = useState(null);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [playingRef, setPlayingRef] = useState(false);
  const [playingQ, setPlayingQ] = useState(false);
  const [score, setScore] = useState({ correct:0, total:0 });
  const timerRef = useRef(null);

  const playRef = () => {
    setPlayingRef(true);
    const audio = playAudioFile(saIndex, 0, saptak);
    audio.onended = () => setPlayingRef(false);
    setTimeout(() => setPlayingRef(false), 3000);
  };

  const playQ = () => {
    if (questionNote === null) return;
    setPlayingQ(true);
    const audio = playAudioFile(saIndex, questionNote, saptak);
    audio.onended = () => setPlayingQ(false);
    setTimeout(() => setPlayingQ(false), 3000);
  };

  const startQuestion = () => {
    const pool = semitones.filter(s => s !== 0);
    const correct = pool[Math.floor(Math.random() * pool.length)];
    const distractors = pool.filter(s => s !== correct)
      .sort((a,b) => Math.abs(a - correct) - Math.abs(b - correct))
      .slice(0, 3);
    const allOpts = [...distractors, correct].sort(() => Math.random() - 0.5);
    setQuestionNote(correct);
    setOptions(allOpts);
    setSelected(null);
    setPhase("question");
    // Play Sa first, then the question note
    playRef();
    setTimeout(() => {
      setPlayingQ(true);
      const audio = playAudioFile(saIndex, correct, saptak);
      audio.onended = () => setPlayingQ(false);
      setTimeout(() => setPlayingQ(false), 3000);
    }, 1600);
  };

  const handleAnswer = (semitone) => {
    setSelected(semitone);
    const isCorrect = semitone === questionNote;
    const { sargam } = getNoteLabel(saIndex, questionNote);
    setScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
    recordAnswer(difficulty, sargam, isCorrect);
    setPhase("result");
  };

  const diffLabel = null; // unused, kept for safety

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", padding:"28px 24px 24px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--gold)", fontSize:14, cursor:"pointer", padding:0 }}>← Back</button>
        <DifficultyDropdown value={difficulty} onChange={(d) => { setDifficulty(d); setPhase("intro"); setScore({correct:0,total:0}); }} />
      </div>

      {/* Score */}
      {score.total > 0 && (
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          <div style={{ flex:1, padding:"10px 16px", borderRadius:12, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.2)", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:700, color:"#4ade80" }}>{score.correct}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Correct</div>
          </div>
          <div style={{ flex:1, padding:"10px 16px", borderRadius:12, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:700, color:"var(--cream)" }}>{score.total}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Total</div>
          </div>
          <div style={{ flex:1, padding:"10px 16px", borderRadius:12, background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.2)", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:700, color:"var(--gold)" }}>{Math.round(score.correct/score.total*100)}%</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Accuracy</div>
          </div>
        </div>
      )}

      {phase === "intro" && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, textAlign:"center" }}>
          <div style={{ fontSize:48 }}>🎯</div>
          <div>
            <div style={{ fontFamily:"'Playfair Display', serif", fontSize:24, fontWeight:700, color:"var(--cream)", marginBottom:8 }}>Quiz Mode</div>
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.4)", lineHeight:1.6 }}>Listen to a note and identify it.<br/>Sa = {SCALES[saIndex]} is your reference.</div>
          </div>
          <button onClick={() => { playRef(); setTimeout(startQuestion, 1400); }} style={{
            padding:"16px 40px", borderRadius:16,
            background:"linear-gradient(135deg, var(--gold), #b8860b)",
            border:"none", color:"#1a1a2e", fontSize:16, fontWeight:700, cursor:"pointer",
            fontFamily:"'Playfair Display', serif"
          }}>Start Quiz</button>
        </div>
      )}

      {(phase === "question" || phase === "result") && (
        <>
          {/* Reference + Question buttons */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:24 }}>
            <button onClick={playRef} style={{
              padding:"14px", borderRadius:14,
              background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.3)",
              cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:6
            }}>
              <Waveform playing={playingRef} />
              <span style={{ fontSize:12, color:"var(--gold)", fontWeight:600 }}>Play Sa ({SCALES[saIndex]})</span>
            </button>
            <button onClick={playQ} style={{
              padding:"14px", borderRadius:14,
              background:"rgba(100,100,255,0.1)", border:"1px solid rgba(100,100,255,0.3)",
              cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:6
            }}>
              <Waveform playing={playingQ} />
              <span style={{ fontSize:12, color:"#818cf8", fontWeight:600 }}>Replay Note</span>
            </button>
          </div>

          <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:16, textAlign:"center" }}>
            {phase === "result" ? "Next question:" : "Which note is this?"}
          </div>

          {/* Answer options */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
            {options.map(semitone => {
              const { sargam, western, komal } = getNoteLabel(saIndex, semitone);
              const isSelected = selected === semitone;
              const isCorrect = semitone === questionNote;
              let bg = "rgba(255,255,255,0.05)";
              let border = "rgba(255,255,255,0.1)";
              let color = "var(--cream)";
              if (phase === "result") {
                if (isCorrect) { bg = "rgba(34,197,94,0.15)"; border = "rgba(34,197,94,0.5)"; color = "#4ade80"; }
                else if (isSelected) { bg = "rgba(239,68,68,0.15)"; border = "rgba(239,68,68,0.5)"; color = "#f87171"; }
              }
              return (
                <button key={semitone} onClick={() => phase === "question" && handleAnswer(semitone)} style={{
                  padding:"18px 12px", borderRadius:16,
                  background: bg, border:`2px solid ${border}`,
                  cursor: phase === "question" ? "pointer" : "default",
                  transition:"all 0.2s",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:4
                }}>
                  <span style={{ fontFamily:"'Playfair Display', serif", fontSize:18, fontWeight:700, color }}>{sargam}</span>
                  <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", fontFamily:"monospace" }}>{western}</span>
                  {phase === "result" && isCorrect && <span style={{ fontSize:16 }}>✅</span>}
                  {phase === "result" && isSelected && !isCorrect && <span style={{ fontSize:16 }}>❌</span>}
                </button>
              );
            })}
          </div>

          {phase === "result" && (
            <button onClick={startQuestion} style={{
              width:"100%", padding:"16px", borderRadius:16,
              background:"linear-gradient(135deg, var(--gold), #b8860b)",
              border:"none", color:"#1a1a2e", fontSize:16, fontWeight:700, cursor:"pointer",
              fontFamily:"'Playfair Display', serif"
            }}>Next Note →</button>
          )}
        </>
      )}
    </div>
  );
}

function ProgressScreen({ onBack, progress, resetProgress, exportProgress }) {
  const [confirmReset, setConfirmReset] = useState(false);

  const levels = [
    { id:"beginner",     label:"Beginner",     emoji:"🟢", color:"rgba(34,197,94,0.1)",  border:"rgba(34,197,94,0.3)",  bar:"#4ade80" },
    { id:"intermediate", label:"Intermediate", emoji:"🟡", color:"rgba(234,179,8,0.1)",  border:"rgba(234,179,8,0.3)",  bar:"#facc15" },
    { id:"advanced",     label:"Advanced",     emoji:"🔴", color:"rgba(239,68,68,0.1)",  border:"rgba(239,68,68,0.3)",  bar:"#f87171" },
  ];

  // Top 3 most-missed notes across all levels (lifetime)
  const allErrors = {};
  ["beginner","intermediate","advanced"].forEach(lv => {
    Object.entries(progress[lv].noteErrors || {}).forEach(([note, count]) => {
      allErrors[note] = (allErrors[note] || 0) + count;
    });
  });
  const weakNotes = Object.entries(allErrors)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 3)
    .map(([note]) => note);

  const trendIcon = { up:"↑", down:"↓", flat:"→" };
  const trendColor = { up:"#4ade80", down:"#f87171", flat:"#facc15" };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", padding:"28px 24px 24px", overflowY:"auto", position:"relative" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--gold)", fontSize:14, cursor:"pointer", textAlign:"left", marginBottom:24, padding:0 }}>← Back</button>
      <div style={{ fontFamily:"'Playfair Display', serif", fontSize:26, fontWeight:700, color:"var(--cream)", marginBottom:2 }}>Your Progress</div>
      <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginBottom:6 }}>
        Based on your last {WINDOW_SIZE} answers per level
      </div>
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:24 }}>
        {progress.totalQuizzes === 0
          ? "Complete your first quiz to see progress here"
          : "Your accuracy updates as you play — early mistakes drop off automatically"}
      </div>

      {/* Streak */}
      <div style={{
        padding:"16px 20px", borderRadius:16, marginBottom:20,
        background:"linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))",
        border:"1px solid rgba(212,175,55,0.3)",
        display:"flex", alignItems:"center", gap:16
      }}>
        <span style={{ fontSize:36 }}>🔥</span>
        <div>
          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:28, fontWeight:700, color:"var(--gold)" }}>
            {progress.streak.days} {progress.streak.days === 1 ? "day" : "days"}
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Practice streak</div>
        </div>
        <div style={{ marginLeft:"auto", textAlign:"right" }}>
          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:700, color:"var(--cream)" }}>{progress.totalQuizzes}</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Total quizzes</div>
        </div>
      </div>

      {/* Per-level cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:20 }}>
        {levels.map(s => {
          const data     = progress[s.id];
          const history  = data.history || [];
          const accuracy = calcAccuracy(history);       // null if no data
          const trend    = getTrend(history);
          const answered = history.length;
          const pct      = accuracy ?? 0;

          return (
            <div key={s.id} style={{ padding:"16px 18px", borderRadius:16, background: s.color, border:`1px solid ${s.border}` }}>

              {/* Header row */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span>{s.emoji}</span>
                  <span style={{ fontFamily:"'Playfair Display', serif", fontSize:16, fontWeight:700, color:"var(--cream)" }}>{s.label}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {trend && (
                    <span style={{ fontSize:16, fontWeight:700, color: trendColor[trend] }}>{trendIcon[trend]}</span>
                  )}
                  <div style={{ textAlign:"right" }}>
                    <span style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:700, color: s.bar }}>
                      {accuracy !== null ? `${pct}%` : "—"}
                    </span>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)" }}>
                      {answered}/{WINDOW_SIZE} answers
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height:6, borderRadius:99, background:"rgba(255,255,255,0.08)", marginBottom:10 }}>
                <div style={{
                  height:"100%", borderRadius:99,
                  width:`${pct}%`,
                  background: s.bar,
                  transition:"width 1s cubic-bezier(0.4,0,0.2,1)"
                }}/>
              </div>

              {/* History dots — last 20 answers as ● ● ○ */}
              {history.length > 0 && (
                <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                  {history.map((correct, i) => (
                    <div key={i} style={{
                      width:8, height:8, borderRadius:"50%",
                      background: correct ? s.bar : "rgba(239,68,68,0.5)",
                      opacity: 0.4 + (i / history.length) * 0.6, // older = more faded
                    }}/>
                  ))}
                  {/* Empty slots remaining in window */}
                  {Array.from({ length: WINDOW_SIZE - history.length }).map((_, i) => (
                    <div key={`empty-${i}`} style={{
                      width:8, height:8, borderRadius:"50%",
                      background:"rgba(255,255,255,0.1)",
                    }}/>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Weak notes */}
      {weakNotes.length > 0 && (
        <div style={{ padding:"14px 18px", borderRadius:16, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", marginBottom:16 }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>Focus on these</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {weakNotes.map(n => (
              <span key={n} style={{ padding:"5px 12px", borderRadius:99, background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", color:"#f87171", fontSize:12, fontFamily:"'Playfair Display', serif" }}>{n}</span>
            ))}
          </div>
        </div>
      )}

      {/* Export + Reset */}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={exportProgress} style={{
          flex:1, padding:"12px", borderRadius:12,
          background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
          color:"rgba(255,255,255,0.6)", fontSize:13, cursor:"pointer"
        }}>⬇ Export data</button>
        <button onClick={() => setConfirmReset(true)} style={{
          flex:1, padding:"12px", borderRadius:12,
          background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
          color:"#f87171", fontSize:13, cursor:"pointer"
        }}>🗑 Reset progress</button>
      </div>

      {/* Reset confirm overlay */}
      {confirmReset && (
        <div style={{
          position:"absolute", inset:0, background:"rgba(0,0,0,0.85)",
          display:"flex", alignItems:"center", justifyContent:"center", zIndex:20, padding:32, borderRadius:44
        }}>
          <div style={{ background:"#1a1a2e", borderRadius:20, padding:28, border:"1px solid rgba(255,255,255,0.1)", textAlign:"center" }}>
            <div style={{ fontFamily:"'Playfair Display', serif", fontSize:20, fontWeight:700, color:"var(--cream)", marginBottom:8 }}>Reset everything?</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:24, lineHeight:1.6 }}>All your progress will be permanently deleted from this device.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setConfirmReset(false)} style={{ flex:1, padding:"12px", borderRadius:12, background:"rgba(255,255,255,0.08)", border:"none", color:"var(--cream)", fontSize:14, cursor:"pointer" }}>Cancel</button>
              <button onClick={() => { resetProgress(); setConfirmReset(false); }} style={{ flex:1, padding:"12px", borderRadius:12, background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.4)", color:"#f87171", fontSize:14, cursor:"pointer", fontWeight:700 }}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("home");
  const [selectedScale, setSelectedScale] = useState("E");
  const [selectedSaptak, setSelectedSaptak] = useState("middle");
  const saIndex = SCALES.indexOf(selectedScale);
  const { progress, recordAnswer, recordPractice, resetProgress, exportProgress } = useProgress();

  const nav = (target) => setScreen(target);

  const handleNavFromHome = (id) => {
    if (id === "progress") { nav("progress"); return; }
    nav(id);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap');
        :root {
          --gold: #d4af37;
          --gold-dim: #a88d2c;
          --cream: #f5f0e8;
          --bg: #0d0d1a;
        }
        * { box-sizing: border-box; margin:0; padding:0; }
        body { background: #0a0a14; display:flex; align-items:center; justify-content:center; min-height:100vh; font-family: 'Playfair Display', serif; }
        button { font-family: inherit; }
        @keyframes wave {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.6); }
        }
      `}</style>

      {/* Phone frame */}
      <div style={{
        width: 390, height: 780,
        background: "var(--bg)",
        borderRadius: 44,
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 80px rgba(212,175,55,0.03)",
      }}>
        {/* Subtle gradient bg decoration */}
        <div style={{
          position:"absolute", top:-100, right:-80, width:300, height:300,
          background:"radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)",
          pointerEvents:"none"
        }}/>
        <div style={{
          position:"absolute", bottom:-60, left:-60, width:250, height:250,
          background:"radial-gradient(circle, rgba(100,60,200,0.06) 0%, transparent 70%)",
          pointerEvents:"none"
        }}/>

        <div style={{ height:"100%", overflowY:"auto", color:"var(--cream)", position:"relative", zIndex:1 }}>
          {screen === "home"       && <HomeScreen onNavigate={handleNavFromHome} selectedScale={selectedScale} onSelectScale={setSelectedScale} selectedSaptak={selectedSaptak} onSelectSaptak={setSelectedSaptak} />}
          {screen === "learn"      && <LearnScreen onBack={() => nav("home")} saIndex={saIndex} saptak={selectedSaptak} recordPractice={recordPractice} />}
          {screen === "quiz"       && <QuizScreen  onBack={() => nav("home")} saIndex={saIndex} saptak={selectedSaptak} recordAnswer={recordAnswer} />}
          {screen === "progress"   && <ProgressScreen onBack={() => nav("home")} progress={progress} resetProgress={resetProgress} exportProgress={exportProgress} />}
        </div>

        {/* Bottom nav hint */}
        <div style={{
          position:"absolute", bottom:12, left:"50%", transform:"translateX(-50%)",
          width:120, height:4, borderRadius:99, background:"rgba(255,255,255,0.15)"
        }}/>
      </div>
    </>
  );
}
