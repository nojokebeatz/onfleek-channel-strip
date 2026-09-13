# OnFleek Channel Strip — read / set the Windows default MICROPHONE (all three roles).
#   audio-default.ps1 get                -> JSON { console, multimedia, communications } (friendly names)
#   audio-default.ps1 set "<DeviceDesc>" -> sets the capture endpoint whose short name matches, prints "SET <id>"
# Uses the same COM interface the Sound control panel uses (IPolicyConfig). No admin needed.
param([string]$Mode = 'get', [string]$Name = '', [string]$Adapter = '', [string]$Flow = 'Capture', [int]$Rate = 48000)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace OnFleekAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorCom {}
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, out IntPtr iface);
    int OpenPropertyStore(int stgmAccess, out IntPtr properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
  }
  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] public class PolicyConfigCom {}
  [Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string dev, IntPtr fmt);
    [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string dev, bool def, IntPtr fmt);
    [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string dev);
    [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string dev, IntPtr fmt, IntPtr mix);
    [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string dev, bool def, IntPtr a, IntPtr b);
    [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string dev, IntPtr p);
    [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string dev, IntPtr mode);
    [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string dev, IntPtr mode);
    [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string dev, bool fx, IntPtr key, IntPtr pv);
    [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string dev, bool fx, IntPtr key, IntPtr pv);
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string dev, int role);
    [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string dev, bool visible);
  }
  public static class Api {
    public static string DefaultCaptureId(int role) {
      try {
        var e = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom(); IMMDevice d; string id = "";
        if (e.GetDefaultAudioEndpoint(1, role, out d) == 0 && d != null) d.GetId(out id);
        return id;
      } catch (Exception) { return ""; }
    }
    public static int SetDefault(string id, int role) { return ((IPolicyConfig)new PolicyConfigCom()).SetDefaultEndpoint(id, role); }
    // WAVEFORMATEXTENSIBLE, PCM 16-bit stereo at the given rate = what the Sound panel calls "16 bit, 48000 Hz (DVD Quality)"
    public static int SetFormat(string id, int rate) {
      byte[] b = new byte[40];
      Action<int,int> u16 = (o, v) => { b[o] = (byte)(v & 255); b[o+1] = (byte)((v >> 8) & 255); };
      Action<int,int> u32 = (o, v) => { b[o] = (byte)(v & 255); b[o+1] = (byte)((v >> 8) & 255); b[o+2] = (byte)((v >> 16) & 255); b[o+3] = (byte)((v >> 24) & 255); };
      u16(0, 0xFFFE); u16(2, 2); u32(4, rate); u32(8, rate * 4); u16(12, 4); u16(14, 16); u16(16, 22); u16(18, 16); u32(20, 3);
      byte[] pcm = new Guid("00000001-0000-0010-8000-00aa00389b71").ToByteArray(); Array.Copy(pcm, 0, b, 24, 16);
      IntPtr ptr = Marshal.AllocHGlobal(40);
      try { Marshal.Copy(b, 0, ptr, 40); return ((IPolicyConfig)new PolicyConfigCom()).SetDeviceFormat(id, ptr, ptr); }
      finally { Marshal.FreeHGlobal(ptr); }
    }
  }
}
"@
$desc = '{a45c254e-df1c-4efd-8020-67d146a850e0},2'
$fn   = '{a45c254e-df1c-4efd-8020-67d146a850e0},14'
$adap = '{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
$root = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture'
function Plain([string]$s) { if (-not $s) { return '' }; if ($s.StartsWith('@')) { $i = $s.LastIndexOf(';'); if ($i -ge 0) { $s = $s.Substring($i + 1) } }; return $s.Trim() }
function NameOf([string]$id) {
  if (-not $id) { return '' }
  $g = $id -replace '^\{0\.0\.1\.00000000\}\.', ''
  $p = Join-Path (Join-Path $root $g) 'Properties'
  if (Test-Path $p) { $v = Get-ItemProperty $p; if ($v.$desc) { return Plain([string]$v.$desc) } }
  return $id
}
function AdapterOf([string]$id) {
  if (-not $id) { return '' }
  $g = $id -replace '^\{0\.0\.1\.00000000\}\.', ''
  $p = Join-Path (Join-Path $root $g) 'Properties'
  if (Test-Path $p) { $v = Get-ItemProperty $p; if ($v.$adap) { return Plain([string]$v.$adap) } }
  return ''
}
if ($Mode -eq 'get') {
  $ids = @([OnFleekAudio.Api]::DefaultCaptureId(0), [OnFleekAudio.Api]::DefaultCaptureId(1), [OnFleekAudio.Api]::DefaultCaptureId(2))
  $j = @{ console = NameOf($ids[0]); consoleAdapter = AdapterOf($ids[0]); multimedia = NameOf($ids[1]); multimediaAdapter = AdapterOf($ids[1]); communications = NameOf($ids[2]); communicationsAdapter = AdapterOf($ids[2]) }
  $parts = @(); foreach ($k in 'console','consoleAdapter','multimedia','multimediaAdapter','communications','communicationsAdapter') { $parts += ('"' + $k + '":"' + ([string]$j[$k]).Replace('\\','\\\\').Replace('"','') + '"') }
  '{' + ($parts -join ',') + '}'
  exit 0
}
if ($Mode -eq 'set') {
  $hit = $null
  foreach ($k in Get-ChildItem $root) {
    $p = Join-Path $k.PSPath 'Properties'; if (-not (Test-Path $p)) { continue }
    $v = Get-ItemProperty $p; $state = (Get-ItemProperty $k.PSPath).DeviceState
    if ($state -ne 1) { continue }   # 1 = active
    $d = Plain([string]$v.$desc); $f = Plain([string]$v.$fn); $a = Plain([string]$v.$adap)
    if ($Adapter -and ($a -notlike "*$Adapter*")) { continue }
    if ($d -eq $Name -or $f -like "$Name (*" -or $d -like "$Name (*") { $hit = '{0.0.1.00000000}.' + $k.PSChildName; break }
  }
  if (-not $hit) { Write-Output "NOTFOUND $Name"; exit 2 }
  foreach ($r in 0, 1, 2) { $hr = [OnFleekAudio.Api]::SetDefault($hit, $r); if ($hr -ne 0) { Write-Output ("FAILED role $r hr=0x{0:X8}" -f $hr); exit 3 } }
  Write-Output "SET $hit"; exit 0
}
# ---- formats: every ACTIVE endpoint's stored format (rate / bits / channels), both flows ----
$fmtKey = '{f19f064d-082c-4e27-bc73-6882a1bb8e4c},0'
function ParseFmt([byte[]]$b) {
  if (-not $b -or $b.Length -lt 18) { return $null }
  for ($i = 0; $i -le $b.Length - 18; $i++) {
    $tag = $b[$i] + 256 * $b[$i + 1]
    if ($tag -ne 0xFFFE -and $tag -ne 1 -and $tag -ne 3) { continue }
    $ch = $b[$i + 2] + 256 * $b[$i + 3]
    $rate = $b[$i + 4] + 256 * $b[$i + 5] + 65536 * $b[$i + 6] + 16777216 * $b[$i + 7]
    $bits = $b[$i + 14] + 256 * $b[$i + 15]
    if ($ch -ge 1 -and $ch -le 8 -and $rate -ge 8000 -and $rate -le 384000 -and ($bits -eq 8 -or $bits -eq 16 -or $bits -eq 24 -or $bits -eq 32)) { return @{ rate = $rate; bits = $bits; ch = $ch } }
  }
  return $null
}
if ($Mode -eq 'formats') {
  $out = @()
  foreach ($fl in 'Render', 'Capture') {
    $r2 = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$fl"
    foreach ($k in Get-ChildItem $r2) {
      $p = Join-Path $k.PSPath 'Properties'; if (-not (Test-Path $p)) { continue }
      if ((Get-ItemProperty $k.PSPath).DeviceState -ne 1) { continue }
      $v = Get-ItemProperty $p; $f = ParseFmt $v.$fmtKey
      $rate = 0; $bits = 0; $ch = 0; if ($f) { $rate = $f.rate; $bits = $f.bits; $ch = $f.ch }
      $out += ('{"flow":"' + $fl + '","name":"' + (Plain([string]$v.$desc)).Replace('"', '') + '","adapter":"' + (Plain([string]$v.$adap)).Replace('"', '') + '","rate":' + $rate + ',"bits":' + $bits + ',"ch":' + $ch + '}')
    }
  }
  '[' + ($out -join ',') + ']'
  exit 0
}
if ($Mode -eq 'setformat') {
  $r2 = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$Flow"
  $prefix = if ($Flow -eq 'Render') { '{0.0.0.00000000}.' } else { '{0.0.1.00000000}.' }
  $hit = $null
  foreach ($k in Get-ChildItem $r2) {
    $p = Join-Path $k.PSPath 'Properties'; if (-not (Test-Path $p)) { continue }
    if ((Get-ItemProperty $k.PSPath).DeviceState -ne 1) { continue }
    $v = Get-ItemProperty $p; $d = Plain([string]$v.$desc); $a = Plain([string]$v.$adap)
    if ($Adapter -and ($a -notlike "*$Adapter*")) { continue }
    # SPEAKER-SIDE SAFETY NET: never rewrite a Render (speaker) device's format unless its OWN current
    # name already starts with "Cable" - a real speaker is never named that, so a wrong $Name/$Adapter
    # can never reach it. (Owner reported real speakers vanishing 2026-09-13.)
    if ($Flow -eq 'Render' -and -not $d.ToLower().StartsWith('cable')) { continue }
    if ($d -eq $Name -or $d -like "$Name (*") { $hit = $prefix + $k.PSChildName; break }
  }
  if (-not $hit) { Write-Output "NOTFOUND $Name"; exit 2 }
  $hr = [OnFleekAudio.Api]::SetFormat($hit, $Rate)
  if ($hr -ne 0) { Write-Output ("FAILED hr=0x{0:X8}" -f $hr); exit 3 }
  Write-Output "SETFORMAT $hit $Rate"; exit 0
}
Write-Output "BAD MODE"; exit 1
