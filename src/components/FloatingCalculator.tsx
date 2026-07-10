/**
 * FloatingCalculator.tsx
 *
 * An in-page, draggable floating calculator panel with Apple-style design.
 * Usage: Place this component anywhere that renders for all users (e.g. AppLayout.tsx).
 *
 * Features:
 *  - Draggable panel with position persistence (localStorage)
 *  - Standard mode with Apple-style keypad
 *  - Ft·In·Fr mode for construction measurements
 *  - Full keyboard support
 *  - Persistent state (mode, position) across sessions
 *  - Download button for Windows installer with animated popup
 *  - Automatic dark/light mode detection
 *
 * Bug fixes:
 *  FIX 1 — = shows result in main display (not only the history list)
 *  FIX 2 — Pressing any operator resets cursor to the Feet field
 *  FIX 3 — × and ÷ take a plain scalar second operand, not ft/in/fraction
 *  FIX 4 — Unicode escapes are safe (no raw escapes inside template literals)
 *  FIX 5 — Debounce timer is a useRef; mutating it never triggers a re-render
 *  FIX 6 — Number overflow protection (> 1e15 → "Overflow")
 *  FIX 7 — Removed isApplying state that caused an infinite useEffect loop
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Calculator, X, GripHorizontal, Delete, Download, Laptop } from 'lucide-react';

/* ── Error boundary ─────────────────────────────── */

class CalculatorErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FloatingCalculator error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 20, background: '#1c1c1e', borderRadius: 18,
          color: '#ff453a', textAlign: 'center',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 4 }}>
            Please close and reopen the calculator
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Ft·In·Fr helpers ────────────────────────────── */

const FRACS = [
  '0','1/16','1/8','3/16','1/4','5/16','3/8','7/16',
  '1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16',
] as const;

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  return b === 0 ? a : gcd(b, a % b);
}

function fracToIn(f: string): number {
  if (!f || f === '0') return 0;
  const [n, d] = f.split('/').map(Number);
  if (!d || isNaN(n) || isNaN(d)) return 0;
  return n / d;
}

function toTotalIn(ft: number, inch: number, frac: string): number {
  return ft * 12 + (inch || 0) + fracToIn(frac);
}

function applyOp(a: number, b: number, op: string): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b !== 0 ? a / b : NaN;
    default:  return b;
  }
}

function fmtFI(totalInches: number): string {
  if (isNaN(totalInches) || !isFinite(totalInches)) return 'Error';
  if (Math.abs(totalInches) > 1e15) return 'Overflow';
  if (totalInches === 0) return '0"';

  const neg  = totalInches < 0;
  const abs  = Math.abs(totalInches);
  const ft   = Math.floor(abs / 12);
  const rem  = abs - ft * 12;
  const inW  = Math.floor(rem);
  const fd   = rem - inW;
  let s16    = Math.round(fd * 16);

  if (s16 === 16) {
    const nA = abs + (1 - fd);
    const nF = Math.floor(nA / 12);
    const nR = nA - nF * 12;
    const nI = Math.floor(nR);
    return `${neg ? '-' : ''}${nF > 0 || nA < 12 ? `${nF}' ` : ''}${nI}"`;
  }

  let df = '';
  if (s16 !== 0) { const g = gcd(s16, 16); df = ` ${s16 / g}/${16 / g}`; }

  const parts: string[] = [];
  if (ft > 0 || abs < 12) parts.push(`${ft}'`);
  if (inW > 0 || df || (ft === 0 && inW === 0 && !df)) parts.push(`${inW}${df}"`);
  return (neg ? '-' : '') + parts.join(' ');
}

interface FiHistItem { expr: string; result: string; }

/* ── localStorage helpers ──────────────────────── */

const LS_OPEN = 'ikt-calc-open';
const LS_POS  = 'ikt-calc-pos';
const LS_MODE = 'ikt-calc-mode';

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function writeLS(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

/* ── Keypad layout constants ──────────────────── */

const SIMPLE_LAYOUT: [string, string, boolean?][] = [
  ['AC','fn'], ['±','fn'], ['%','fn'],  ['÷','op'],
  ['7','num'], ['8','num'], ['9','num'], ['×','op'],
  ['4','num'], ['5','num'], ['6','num'], ['−','op'],
  ['1','num'], ['2','num'], ['3','num'], ['+','op'],
  ['0','num',true],          ['.','num'], ['=','eq'],
];

const FI_NUM_LAYOUT = ['7','8','9','4','5','6','1','2','3','.','0','⌫'] as const;
const OP_SYM: Record<string, string> = { '+':'+', '-':'−', '*':'×', '/':'÷' };
const PANEL_WIDTH = 312;

/* ── Theme detection ──────────────────────────── */

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return document.documentElement.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
    };
    
    // Also check for class changes on document
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    mediaQuery.addEventListener('change', handler);
    return () => {
      mediaQuery.removeEventListener('change', handler);
      observer.disconnect();
    };
  }, []);

  return isDark;
}

/* ═══════════════════════════════════════════════════════
   Download Popup Component - Auto Dark/Light Theme
   (Windows only)
═══════════════════════════════════════════════════════ */

function DownloadPopup({ onClose, onDownload }: {
  onClose: () => void;
  onDownload: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [selected, setSelected] = useState(false);
  const isDark = useTheme();

  const handleDownloadClick = () => {
    setSelected(true);
    setTimeout(() => {
      onDownload();   
      setSelected(false);
    }, 300);
  };

  return (
    <div className={`fc-download-overlay ${isDark ? 'dark' : 'light'}`} onClick={onClose}>
      <div className={`fc-download-popup ${isDark ? 'dark' : 'light'}`} onClick={(e) => e.stopPropagation()}>
        <button className={`fc-download-close ${isDark ? 'dark' : 'light'}`} onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="fc-download-header">
          <div className={`fc-download-icon-wrap ${isDark ? 'dark' : 'light'}`}>
            <Download size={28} className="fc-download-icon" />
          </div>
          <h3 className={isDark ? 'dark' : 'light'}>Download Calculator</h3>
          <p className={isDark ? 'dark' : 'light'}>Get the Windows app to get started</p>
        </div>

        <div className="fc-download-options">
          <button 
            className={`fc-download-option windows ${isDark ? 'dark' : 'light'} ${hovered ? 'hovered' : ''} ${selected ? 'selected' : ''}`}
            onClick={handleDownloadClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className={`fc-download-icon-container windows-icon ${isDark ? 'dark' : 'light'}`}>
              <Laptop size={28} />
            </div>
            <div className="fc-download-info">
              <span className={`fc-download-os ${isDark ? 'dark' : 'light'}`}>Windows</span>
              <span className={`fc-download-version ${isDark ? 'dark' : 'light'}`}>Version 1.0.0</span>
            </div>
            <span className="fc-download-badge windows-badge">
              <Download size={12} />
              Download
            </span>
          </button>
        </div>

        <div className="fc-download-footer">
          <div className={`fc-download-features ${isDark ? 'dark' : 'light'}`}>
            <span>✨ Free forever</span>
            <span>🔒 Secure download</span>
            <span>⚡ Instant setup</span>
          </div>
          <span className={`fc-download-size ${isDark ? 'dark' : 'light'}`}>~75 MB • Compatible with Windows</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Component
═══════════════════════════════════════════════════════ */

export function FloatingCalculator() {
  /* ── Persistent UI state ─────────────────────── */
  const [isOpen, setIsOpen] = useState(() => readLS(LS_OPEN, false));
  const [mode, setMode]     = useState<'simple' | 'fi'>(() => readLS(LS_MODE, 'simple'));
  const [pos, setPos]       = useState<{ x: number; y: number }>(() => {
    const saved = readLS<{ x: number; y: number } | null>(LS_POS, null);
    if (saved && typeof saved.x === 'number') return saved;
    return {
      x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - PANEL_WIDTH - 16) : 100,
      y: 80,
    };
  });
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

  const panelRef  = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, dx: 0, dy: 0 });

  useEffect(() => { writeLS(LS_OPEN, isOpen); }, [isOpen]);
  useEffect(() => { writeLS(LS_MODE, mode);   }, [mode]);
  useEffect(() => { writeLS(LS_POS, pos);     }, [pos]);

  /* ── Keep panel on-screen on resize ─────────── */
  useEffect(() => {
    const onResize = () => {
      const w = panelRef.current?.offsetWidth  ?? PANEL_WIDTH;
      const h = panelRef.current?.offsetHeight ?? 480;
      setPos(p => ({
        x: Math.min(Math.max(8, p.x), window.innerWidth  - w - 8),
        y: Math.min(Math.max(8, p.y), window.innerHeight - h - 8),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ── Drag (global pointer listeners) ─────────── */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragState.current.dragging) return;
      const w = panelRef.current?.offsetWidth  ?? PANEL_WIDTH;
      const h = panelRef.current?.offsetHeight ?? 480;
      setPos({
        x: Math.min(Math.max(8, e.clientX - dragState.current.dx), window.innerWidth  - w - 8),
        y: Math.min(Math.max(8, e.clientY - dragState.current.dy), window.innerHeight - h - 8),
      });
    };
    const onUp = () => { dragState.current.dragging = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, []);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragState.current = { dragging: true, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current.dragging = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  /* ── Download handler (Windows only) ─────────── */
  const WINDOWS_EXE_URL =
  'https://github.com/zeehaancode21/ikt-management-frontend/releases/download/v1.0.0/windows.exe';

const handleDownload = useCallback(() => {
  const link = document.createElement('a');
  link.href = WINDOWS_EXE_URL;
  link.download = 'windows.exe';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setShowDownloadPopup(false);
}, []);

  /* ══════════════════════════════════════════════
     STANDARD MODE STATE
  ══════════════════════════════════════════════ */
  const [display,             setDisplay]             = useState('0');
  const [prevValue,           setPrevValue]           = useState<number | null>(null);
  const [operation,           setOperation]           = useState<string | null>(null);
  const [waitingForOperand,   setWaitingForOperand]   = useState(false);
  const [shouldResetOnDigit,  setShouldResetOnDigit]  = useState(false);

  const sCompute = useCallback((a: number, b: number, op: string): number | 'Error' | 'Overflow' => {
    let r: number;
    switch (op) {
      case '+': r = a + b; break;
      case '−': r = a - b; break;
      case '×': r = a * b; break;
      case '÷': if (b === 0) return 'Error'; r = a / b; break;
      default:  return b;
    }
    if (!isFinite(r)) return 'Error';
    if (Math.abs(r) > 1e15) return 'Overflow';
    return parseFloat(r.toFixed(10));
  }, []);

  const clearAll = useCallback(() => {
    setDisplay('0'); setPrevValue(null); setOperation(null);
    setWaitingForOperand(false); setShouldResetOnDigit(false);
  }, []);

  const inputDigit = useCallback((d: string) => {
    setDisplay(prev => {
      if (prev === 'Error' || prev === 'Overflow') return d;
      if (prev.replace('-','').replace('.','').length >= 12) return prev;
      return prev === '0' ? d : prev + d;
    });
    setWaitingForOperand(false);
    setShouldResetOnDigit(false);
  }, []);

  const inputDecimal = useCallback(() => {
    setDisplay(prev => {
      if (prev === 'Error' || prev === 'Overflow') return '0.';
      if (prev.includes('.')) return prev;
      return prev + '.';
    });
    setWaitingForOperand(false);
    setShouldResetOnDigit(false);
  }, []);

  const backspace = useCallback(() => {
    setDisplay(prev => {
      if (prev === 'Error' || prev === 'Overflow') return '0';
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) return '0';
      return prev.slice(0, -1);
    });
  }, []);

  const handleOperation = useCallback((op: string) => {
    setDisplay(prev => {
      if (prev === 'Error' || prev === 'Overflow') { clearAll(); return '0'; }
      return prev;
    });
    setPrevValue(pv => {
      const cur = parseFloat(display);
      if (pv !== null && !waitingForOperand) {
        const r = sCompute(pv, cur, operation || '');
        if (r === 'Error' || r === 'Overflow') {
          setDisplay(r); setOperation(null); setWaitingForOperand(false); return null;
        }
        setDisplay(String(r));
        return r;
      }
      return cur;
    });
    setOperation(op);
    setWaitingForOperand(true);
    setShouldResetOnDigit(false);
  }, [display, waitingForOperand, operation, sCompute, clearAll]);

  const handleEquals = useCallback(() => {
    if (prevValue === null || !operation) return;
    const cur = parseFloat(display);
    const r   = sCompute(prevValue, cur, operation);
    if (r === 'Error' || r === 'Overflow') {
      setDisplay(r); setPrevValue(null); setOperation(null); setWaitingForOperand(false); return;
    }
    setDisplay(String(r));
    setPrevValue(null);
    setOperation(null);
    setWaitingForOperand(false);
    setShouldResetOnDigit(true);
  }, [display, prevValue, operation, sCompute]);

  const simplePress = useCallback((k: string) => {
    if (waitingForOperand || shouldResetOnDigit) {
      if (/^[0-9]$/.test(k)) { setDisplay(k); setWaitingForOperand(false); setShouldResetOnDigit(false); return; }
    }
    switch (k) {
      case 'AC': clearAll(); break;
      case '±':
        setDisplay(d => (d !== '0' && d !== 'Error' && d !== 'Overflow')
          ? (d.startsWith('-') ? d.slice(1) : '-' + d) : d);
        break;
      case '%':
        setDisplay(d => String(parseFloat(d) / 100));
        break;
      case '⌫': backspace(); break;
      case '÷': case '×': case '−': case '+': handleOperation(k); break;
      case '=': handleEquals(); break;
      case '.': inputDecimal(); break;
      default:  inputDigit(k); break;
    }
  }, [waitingForOperand, shouldResetOnDigit, clearAll, backspace, handleOperation, handleEquals, inputDecimal, inputDigit]);

  // Keyboard handler — standard mode
  useEffect(() => {
    if (!isOpen || mode !== 'simple') return;
    const map: Record<string, string> = {
      '/':'÷', '*':'×', '-':'−', '+':'+',
      'Enter':'=', '=':'=',
      'Backspace':'⌫', 'Delete':'⌫', 'Escape':'AC',
      '.':'.', '%':'%',
    };
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); simplePress(e.key); return; }
      if (map[e.key])             { e.preventDefault(); simplePress(map[e.key]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, mode, simplePress]);

  /* ══════════════════════════════════════════════
     FT·IN·FR MODE STATE
  ══════════════════════════════════════════════ */

  const [fiHistory,     setFiHistory]     = useState<FiHistItem[]>([]);
  const [fiAccum,       setFiAccum]       = useState<number | null>(null);
  const [fiOp,          setFiOp]          = useState<string | null>(null);
  const [fiNewEntry,    setFiNewEntry]    = useState(true);
  const [curFt,         setCurFt]         = useState(0);
  const [curIn,         setCurIn]         = useState(0);
  const [curFr,         setCurFr]         = useState('0');
  const [fiInputValue,  setFiInputValue]  = useState('');
  const [fiInputTarget, setFiInputTarget] = useState<'ft' | 'in'>('ft');
  const [fiScalarValue, setFiScalarValue] = useState('');    // FIX 3
  const [fiLastResult,  setFiLastResult]  = useState<number | null>(null); // FIX 1

  // FIX 5 / FIX 7: timer as a ref — mutations never cause re-renders
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isScalarEntry = fiOp === '*' || fiOp === '/';

  const getCurTotal = useCallback(
    () => toTotalIn(curFt, curIn, curFr),
    [curFt, curIn, curFr],
  );

  const getCurEntryValue = useCallback(() => {
    if (isScalarEntry) { const n = parseFloat(fiScalarValue); return isNaN(n) ? 0 : n; }
    return toTotalIn(curFt, curIn, curFr);
  }, [isScalarEntry, fiScalarValue, curFt, curIn, curFr]);

  const applyFiInput = useCallback((value: string, target: 'ft' | 'in') => {
    if (!value) return;
    const n = parseFloat(value);
    if (isNaN(n)) return;
    if (target === 'ft') { setCurFt(Math.min(Math.max(0, n), 1e9)); }
    else                 { setCurIn(Math.max(0, Math.min(11, Math.round(n)))); }
    setFiNewEntry(true);
  }, []);

  const selectFiField = useCallback((target: 'ft' | 'in') => {
    setFiLastResult(null);
    setFiInputTarget(target);
    setFiInputValue(target === 'ft' ? String(curFt) : String(curIn));
  }, [curFt, curIn]);

  const handleFiNumberInput = useCallback((d: string) => {
    setFiLastResult(null);

    if (isScalarEntry) {
      // FIX 3: plain number for × and ÷
      if (d === '⌫') { setFiScalarValue(v => v.slice(0, -1)); return; }
      if (d === '.') {
        setFiScalarValue(v => v.includes('.') ? v : (v === '' ? '0.' : v + '.')); return;
      }
      setFiScalarValue(v => {
        if (v.replace('.','').length >= 9) return v;
        return v === '0' ? d : v + d;
      });
      return;
    }

    if (d === '⌫') { setFiInputValue(v => v.slice(0, -1)); return; }
    if (d === '.') {
      if (fiInputTarget !== 'ft') return;
      setFiInputValue(v => v.includes('.') ? v : v + '.');
      return;
    }
    setFiInputValue(v => {
      if (v.replace('.','').length >= 6) return v;
      return v === '0' ? d : v + d;
    });
  }, [isScalarEntry, fiInputTarget]);

  // FIX 7: the debounce effect reads fiInputValue and fiInputTarget, but
  // writing to applyTimerRef (a ref) never re-triggers the effect — no loop.
  useEffect(() => {
    if (isScalarEntry) return;
    if (!fiInputValue)  return;

    if (applyTimerRef.current) { clearTimeout(applyTimerRef.current); }
    applyTimerRef.current = setTimeout(() => {
      applyFiInput(fiInputValue, fiInputTarget);
      applyTimerRef.current = null;
    }, 300);

    return () => {
      if (applyTimerRef.current) { clearTimeout(applyTimerRef.current); applyTimerRef.current = null; }
    };
  }, [fiInputValue, fiInputTarget, applyFiInput, isScalarEntry]);

  const flushFiInput = useCallback(() => {
    if (applyTimerRef.current) { clearTimeout(applyTimerRef.current); applyTimerRef.current = null; }
    if (!isScalarEntry && fiInputValue) applyFiInput(fiInputValue, fiInputTarget);
  }, [isScalarEntry, fiInputValue, fiInputTarget, applyFiInput]);

  const fiOpPress = useCallback((op: string) => {
    flushFiInput();
    const t = getCurEntryValue();

    setFiAccum(prev => {
      if (prev === null) return t;
      if (fiOp && !fiNewEntry) {
        const r = applyOp(prev, t, fiOp);
        if (isNaN(r) || !isFinite(r) || Math.abs(r) > 1e15) {
          // trigger clear
          setTimeout(() => fiClear(), 0);
          return prev;
        }
        return r;
      }
      return prev;
    });

    setFiOp(op);
    setFiNewEntry(true);
    setCurFt(0); setCurIn(0); setCurFr('0');
    setFiInputValue(''); setFiScalarValue(''); setFiLastResult(null);
    setFiInputTarget('ft'); // FIX 2
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushFiInput, getCurEntryValue, fiOp, fiNewEntry]);

  const fiEqual = useCallback(() => {
    flushFiInput();
    if (fiAccum === null || !fiOp) return;
    const t = getCurEntryValue();
    const r = applyOp(fiAccum, t, fiOp);
    if (isNaN(r) || !isFinite(r) || Math.abs(r) > 1e15) { fiClear(); return; }

    const secondStr = isScalarEntry ? String(t) : fmtFI(t);
    const exprStr   = `${fmtFI(fiAccum)} ${OP_SYM[fiOp] ?? fiOp} ${secondStr}`;

    setFiHistory(h => {
      const next = [...h, { expr: exprStr, result: fmtFI(r) }];
      return next.length > 20 ? next.slice(-20) : next;
    });
    setFiAccum(r);
    setFiOp(null);
    setFiNewEntry(true);
    setCurFt(0); setCurIn(0); setCurFr('0');
    setFiInputValue(''); setFiScalarValue('');
    setFiLastResult(r);   // FIX 1
    setFiInputTarget('ft'); // FIX 2
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushFiInput, fiAccum, fiOp, getCurEntryValue, isScalarEntry]);

  function fiClear() {
    if (applyTimerRef.current) { clearTimeout(applyTimerRef.current); applyTimerRef.current = null; }
    setFiAccum(null); setFiOp(null); setFiNewEntry(true);
    setCurFt(0); setCurIn(0); setCurFr('0');
    setFiInputValue(''); setFiScalarValue(''); setFiLastResult(null); setFiInputTarget('ft');
  }

  // Keyboard handler — Ft·In·Fr mode
  useEffect(() => {
    if (!isOpen || mode !== 'fi') return;
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); handleFiNumberInput(e.key); return; }
      switch (e.key) {
        case '.':       e.preventDefault(); handleFiNumberInput('.'); break;
        case 'Tab':
          if (isScalarEntry) return;
          e.preventDefault();
          selectFiField(fiInputTarget === 'ft' ? 'in' : 'ft');
          break;
        case 'Enter':   e.preventDefault(); fiEqual(); break;
        case 'Backspace':
        case 'Delete':  e.preventDefault(); handleFiNumberInput('⌫'); break;
        case 'Escape':
          e.preventDefault();
          setFiInputValue(''); setFiScalarValue('');
          if (applyTimerRef.current) { clearTimeout(applyTimerRef.current); applyTimerRef.current = null; }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, fiInputTarget, isScalarEntry, handleFiNumberInput, selectFiField, fiEqual]);

  /* ── Derived display values ──────────────────── */
  const curTotal  = getCurTotal();
  const fiDecVal  = fiLastResult !== null ? fiLastResult
                  : isScalarEntry ? (parseFloat(fiScalarValue) || 0) : curTotal;
  const fiResStr  = fiLastResult !== null ? fmtFI(fiLastResult)
                  : isScalarEntry ? (fiScalarValue || '0') : fmtFI(curTotal);
  const fiExprStr = fiAccum !== null && fiOp
    ? `${fmtFI(fiAccum)} ${OP_SYM[fiOp] ?? fiOp}` : '';

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */
  return (
    <CalculatorErrorBoundary>
      <>
        {/* FAB toggle button */}
        <button className="fc-fab" onClick={() => setIsOpen(o => !o)}
          title="Open Calculator" aria-label="Toggle calculator">
          <Calculator size={20} strokeWidth={2.2} />
        </button>

        {isOpen && (
          <div className="fc-panel" ref={panelRef} style={{ left: pos.x, top: pos.y, width: PANEL_WIDTH }}>

            {/* ── Header ── */}
            <div className="fc-header"
              onPointerDown={onHeaderPointerDown}
              onPointerUp={onHeaderPointerUp}>
              <GripHorizontal size={14} className="fc-grip" />
              <span className="fc-title">Calculator</span>
              <div className="fc-toggle-wrap">
                <button type="button" className={`fc-toggle-btn ${mode === 'simple' ? 'active' : ''}`}
                  onClick={() => setMode('simple')}>Standard</button>
                <button type="button" className={`fc-toggle-btn ${mode === 'fi' ? 'active' : ''}`}
                  onClick={() => setMode('fi')}>Ft·In·Fr</button>
              </div>
              <div className="fc-header-actions">
                <button type="button" className="fc-download-btn" 
                  onClick={() => setShowDownloadPopup(true)}
                  title="Download Calculator" aria-label="Download calculator">
                  <Download size={14} />
                </button>
                <button type="button" className="fc-close" onClick={() => setIsOpen(false)}
                  aria-label="Close calculator">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* ── Standard mode ── */}
            {mode === 'simple' && (
              <>
                <div className="fc-display">
                  <div className="fc-op-pending">
                    {operation && waitingForOperand ? operation : '\u00a0'}
                  </div>
                  <div className="fc-result">{display}</div>
                </div>
                <div className="fc-pad">
                  {SIMPLE_LAYOUT.map(([lbl, cls, isWide]) => (
                    <button key={lbl} type="button"
                      className={`fc-key fc-${cls}${isWide ? ' fc-wide' : ''}${
                        cls === 'op' && operation === lbl && waitingForOperand ? ' fc-op-active' : ''}`}
                      onClick={() => simplePress(lbl)}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ── Ft·In·Fr mode ── */}
            {mode === 'fi' && (
              <div className="fc-fi-body">
                <div className="fc-fi-scroll">
                  {/* Display */}
                  <div className="fc-fi-display">
                    <div className="fc-fi-expr">{fiExprStr || '\u00a0'}</div>
                    <div className="fc-fi-result">{fiResStr}</div>
                    <div className="fc-fi-decimal">
                      {isScalarEntry && fiLastResult === null
                        ? 'plain number (\u00d7/\u00f7)'
                        : `${fiDecVal.toFixed(4)}\u2033 decimal`}
                    </div>
                  </div>

                  {/* Entry card */}
                  <div className="fc-fi-card">
                    {isScalarEntry ? (
                      <div className="fc-fi-scalar-box">
                        <span className="fc-fi-seg-label">
                          {fiOp === '*' ? 'Multiply by' : 'Divide by'}
                        </span>
                        <span className="fc-fi-scalar-value">{fiScalarValue || '0'}</span>
                        <div className="fc-fi-hint">Enter a plain number, e.g.&nbsp;2</div>
                      </div>
                    ) : (
                      <>
                        <div className="fc-fi-segments">
                          <button type="button"
                            className={`fc-fi-segment ${fiInputTarget === 'ft' ? 'active' : ''}`}
                            onClick={() => selectFiField('ft')}>
                            <span className="fc-fi-seg-label">Feet</span>
                            <span className="fc-fi-seg-value">
                              {fiInputTarget === 'ft' && fiInputValue ? fiInputValue : curFt}
                            </span>
                          </button>
                          <span className="fc-fi-seg-divider">/</span>
                          <button type="button"
                            className={`fc-fi-segment ${fiInputTarget === 'in' ? 'active' : ''}`}
                            onClick={() => selectFiField('in')}>
                            <span className="fc-fi-seg-label">Inches</span>
                            <span className="fc-fi-seg-value">
                              {fiInputTarget === 'in' && fiInputValue ? fiInputValue : curIn}
                            </span>
                          </button>
                          <span className="fc-fi-seg-divider">+</span>
                          <div className="fc-fi-segment fc-fi-frac-seg">
                            <span className="fc-fi-seg-label">Fraction</span>
                            <select className="fc-fi-frac" value={curFr}
                              onChange={e => { setFiLastResult(null); setCurFr(e.target.value); setFiNewEntry(true); }}>
                              {FRACS.map(f => <option key={f} value={f}>{f === '0' ? '\u2014' : f}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="fc-fi-hint">
                          Tap Feet or Inches, then type below. Dropdown for 1/16&quot;.
                        </div>
                      </>
                    )}
                  </div>

                  {/* Numpad */}
                  <div className="fc-fi-numpad">
                    {FI_NUM_LAYOUT.map(lbl => (
                      <button key={lbl} type="button"
                        className={`fc-fi-numkey ${lbl === '⌫' ? 'fc-fi-numkey-del' : ''}`}
                        onClick={() => handleFiNumberInput(lbl)}
                        aria-label={lbl === '⌫' ? 'Backspace' : lbl}>
                        {lbl === '⌫' ? <Delete size={16} /> : lbl}
                      </button>
                    ))}
                  </div>

                  {/* History */}
                  <div className="fc-fi-history">
                    <div className="fc-fi-hist-label">History</div>
                    {fiHistory.length === 0
                      ? <div className="fc-fi-hist-empty">No calculations yet</div>
                      : [...fiHistory].reverse().map((h, i) => (
                        <div key={i} className="fc-fi-hist-item">
                          <div>{h.expr}</div>
                          <span>{h.result}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Pinned operator bar */}
                <div className="fc-fi-pinned">
                  <div className="fc-fi-ops">
                    {['+','-','*','/'].map(op => (
                      <button key={op} type="button"
                        className={`fc-fi-op ${fiOp === op && fiNewEntry ? 'fc-fi-op-active' : ''}`}
                        onClick={() => fiOpPress(op)}>
                        {OP_SYM[op]}
                      </button>
                    ))}
                  </div>
                  <div className="fc-fi-ops fc-fi-ops-bottom">
                    <button type="button" className="fc-fi-op fc-fi-action" onClick={fiClear}>Clear</button>
                    <button type="button" className="fc-fi-op fc-fi-eq" onClick={fiEqual}>=</button>
                  </div>
                </div>
              </div>
            )}

            <style>{PANEL_CSS}</style>
          </div>
        )}

        {/* Download Popup */}
        {showDownloadPopup && (
  <DownloadPopup
    onClose={() => setShowDownloadPopup(false)}
    onDownload={handleDownload}
  />
)}

        <style>{FAB_CSS}</style>
        <style>{DOWNLOAD_POPUP_CSS}</style>
      </>
    </CalculatorErrorBoundary>
  );
}

/* ════════════════════════════════════════════════
   CSS (separated for readability)
════════════════════════════════════════════════ */

const FAB_CSS = `
.fc-fab {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.06);
  background: linear-gradient(145deg, #2c2c2e, #1c1c1e);
  color: #fff; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  transition: all .25s cubic-bezier(.34,1.56,.64,1); flex-shrink: 0;
}
.fc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(10,132,255,.2); border-color: rgba(10,132,255,.3); }
`;

const PANEL_CSS = `
.fc-panel {
  position: fixed; z-index: 2000; max-height: 86vh;
  display: flex; flex-direction: column;
  background: #1c1c1e; border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 20px 60px rgba(0,0,0,0.6); overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif; color: #fff;
}
.fc-header {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px;
  background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05);
  cursor: grab; touch-action: none; flex-shrink: 0; user-select: none;
}
.fc-header:active { cursor: grabbing; }
.fc-grip  { color: #636366; flex-shrink: 0; }
.fc-title { font-size: 11px; font-weight: 600; letter-spacing: .1em; color: #8e8e93; text-transform: uppercase; flex-shrink: 0; }
.fc-toggle-wrap { display: flex; background: rgba(255,255,255,0.04); border-radius: 20px; padding: 2px; gap: 2px; margin-left: auto; }
.fc-toggle-btn  { background: transparent; border: none; padding: 3px 10px; border-radius: 20px; font-size: 9px; font-weight: 600; color: #8e8e93; cursor: pointer; transition: .2s; }
.fc-toggle-btn.active { background: linear-gradient(135deg,#0a84ff,#5ac8fa); color: #fff; }
.fc-toggle-btn:hover:not(.active) { color: #fff; }
.fc-header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.fc-download-btn { 
  background: rgba(255,255,255,.04); border: none; 
  color: #8e8e93; width: 22px; height: 22px; border-radius: 6px; 
  display: flex; align-items: center; justify-content: center; cursor: pointer; 
  transition: all .2s;
}
.fc-download-btn:hover { 
  background: rgba(10,132,255,.15); color: #0a84ff; 
  transform: scale(1.05);
}
.fc-close    { background: rgba(255,255,255,.04); border: none; color: #8e8e93; width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all .2s; }
.fc-close:hover { background: rgba(255,69,58,.15); color: #ff453a; transform: scale(1.05); }
.fc-display { background: #1c1c1e; padding: 20px 20px 16px; min-height: 88px; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-end; border-bottom: 1px solid rgba(255,255,255,0.03); flex-shrink: 0; }
.fc-op-pending { font-size: 13px; color: #ff9f0a; font-weight: 600; min-height: 16px; margin-bottom: 2px; }
.fc-result { font-size: 44px; font-weight: 300; color: #fff; max-width: 100%; overflow-x: auto; white-space: nowrap; line-height: 1.1; letter-spacing: -.5px; }
.fc-pad { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; padding: 12px 14px 16px; }
.fc-key { border: none; border-radius: 50%; aspect-ratio: 1; font-size: 22px; font-weight: 400; cursor: pointer; transition: all .1s ease; display: flex; align-items: center; justify-content: center; background: #333336; color: #fff; padding: 0; font-family: inherit; }
.fc-key:active { transform: scale(.94); opacity: .8; }
.fc-fn  { background: #3a3a3c; font-weight: 500; }
.fc-op  { background: #ff9f0a; font-weight: 500; font-size: 26px; }
.fc-op.fc-op-active { background: #fff; color: #ff9f0a; }
.fc-eq  { background: #0a84ff; font-weight: 500; font-size: 28px; }
.fc-wide { grid-column: span 2; border-radius: 50px; aspect-ratio: auto; padding: 0 0 0 28px; justify-content: flex-start; }
.fc-fi-body   { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.fc-fi-scroll { flex: 1; overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }
.fc-fi-pinned { flex-shrink: 0; background: #1c1c1e; border-top: 1px solid rgba(255,255,255,0.06); box-shadow: 0 -8px 16px rgba(0,0,0,.25); }
.fc-fi-display { background: linear-gradient(180deg,#232325,#1c1c1e); padding: 18px 20px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); flex-shrink: 0; text-align: right; }
.fc-fi-expr    { font-size: 12px; color: rgba(142,142,147,.7); font-family: 'SF Mono',monospace; min-height: 15px; }
.fc-fi-result  { font-size: 34px; font-weight: 300; color: #fff; line-height: 1.15; letter-spacing: -.3px; }
.fc-fi-decimal { font-size: 11px; color: #0a84ff; font-family: 'SF Mono',monospace; opacity: .8; margin-top: 2px; }
.fc-fi-card    { margin: 12px 12px 4px; flex-shrink: 0; }
.fc-fi-segments { display: flex; align-items: stretch; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 14px; padding: 8px; }
.fc-fi-segment  { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; background: rgba(255,255,255,0.02); border: 1.5px solid transparent; border-radius: 10px; padding: 8px 4px; cursor: pointer; transition: all .15s ease; min-width: 0; }
.fc-fi-segment.active { background: rgba(10,132,255,.12); border-color: #0a84ff; box-shadow: 0 0 0 3px rgba(10,132,255,.12); }
.fc-fi-segment:hover:not(.active) { background: rgba(255,255,255,.05); }
.fc-fi-seg-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; color: #8e8e93; }
.fc-fi-segment.active .fc-fi-seg-label { color: #5ac8fa; }
.fc-fi-seg-value { font-size: 19px; font-weight: 500; font-family: 'SF Mono',monospace; color: #fff; }
.fc-fi-seg-divider { align-self: center; color: #48484a; font-size: 15px; font-weight: 300; padding: 0 1px; }
.fc-fi-frac-seg { cursor: default; }
.fc-fi-frac { background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.08); border-radius: 7px; color: #fff; font-size: 13px; font-family: 'SF Mono',monospace; text-align: center; padding: 3px 4px; outline: none; width: 100%; cursor: pointer; }
.fc-fi-frac:focus { border-color: #0a84ff; }
.fc-fi-hint { font-size: 9.5px; color: #636366; text-align: center; margin-top: 7px; line-height: 1.4; padding: 0 6px; }
.fc-fi-scalar-box   { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: rgba(10,132,255,.08); border: 1.5px solid rgba(10,132,255,.4); border-radius: 14px; padding: 14px 8px; }
.fc-fi-scalar-value { font-size: 28px; font-weight: 500; font-family: 'SF Mono',monospace; color: #fff; }
.fc-fi-numpad  { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; padding: 10px 12px 6px; }
.fc-fi-numkey  { border: none; border-radius: 12px; padding: 13px 0; font-size: 18px; font-weight: 500; background: #2c2c2e; color: #fff; cursor: pointer; transition: all .1s ease; font-family: 'SF Mono',monospace; display: flex; align-items: center; justify-content: center; }
.fc-fi-numkey:active { transform: scale(.95); background: #3a3a3c; }
.fc-fi-numkey-del { background: rgba(255,69,58,.1); color: #ff453a; }
.fc-fi-numkey-del:active { background: rgba(255,69,58,.2); }
.fc-fi-ops { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; padding: 4px 12px; flex-shrink: 0; }
.fc-fi-ops-bottom { grid-template-columns: 1fr 1fr; padding-top: 0; padding-bottom: 10px; }
.fc-fi-op  { padding: 11px 0; border: none; border-radius: 10px; background: #ff9f0a; color: #fff; font-size: 17px; font-weight: 500; cursor: pointer; transition: all .1s ease; }
.fc-fi-op:active { transform: scale(.95); opacity: .85; }
.fc-fi-op-active { background: #fff !important; color: #ff9f0a !important; }
.fc-fi-action { background: rgba(255,69,58,.12) !important; color: #ff453a !important; font-size: 13px; font-weight: 600; }
.fc-fi-action:active { background: rgba(255,69,58,.22) !important; }
.fc-fi-eq { background: #0a84ff !important; color: #fff !important; font-size: 19px; font-weight: 500; }
.fc-fi-eq:active { background: #409cff !important; }
.fc-fi-history     { flex-shrink: 0; padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid rgba(255,255,255,0.04); }
.fc-fi-hist-label  { font-size: 8.5px; color: #8e8e93; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; padding-top: 6px; padding-bottom: 2px; }
.fc-fi-hist-item   { background: rgba(255,255,255,.025); border-radius: 8px; padding: 6px 10px; font-size: 11px; color: #8e8e93; font-family: 'SF Mono',monospace; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.fc-fi-hist-item span { color: #5ac8fa; font-weight: 600; flex-shrink: 0; }
.fc-fi-hist-empty  { font-size: 10.5px; color: rgba(142,142,147,.35); text-align: center; padding: 14px 0; }
.fc-panel ::-webkit-scrollbar { width: 3px; }
.fc-panel ::-webkit-scrollbar-thumb { background: rgba(10,132,255,.2); border-radius: 4px; }
`;

const DOWNLOAD_POPUP_CSS = `
/* ── Overlay ── */
.fc-download-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fc-overlay-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.fc-download-overlay.light {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
}
.fc-download-overlay.dark {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
}

/* ── Popup Container ── */
.fc-download-popup {
  border-radius: 32px;
  padding: 40px 44px 32px;
  max-width: 480px;
  width: 92%;
  animation: fc-popup-slide-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
  transform-origin: center;
}
.fc-download-popup.light {
  background: #ffffff;
  box-shadow: 
    0 30px 80px rgba(0, 0, 0, 0.15),
    0 10px 30px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.fc-download-popup.dark {
  background: #1c1c1e;
  box-shadow: 
    0 30px 80px rgba(0, 0, 0, 0.5),
    0 10px 30px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* ── Close Button ── */
.fc-download-close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fc-download-close.light {
  background: #f5f5f7;
  color: #8e8e93;
}
.fc-download-close.dark {
  background: rgba(255, 255, 255, 0.08);
  color: #8e8e93;
}
.fc-download-close:hover {
  background: #ff3b30;
  color: #fff;
  transform: rotate(90deg) scale(1.05);
}
.fc-download-close:active {
  transform: scale(0.92);
}

/* ── Header ── */
.fc-download-header {
  text-align: center;
  margin-bottom: 32px;
}
.fc-download-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin-bottom: 16px;
  animation: fc-icon-bounce 2s ease-in-out infinite;
}
.fc-download-icon-wrap.light {
  background: linear-gradient(135deg, #007aff, #5ac8fa);
}
.fc-download-icon-wrap.dark {
  background: linear-gradient(135deg, #0a84ff, #5ac8fa);
}
.fc-download-icon {
  color: #fff;
  stroke-width: 2;
}
.fc-download-header h3 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 6px;
  letter-spacing: -0.5px;
}
.fc-download-header h3.light {
  color: #1c1c1e;
}
.fc-download-header h3.dark {
  color: #ffffff;
}
.fc-download-header p {
  font-size: 14px;
  margin: 0;
  font-weight: 400;
}
.fc-download-header p.light {
  color: #8e8e93;
}
.fc-download-header p.dark {
  color: #8e8e93;
}

/* ── Download Options ── */
.fc-download-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}
.fc-download-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1.5px solid;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  width: 100%;
  text-align: left;
}
.fc-download-option.light {
  background: #f8f8fa;
  border-color: #e5e5ea;
}
.fc-download-option.dark {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}
.fc-download-option:hover {
  transform: translateY(-3px) scale(1.01);
}
.fc-download-option.light:hover {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
}
.fc-download-option.dark:hover {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
}
.fc-download-option:active {
  transform: scale(0.97);
}
.fc-download-option.hovered.light {
  border-color: #007aff;
  background: #f0f7ff;
}
.fc-download-option.hovered.dark {
  border-color: #0a84ff;
  background: rgba(10, 132, 255, 0.1);
}
.fc-download-option.windows.hovered.light {
  border-color: #007aff;
  background: #f0f7ff;
}
.fc-download-option.windows.hovered.dark {
  border-color: #0a84ff;
  background: rgba(10, 132, 255, 0.1);
}
.fc-download-option.selected {
  animation: fc-option-select 0.3s ease;
}

/* ── Icon Container ── */
.fc-download-icon-container {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.3s ease;
}
.fc-download-icon-container.light.windows-icon {
  background: linear-gradient(135deg, #e8f0fe, #d4e2fb);
  color: #007aff;
}
.fc-download-icon-container.dark.windows-icon {
  background: rgba(10, 132, 255, 0.15);
  color: #0a84ff;
}
.fc-download-option.hovered .fc-download-icon-container {
  transform: scale(1.05) rotate(-3deg);
}

/* ── Info ── */
.fc-download-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fc-download-os.light {
  color: #1c1c1e;
}
.fc-download-os.dark {
  color: #ffffff;
}
.fc-download-version.light {
  color: #8e8e93;
}
.fc-download-version.dark {
  color: #8e8e93;
}

/* ── Badge ── */
.fc-download-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.02em;
  white-space: nowrap;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.windows-badge {
  background: linear-gradient(135deg, #007aff, #0055b3);
}
.fc-download-option:hover .fc-download-badge {
  transform: scale(1.05);
}
.fc-download-option.light:hover .windows-badge {
  box-shadow: 0 4px 16px rgba(0, 122, 255, 0.3);
}
.fc-download-option.dark:hover .windows-badge {
  box-shadow: 0 4px 16px rgba(10, 132, 255, 0.4);
}

/* ── Footer ── */
.fc-download-footer {
  text-align: center;
  padding-top: 8px;
}
.fc-download-features {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
}
.fc-download-features.light {
  color: #8e8e93;
}
.fc-download-features.dark {
  color: #8e8e93;
}
.fc-download-features span {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.8;
}
.fc-download-size.light {
  color: #aeaeb2;
}
.fc-download-size.dark {
  color: #636366;
}

/* ── Animations ── */
@keyframes fc-overlay-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes fc-popup-slide-up {
  from {
    opacity: 0;
    transform: translateY(40px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes fc-icon-bounce {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}
@keyframes fc-option-select {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.95);
  }
  100% {
    transform: scale(1);
  }
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .fc-download-popup {
    padding: 28px 20px 24px;
    border-radius: 24px;
  }
  .fc-download-option {
    padding: 14px 16px;
    gap: 12px;
  }
  .fc-download-os {
    font-size: 14px;
  }
  .fc-download-badge {
    font-size: 11px;
    padding: 4px 10px;
  }
  .fc-download-features {
    gap: 10px;
    font-size: 11px;
    flex-wrap: wrap;
  }
  .fc-download-icon-container {
    width: 40px;
    height: 40px;
  }
  .fc-download-icon-container svg {
    width: 22px;
    height: 22px;
  }
}
`;