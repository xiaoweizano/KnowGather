# Drives a native file dialog by window title.
# Usage: drive-dialog.ps1 -Title "选择要导入的文件" -Path "F:\path\to\file" [-Submit]
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Path,
  [switch]$Submit
)

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinApi {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

function Get-WindowTitle([IntPtr]$handle) {
  $buffer = New-Object System.Text.StringBuilder 512
  [void][WinApi]::GetWindowText($handle, $buffer, $buffer.Capacity)
  return $buffer.ToString()
}

# Find a visible top-level window whose title starts with the requested title.
$target = [IntPtr]::Zero
$found = $false
$deadline = (Get-Date).AddSeconds(12)

while (-not $found -and (Get-Date) -lt $deadline) {
  $processIds = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty Id
  foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) { continue }
    $handle = $process.MainWindowHandle
    $windowTitle = Get-WindowTitle $handle
    if ($windowTitle -like "$Title*" -and [WinApi]::IsWindowVisible($handle)) {
      $target = $handle
      $found = $true
      break
    }
  }
  if (-not $found) { Start-Sleep -Milliseconds 400 }
}

if (-not $found) {
  Write-Output "NOT_FOUND"
  exit 1
}

[void][WinApi]::SetForegroundWindow($target)
Start-Sleep -Milliseconds 500

# Verify the dialog really is focused before sending anything.
$foregroundTitle = Get-WindowTitle ([WinApi]::GetForegroundWindow())
if ($foregroundTitle -notlike "$Title*") {
  Write-Output "NOT_FOCUSED: $foregroundTitle"
  exit 2
}

# Paste the path rather than typing it, so no keystroke is interpreted as UI syntax.
[System.Windows.Forms.Clipboard]::SetText($Path)
Start-Sleep -Milliseconds 250
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 900

if ($Submit) {
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Write-Output "SUBMITTED"
} else {
  Write-Output "PASTED"
}
