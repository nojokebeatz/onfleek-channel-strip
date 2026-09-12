# OnFleek Channel Strip — read / set the Windows default MICROPHONE (all three roles).
#   audio-default.ps1 get                -> JSON { console, multimedia, communications } (friendly names)
#   audio-default.ps1 set "<DeviceDesc>" -> sets the capture endpoint whose short name matches, prints "SET <id>"
# Uses the same COM interface the Sound control panel uses (IPolicyConfig). No admin needed.
param([string]$Mode = 'get', [string]$Name = '', [string]$Adapter = '')
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
Write-Output "BAD MODE"; exit 1
