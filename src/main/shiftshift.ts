// Double-Shift global capture for Windows.
//
// Copper uses macOS Accessibility APIs to read the current selection when you
// double-tap Shift. The Windows equivalent: a low-level keyboard hook
// (WH_KEYBOARD_LL) that watches for two clean Shift taps, then simulates
// Ctrl+C and checks GetClipboardSequenceNumber() to see whether a selection
// was actually copied. Electrobun's GlobalShortcut API can't express a tap
// sequence, so we run this as a tiny hidden PowerShell/C# helper process and
// talk to it over stdout.

import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// PowerShell single-quoted here-string: no interpolation, safe to embed C#.
export const HELPER_SCRIPT = `
param([int]$TapMs = 400, [int]$VkA = 160, [int]$VkB = 161)
$ErrorActionPreference = 'Stop'
$src = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class ShiftShift {
    const int WH_KEYBOARD_LL = 13;
    const int WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101;
    const int WM_SYSKEYDOWN = 0x0104, WM_SYSKEYUP = 0x0105;
    const byte VK_CONTROL = 0x11, VK_C = 0x43;
    const uint KEYEVENTF_KEYUP = 0x0002;
    // max ms between the two taps; set from PowerShell before Run()
    public static int DoubleTapMs = 400;
    // left/right virtual-key codes of the tap key (defaults: L/R Shift)
    public static int TapVkA = 0xA0, TapVkB = 0xA1;

    delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll")]
    static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
    [DllImport("user32.dll")]
    static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("kernel32.dll")]
    static extern IntPtr GetModuleHandle(string lpModuleName);

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG {
        public IntPtr hwnd; public uint message; public UIntPtr wParam;
        public IntPtr lParam; public uint time; public int ptX; public int ptY;
    }

    // keep a reference so the delegate is not garbage collected
    static LowLevelKeyboardProc procRef = HookProc;
    static Stopwatch clock = Stopwatch.StartNew();
    static long lastShiftUp = 0;
    static bool otherKeyUsed = false;
    static long lastTrigger = 0;

    static IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            int vk = Marshal.ReadInt32(lParam); // KBDLLHOOKSTRUCT.vkCode
            int msg = wParam.ToInt32();
            bool isShift = vk == TapVkA || vk == TapVkB;

            if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) {
                if (!isShift) {
                    // Shift used as a modifier or some other key: reset sequence
                    otherKeyUsed = true;
                    lastShiftUp = 0;
                }
            } else if (msg == WM_KEYUP || msg == WM_SYSKEYUP) {
                if (isShift) {
                    long now = clock.ElapsedMilliseconds;
                    if (otherKeyUsed) {
                        lastShiftUp = 0;
                    } else if (lastShiftUp != 0 && (now - lastShiftUp) < DoubleTapMs) {
                        lastShiftUp = 0;
                        if (now - lastTrigger > 500) {
                            lastTrigger = now;
                            // never block inside a low-level hook: capture on the pool
                            ThreadPool.QueueUserWorkItem(delegate(object s) { TriggerCapture(); });
                        }
                    } else {
                        lastShiftUp = now;
                    }
                    otherKeyUsed = false;
                }
            }
        }
        return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
    }

    static void TriggerCapture() {
        uint seqBefore = GetClipboardSequenceNumber();
        // simulate Ctrl+C in the foreground app to copy the current selection
        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        keybd_event(VK_C, 0, 0, UIntPtr.Zero);
        keybd_event(VK_C, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        // wait for the clipboard to actually change (up to ~600ms)
        for (int i = 0; i < 30; i++) {
            Thread.Sleep(20);
            if (GetClipboardSequenceNumber() != seqBefore) {
                Console.WriteLine("CAPTURE");
                Console.Out.Flush();
                return;
            }
        }
        Console.WriteLine("NOCHANGE");
        Console.Out.Flush();
    }

    public static void Run() {
        IntPtr hook = SetWindowsHookEx(WH_KEYBOARD_LL, procRef, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) {
            Console.WriteLine("HOOKFAIL");
            Console.Out.Flush();
            return;
        }
        Console.WriteLine("READY");
        Console.Out.Flush();
        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) { }
    }
}
'@
Add-Type -TypeDefinition $src -Language CSharp
[ShiftShift]::DoubleTapMs = $TapMs
[ShiftShift]::TapVkA = $VkA
[ShiftShift]::TapVkB = $VkB
[ShiftShift]::Run()
`;

// left/right VK code pairs per selectable tap key
export const TAP_KEY_VKS: Record<string, [number, number]> = {
  shift: [0xa0, 0xa1],
  ctrl: [0xa2, 0xa3],
  alt: [0xa4, 0xa5],
};

export interface ShiftShiftHandle {
  stop(): void;
}

export function startShiftShiftHelper(
  onCapture: () => void,
  onStatus?: (line: string) => void,
  tapMs = 400,
  tapKey = "shift"
): ShiftShiftHandle | null {
  if (process.platform !== "win32") return null;
  const [vkA, vkB] = TAP_KEY_VKS[tapKey] ?? TAP_KEY_VKS.shift;

  const scriptPath = join(tmpdir(), "oxide-shiftshift.ps1");
  let child: ChildProcess | null = null;

  try {
    // write the helper script fresh each launch
    writeFileSync(scriptPath, HELPER_SCRIPT, "utf8");

    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath, "-TapMs", String(Math.max(150, Math.min(10_000, Math.round(tapMs) || 400))), "-VkA", String(vkA), "-VkB", String(vkB)],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );

    let buf = "";
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line === "CAPTURE") onCapture();
        else if (line) onStatus?.(line);
      }
    });

    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      console.error("[oxide:shiftshift]", chunk.trim());
    });

    child.on("exit", (code) => {
      console.warn("[oxide:shiftshift] helper exited with code", code);
    });
  } catch (err) {
    console.error("[oxide:shiftshift] failed to start helper:", err);
    return null;
  }

  const stop = () => {
    try {
      child?.kill();
    } catch {}
  };
  process.on("exit", stop);
  return { stop };
}