# Saves screenshots of the integration test's own VS Code window, never the desktop and never
# any input: PrintWindow on the window whose title has "Extension Development Host".
# The suite writes <dir>\shot-N.want; this script answers with <dir>\shot-N.png and shot-N.done.
param([Parameter(Mandatory)][string]$Dir, [int]$Count = 3, [int]$TimeoutSec = 900)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class W {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int L, T, R, B; }
}
'@
$deadline = (Get-Date).AddSeconds($TimeoutSec)
for ($n = 1; $n -le $Count; $n++) {
  $want = Join-Path $Dir "shot-$n.want"
  while (-not (Test-Path $want)) {
    if ((Get-Date) -gt $deadline) { exit 1 }
    Start-Sleep -Milliseconds 300
  }
  $p = Get-Process Code -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like '*Extension Development Host*' } | Select-Object -First 1
  if ($p) {
    $r = New-Object W+RECT
    [void][W]::GetWindowRect($p.MainWindowHandle, [ref]$r)
    $bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $dc = $g.GetHdc()
    [void][W]::PrintWindow($p.MainWindowHandle, $dc, 2)
    $g.ReleaseHdc($dc)
    $bmp.Save((Join-Path $Dir "shot-$n.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  }
  Set-Content -Path (Join-Path $Dir "shot-$n.done") -Value 'done'
}
