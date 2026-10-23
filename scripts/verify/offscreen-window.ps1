# Keeps the integration test window off the visible desktop (#rgui, 2026-10-23): every 100 ms, any
# top-level window owned by a Code.exe whose command line names this scratch folder is moved to
# -10000,-10000 without activating it. Other VS Code windows (his own) are never touched.
param([Parameter(Mandatory = $true)][string]$Scratch, [int]$Seconds = 900)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OffscreenWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$deadline = (Get-Date).AddSeconds($Seconds)
$needle = (Resolve-Path -LiteralPath $Scratch).Path
while ((Get-Date) -lt $deadline) {
  $pids = @(Get-CimInstance Win32_Process -Filter "Name = 'Code.exe'" | Where-Object { $_.CommandLine -like "*$needle*" } | ForEach-Object { [uint32]$_.ProcessId })
  if ($pids.Count -gt 0) {
    [OffscreenWin]::EnumWindows({
      param($h, $l)
      $p = [uint32]0
      [void][OffscreenWin]::GetWindowThreadProcessId($h, [ref]$p)
      if ($pids -contains $p -and [OffscreenWin]::IsWindowVisible($h)) {
        $r = New-Object OffscreenWin+RECT
        [void][OffscreenWin]::GetWindowRect($h, [ref]$r)
        # SWP_NOSIZE 0x1 | SWP_NOZORDER 0x4 | SWP_NOACTIVATE 0x10
        if ($r.Left -gt -9000) { [void][OffscreenWin]::SetWindowPos($h, [IntPtr]::Zero, -10000, -10000, 0, 0, 0x15) }
      }
      return $true
    }, [IntPtr]::Zero) | Out-Null
  }
  Start-Sleep -Milliseconds 100
}
